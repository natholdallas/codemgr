// Package crypt seals server-side secrets: account identifiers (email,
// username, OAuth profile) and media files. The key comes from
// conf.App.SecretData ([crypto] key in conf.toml).
//
// Vault contents never pass through here: they are end-to-end encrypted by the
// client and the server stores the envelope as an opaque blob.
package crypt

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"strings"
	"sync"

	"codemgr/internal/conf"
)

const (
	// textPrefix marks a sealed string; EncryptString is idempotent on it.
	textPrefix = "enc:v1:"
	// fileMagic marks a sealed file; Open passes unmarked files through so
	// media written before encryption was enabled keeps working.
	fileMagic = "CMED1"
	// indexPrefix domain-separates the blind-index HMAC from the AES key.
	indexPrefix = "idx:"
)

var (
	keyOnce sync.Once
	encKey  []byte
	idxKey  []byte
	keyErr  error
)

// deriveKeys derives the AES and HMAC keys from the configured secret. A
// missing secret is an error (never a zero key): Validate requires it, but the
// one-shot scripts must fail loudly instead of silently writing unusable data.
func deriveKeys() ([]byte, []byte, error) {
	keyOnce.Do(func() {
		secret := strings.TrimSpace(conf.App.SecretData)
		if secret == "" {
			keyErr = errors.New("crypt: crypto.key is not configured")
			return
		}
		master := sha256.Sum256([]byte(secret))
		// Domain-separated subkeys: the same secret must not be used as both an
		// AES key and an HMAC key.
		enc := sha256.Sum256([]byte(string(master[:]) + ":aes"))
		idx := sha256.Sum256([]byte(string(master[:]) + ":idx"))
		encKey = enc[:]
		idxKey = idx[:]
	})
	return encKey, idxKey, keyErr
}

// IsEncryptedText reports whether s already carries the sealed-string prefix.
func IsEncryptedText(s string) bool {
	return strings.HasPrefix(s, textPrefix)
}

// EncryptString seals a plaintext value with AES-256-GCM. An already sealed
// value and the empty string are returned unchanged, which makes the GORM
// hooks safe to run on both fresh and previously sealed structs.
func EncryptString(plain string) (string, error) {
	if plain == "" || IsEncryptedText(plain) {
		return plain, nil
	}
	key, _, err := deriveKeys()
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("crypt: new cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("crypt: new gcm: %w", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("crypt: nonce: %w", err)
	}
	out := base64.StdEncoding.EncodeToString(gcm.Seal(nonce, nonce, []byte(plain), nil))
	return textPrefix + out, nil
}

// DecryptString opens a sealed value. A value without the prefix is returned
// unchanged so rows written before encryption was enabled stay readable (the
// --db-encrypt script rewrites them sealed).
func DecryptString(sealed string) (string, error) {
	if sealed == "" || !IsEncryptedText(sealed) {
		return sealed, nil
	}
	key, _, err := deriveKeys()
	if err != nil {
		return "", err
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(sealed, textPrefix))
	if err != nil {
		return "", fmt.Errorf("crypt: decode: %w", err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("crypt: new cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("crypt: new gcm: %w", err)
	}
	if len(raw) < gcm.NonceSize() {
		return "", errors.New("crypt: ciphertext too short")
	}
	nonce, body := raw[:gcm.NonceSize()], raw[gcm.NonceSize():]
	plain, err := gcm.Open(nil, nonce, body, nil)
	if err != nil {
		return "", fmt.Errorf("crypt: open: %w", err)
	}
	return string(plain), nil
}

// Index returns the deterministic blind index of a value: hexadecimal
// HMAC-SHA256 so equality lookups never need the plaintext in the database.
// The empty value maps to the empty string (no index).
func Index(value string) string {
	_, key, err := deriveKeys()
	if err != nil || value == "" {
		return ""
	}
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(indexPrefix))
	mac.Write([]byte(value))
	return hex.EncodeToString(mac.Sum(nil))
}

// IndexPtr is Index for nullable unique index columns: an empty value yields
// nil so MySQL can store many unbound rows under one unique index (NULLs are
// not compared).
func IndexPtr(value string) *string {
	if value == "" {
		return nil
	}
	idx := Index(value)
	if idx == "" {
		return nil
	}
	return &idx
}

// Seal encrypts a file body: magic || nonce || ciphertext.
func Seal(data []byte) ([]byte, error) {
	key, _, err := deriveKeys()
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("crypt: new cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("crypt: new gcm: %w", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("crypt: nonce: %w", err)
	}
	out := make([]byte, 0, len(fileMagic)+len(nonce)+len(data)+gcm.Overhead())
	out = append(out, fileMagic...)
	out = append(out, nonce...)
	return gcm.Seal(out, nonce, data, nil), nil
}

// IsSealed reports whether data carries the sealed-file magic.
func IsSealed(data []byte) bool {
	return bytes.HasPrefix(data, []byte(fileMagic))
}

// Open decrypts a sealed file body; data without the magic is returned as-is.
func Open(data []byte) ([]byte, error) {
	if !IsSealed(data) {
		return data, nil
	}
	key, _, err := deriveKeys()
	if err != nil {
		return nil, err
	}
	raw := data[len(fileMagic):]
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("crypt: new cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("crypt: new gcm: %w", err)
	}
	if len(raw) < gcm.NonceSize() {
		return nil, errors.New("crypt: ciphertext too short")
	}
	nonce, body := raw[:gcm.NonceSize()], raw[gcm.NonceSize():]
	plain, err := gcm.Open(nil, nonce, body, nil)
	if err != nil {
		return nil, fmt.Errorf("crypt: open: %w", err)
	}
	return plain, nil
}
