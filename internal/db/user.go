package db

import (
	"strings"

	"github.com/natholdallas/natools4go/orms"
	"github.com/natholdallas/natools4go/pwd"
	"gorm.io/gorm"

	"codemgr/internal/crypt"
)

// User is an account. Every identifier that could identify a person (email,
// username, OAuth profile) is sealed with the server key and looked up through
// a deterministic blind index, so the database and its backups carry no
// readable PII. The password stays an Argon2id hash.
type User struct {
	orms.Model[uint]
	Username      string       `gorm:"column:username;type:text;comment:Username (encrypted)" json:"username"`                                   // Username (encrypted)
	UsernameIndex *string      `gorm:"column:username_index;size:64;uniqueIndex:uni_users_username_index;comment:Username blind index" json:"-"` // Username blind index
	Password      string       `gorm:"column:password;size:255;comment:Password (argon2id)" json:"-"`                                            // Password (argon2id)
	Email         string       `gorm:"column:email;type:text;comment:Email (encrypted)" json:"email"`                                            // Email (encrypted)
	EmailIndex    *string      `gorm:"column:email_index;size:64;uniqueIndex:uni_users_email_index;comment:Email blind index" json:"-"`          // Email blind index
	Avatar        string       `gorm:"column:avatar;size:512;comment:Avatar URL" json:"avatar"`                                                  // Avatar URL
	GoogleInfo    GoogleInfo   `gorm:"embedded;embeddedPrefix:google_" json:"-"`                                                                 // Google login info
	TelegramInfo  TelegramInfo `gorm:"embedded;embeddedPrefix:telegram_" json:"-"`                                                               // Telegram login info
} //	@name	User

// GoogleInfo holds the Google login bindings (columns prefixed google_). An
// empty value means "not bound"; the index is NULL in that case so the unique
// constraint allows any number of unbound accounts.
type GoogleInfo struct {
	Email      string  `gorm:"column:email;type:text;comment:Google email (encrypted)" json:"email"`                                          // Google email (encrypted)
	EmailIndex *string `gorm:"column:email_index;size:64;uniqueIndex:uni_users_google_email_index;comment:Google email blind index" json:"-"` // Google email blind index
	Name       string  `gorm:"column:name;type:text;comment:Google display name (encrypted)" json:"name"`                                     // Google display name (encrypted)
	Avatar     string  `gorm:"column:avatar;type:text;comment:Google avatar URL (encrypted)" json:"avatar"`                                   // Google avatar URL (encrypted)
} //	@name	GoogleInfo

// TelegramInfo holds the Telegram login bindings (columns prefixed telegram_).
type TelegramInfo struct {
	ID      string  `gorm:"column:id;type:text;comment:Telegram user ID (encrypted)" json:"id"`                                       // Telegram user ID (encrypted)
	IDIndex *string `gorm:"column:id_index;size:64;uniqueIndex:uni_users_telegram_id_index;comment:Telegram ID blind index" json:"-"` // Telegram ID blind index
	Name    string  `gorm:"column:name;type:text;comment:Telegram display name (encrypted)" json:"name"`                              // Telegram display name (encrypted)
	Avatar  string  `gorm:"column:avatar;type:text;comment:Telegram avatar URL (encrypted)" json:"avatar"`                            // Telegram avatar URL (encrypted)
} //	@name	TelegramInfo

