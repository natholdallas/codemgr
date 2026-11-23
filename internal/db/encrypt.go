package db

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"

	"codemgr/internal/conf"
	"codemgr/internal/crypt"
)

// EncryptData seals every plaintext row and media file written before
// server-side encryption existed. Re-running it is harmless: sealing an
// already sealed value leaves it unchanged and already sealed files are
// skipped, so only the user rows are rewritten.
func EncryptData() (users int, files int, err error) {
	var rows []User
	if ferr := Tx.Find(&rows).Error; ferr != nil {
		return 0, 0, fmt.Errorf("load users: %w", ferr)
	}
	for i := range rows {
		// AfterFind already decrypted the row; Save re-seals it and refreshes
		// every blind index.
		if ferr := Tx.Save(&rows[i]).Error; ferr != nil {
			return users, 0, fmt.Errorf("seal user %d: %w", rows[i].ID, ferr)
		}
		users++
	}
	files, err = sealMediaFiles()
	return users, files, err
}

// sealMediaFiles walks the media directory and seals each plaintext file in
// place. Files that already carry the sealed magic are left untouched.
func sealMediaFiles() (int, error) {
	var sealed int
	err := filepath.WalkDir(conf.App.RMedia, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || entry.Name() == ".gitkeep" {
			return nil
		}
		raw, rerr := os.ReadFile(path)
		if rerr != nil {
			return rerr
		}
		if crypt.IsSealed(raw) {
			return nil
		}
		out, serr := crypt.Seal(raw)
		if serr != nil {
			return serr
		}
		if werr := os.WriteFile(path, out, 0o600); werr != nil {
			return werr
		}
		sealed++
		return nil
	})
	if err != nil {
		return sealed, fmt.Errorf("seal media: %w", err)
	}
	return sealed, nil
}