// normalizeKey is the canonical form every blind index is computed from:
// trimming and case-folding means "User@Example.com" and "user@example.com"
// resolve to the same account.
func normalizeKey(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

// encryptAll seals every field in place, aborting on the first failure so a
// half-sealed row is never written.
func encryptAll(fields ...*string) error {
	for _, field := range fields {
		sealed, err := crypt.EncryptString(*field)
		if err != nil {
			return err
		}
		*field = sealed
	}
	return nil
}

// decryptAll opens every field in place. Decryption failures propagate: a row
// sealed with a different key must surface as an error, not as ciphertext in
// an API response.
func decryptAll(fields ...*string) error {
	for _, field := range fields {
		plain, err := crypt.DecryptString(*field)
		if err != nil {
			return err
		}
		*field = plain
	}
	return nil
}

// BeforeSave seals the identifiers and refreshes every blind index. The index
// is computed from the plaintext, so it must be written before encryption
// (EncryptString is idempotent, but indexes are not).
func (u *User) BeforeSave(*gorm.DB) error {
	u.UsernameIndex = crypt.IndexPtr(normalizeKey(u.Username))
	u.EmailIndex = crypt.IndexPtr(normalizeKey(u.Email))
	u.GoogleInfo.EmailIndex = crypt.IndexPtr(normalizeKey(u.GoogleInfo.Email))
	u.TelegramInfo.IDIndex = crypt.IndexPtr(normalizeKey(u.TelegramInfo.ID))
	return encryptAll(
		&u.Username,
		&u.Email,
		&u.GoogleInfo.Email,
		&u.GoogleInfo.Name,
		&u.GoogleInfo.Avatar,
		&u.TelegramInfo.ID,
		&u.TelegramInfo.Name,
		&u.TelegramInfo.Avatar,
	)
}

// AfterFind opens the identifiers so every caller (handlers, scripts, JSON
// responses) only ever sees plaintext.
func (u *User) AfterFind(*gorm.DB) error {
	return decryptAll(
		&u.Username,
		&u.Email,
		&u.GoogleInfo.Email,
		&u.GoogleInfo.Name,
		&u.GoogleInfo.Avatar,
		&u.TelegramInfo.ID,
		&u.TelegramInfo.Name,
		&u.TelegramInfo.Avatar,
	)
}

// FindUserByEmail resolves an account by its email blind index.
func FindUserByEmail(tx *gorm.DB, email string) (User, error) {
	idx := crypt.Index(normalizeKey(email))
	if idx == "" {
		return User{}, gorm.ErrRecordNotFound
	}
	return orms.First[User](tx, "email_index = ?", idx)
}

// FindUserByUsername resolves an account by its username blind index.
func FindUserByUsername(tx *gorm.DB, username string) (User, error) {
	idx := crypt.Index(normalizeKey(username))
	if idx == "" {
		return User{}, gorm.ErrRecordNotFound
	}
	return orms.First[User](tx, "username_index = ?", idx)
}

// FindUserByGoogle returns the user bound to the given Google email.
func FindUserByGoogle(tx *gorm.DB, email string) (User, error) {
	idx := crypt.Index(normalizeKey(email))
	if idx == "" {
		return User{}, gorm.ErrRecordNotFound
	}
	return orms.First[User](tx, "google_email_index = ?", idx)
}

// FindUserByTelegram returns the user bound to the given Telegram numeric ID.
func FindUserByTelegram(tx *gorm.DB, id string) (User, error) {
	idx := crypt.Index(normalizeKey(id))
	if idx == "" {
		return User{}, gorm.ErrRecordNotFound
	}
	return orms.First[User](tx, "telegram_id_index = ?", idx)
}

// AuthUser verifies a password for an email-or-username account.
func AuthUser(tx *gorm.DB, account, password string) (User, error) {
	var (
		v   User
		err error
	)
	if strings.Contains(account, "@") {
		v, err = FindUserByEmail(tx, account)
	} else {
		v, err = FindUserByUsername(tx, account)
	}
	if err != nil {
		return v, err
	}
	if pwd.Verify(password, v.Password) {
		return v, nil
	}
	if !pwd.IsHashed(v.Password) && v.Password == password {
		if hash, err := pwd.Hash(password); err == nil {
			if uerr := UpdateUserPassword(tx, v.ID, hash); uerr != nil {
				return v, uerr
			}
		}
		return v, nil
	}
	return v, gorm.ErrRecordNotFound
}

// sealIndexed seals a value and returns it together with its blind index.
func sealIndexed(value string) (string, *string, error) {
	sealed, err := crypt.EncryptString(value)
	if err != nil {
		return "", nil, err
	}
	return sealed, crypt.IndexPtr(normalizeKey(value)), nil
}

// UpdateUsername writes the display name and its blind index in one statement.
// GORM map updates skip the model hooks, so every encrypted column needs a
// helper like this one.
func UpdateUsername(tx *gorm.DB, id uint, username string) error {
	username = strings.TrimSpace(username)
	sealed, idx, err := sealIndexed(username)
	if err != nil {
		return err
	}
	return orms.UpdatesByID[User](tx, id, map[string]any{
		"username":       sealed,
		"username_index": idx,
	})
}

// UpdateEmail writes the account email and its blind index.
func UpdateEmail(tx *gorm.DB, id uint, email string) error {
	email = strings.TrimSpace(email)
	sealed, idx, err := sealIndexed(email)
	if err != nil {
		return err
	}
	return orms.UpdatesByID[User](tx, id, map[string]any{
		"email":       sealed,
		"email_index": idx,
	})
}

// UpdateUserPassword writes an already-hashed password.
func UpdateUserPassword(tx *gorm.DB, id uint, hash string) error {
	return orms.UpdatesByID[User](tx, id, map[string]any{"password": hash})
}

// UpdateGoogleInfo seals and stores the Google binding.
func UpdateGoogleInfo(tx *gorm.DB, id uint, email, name, avatar string) error {
	sealedEmail, idx, err := sealIndexed(strings.TrimSpace(email))
	if err != nil {
		return err
	}
	sealedName, err := crypt.EncryptString(name)
	if err != nil {
		return err
	}
	sealedAvatar, err := crypt.EncryptString(avatar)
	if err != nil {
		return err
	}
	return orms.UpdatesByID[User](tx, id, map[string]any{
		"google_email":       sealedEmail,
		"google_email_index": idx,
		"google_name":        sealedName,
		"google_avatar":      sealedAvatar,
	})
}

// UpdateTelegramInfo seals and stores the Telegram binding.
func UpdateTelegramInfo(tx *gorm.DB, id uint, telegramID, name, avatar string) error {
	sealedID, idx, err := sealIndexed(strings.TrimSpace(telegramID))
	if err != nil {
		return err
	}
	sealedName, err := crypt.EncryptString(name)
	if err != nil {
		return err
	}
	sealedAvatar, err := crypt.EncryptString(avatar)
	if err != nil {
		return err
	}
	return orms.UpdatesByID[User](tx, id, map[string]any{
		"telegram_id":       sealedID,
		"telegram_id_index": idx,
		"telegram_name":     sealedName,
		"telegram_avatar":   sealedAvatar,
	})
}

// ClearGoogleInfo removes the Google binding and its index.
func ClearGoogleInfo(tx *gorm.DB, id uint) error {
	return orms.UpdatesByID[User](tx, id, map[string]any{
		"google_email":       nil,
		"google_email_index": nil,
		"google_name":        nil,
		"google_avatar":      nil,
	})
}

// ClearTelegramInfo removes the Telegram binding and its index.
func ClearTelegramInfo(tx *gorm.DB, id uint) error {
	return orms.UpdatesByID[User](tx, id, map[string]any{
		"telegram_id":       nil,
		"telegram_id_index": nil,
		"telegram_name":     nil,
		"telegram_avatar":   nil,
	})
}
