package usr

import (
	"encoding/json"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/natholdallas/natools4go/fext"
	"github.com/natholdallas/natools4go/orms"
	"github.com/natholdallas/natools4go/strs"
	"gorm.io/gorm"

	"codemgr/internal/db"
	"codemgr/internal/srv/internal"
)

type VaultInfo struct {
	Exists    bool      `json:"exists"`
	Blob      string    `json:"blob"`
	Version   int64     `json:"version"`
	Size      int       `json:"size"`
	UpdatedAt time.Time `json:"updatedAt"`
} //	@name	UsrVaultInfo

type VaultIn struct {
	Blob    string `json:"blob" validate:"required,max=8000000"`
	Version int64  `json:"version" validate:"gte=0"`
} //	@name	UsrVaultIn

type VaultSaved struct {
	Version   int64     `json:"version"`
	Size      int       `json:"size"`
	UpdatedAt time.Time `json:"updatedAt"`
} //	@name	UsrVaultSaved

// vaultOwner resolves the authenticated user ID. A token without a usable
// numeric subject is treated as unauthenticated rather than as user 0, which
// would otherwise match rows owned by nobody.
func vaultOwner(c fiber.Ctx) (uint, error) {
	claims := jwt.Claims(c)
	if claims == nil {
		return 0, &fext.Fail{Status: fiber.StatusUnauthorized, Code: internal.SignInFailed}
	}
	uid := strs.ParseUint[uint](claims.ID)
	if uid == 0 {
		return 0, &fext.Fail{Status: fiber.StatusUnauthorized, Code: internal.SignInFailed}
	}
	return uid, nil
}

// findVault loads the caller's envelope row.
func findVault(uid uint) (db.Vault, error) {
	return orms.First[db.Vault](db.Tx, "user_id = ?", uid)
}

// FindVault godoc
//
//	@Summary		Find the current user's vault
//	@Description	Returns the encrypted envelope, or exists=false when none was uploaded yet
//	@Tags			usrVault
//	@ID				usrFindVault
//	@Accept			json
//	@Produce		json
//	@Security		ApiKeyAuth
//	@Success		200	{object}	VaultInfo
//	@Router			/usr/api/v1/vault [get]
func FindVault(c fiber.Ctx) error {
	uid, err := vaultOwner(c)
	if err != nil {
		return err
	}
	v, err := findVault(uid)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return c.JSON(VaultInfo{})
		}
		return &fext.Fail{Code: internal.OperationFailed, System: err}
	}
	return c.JSON(VaultInfo{
		Exists:    true,
		Blob:      v.Blob,
		Version:   v.Version,
		Size:      v.Size,
		UpdatedAt: v.UpdatedAt,
	})
}

// SaveVault godoc
//
//	@Summary		Create or update the current user's vault
//	@Description	Version 0 creates the envelope; a positive version updates it only when it matches the stored revision
//	@Tags			usrVault
//	@ID				usrSaveVault
//	@Accept			json
//	@Produce		json
//	@Security		ApiKeyAuth
//	@Param			body	body		VaultIn	true	"Vault object"
//	@Success		200		{object}	VaultSaved
//	@Failure		400		{object}	Fail
//	@Failure		409		{object}	Fail
//	@Router			/usr/api/v1/vault [put]
func SaveVault(c fiber.Ctx) error {
	uid, err := vaultOwner(c)
	if err != nil {
		return err
	}
	d, err := fext.BodyVarser[VaultIn](c)
	if err != nil {
		return &fext.Fail{Code: internal.InvalidData, Message: err.Error()}
	}
	// The blob must be a JSON document: everything downstream (envelope
	// parsing on other devices) assumes it, and rejecting it here keeps
	// non-JSON payloads out of the table entirely.
	if !json.Valid([]byte(d.Blob)) {
		return &fext.Fail{Code: internal.InvalidData, Message: "blob must be valid JSON"}
	}
	if d.Version == 0 {
		v := &db.Vault{UserID: uid, Blob: d.Blob, Version: 1, Size: len(d.Blob)}
		if cerr := orms.Create(db.Tx, v); cerr != nil {
			// A unique-index violation means another device created the row
			// first; report it as a conflict so the client merges instead of
			// assuming a transient failure.
			if _, ferr := findVault(uid); ferr == nil {
				return &fext.Fail{Status: fiber.StatusConflict, Code: internal.VaultConflict}
			}
			return &fext.Fail{Code: internal.CreateFailed, System: cerr}
		}
		return c.JSON(VaultSaved{Version: v.Version, Size: v.Size, UpdatedAt: v.UpdatedAt})
	}
	res := db.Tx.Model(&db.Vault{}).
		Where("user_id = ? AND version = ?", uid, d.Version).
		Updates(map[string]any{
			"blob":    d.Blob,
			"size":    len(d.Blob),
			"version": gorm.Expr("version + 1"),
		})
	if res.Error != nil {
		return &fext.Fail{Code: internal.UpdateFailed, System: res.Error}
	}
	if res.RowsAffected == 0 {
		return &fext.Fail{Status: fiber.StatusConflict, Code: internal.VaultConflict}
	}
	v, err := findVault(uid)
	if err != nil {
		return &fext.Fail{Code: internal.RecordNotFound, System: err}
	}
	return c.JSON(VaultSaved{Version: v.Version, Size: v.Size, UpdatedAt: v.UpdatedAt})
}

// DeleteVault godoc
//
//	@Summary		Delete the current user's vault
//	@Description	Removes the cloud copy; deleting an absent vault is not an error
//	@Tags			usrVault
//	@ID				usrDeleteVault
//	@Accept			json
//	@Produce		json
//	@Security		ApiKeyAuth
//	@Success		200
//	@Failure		400	{object}	Fail
//	@Router			/usr/api/v1/vault [delete]
func DeleteVault(c fiber.Ctx) error {
	uid, err := vaultOwner(c)
	if err != nil {
		return err
	}
	if err := db.Tx.Where("user_id = ?", uid).Delete(&db.Vault{}).Error; err != nil {
		return &fext.Fail{Code: internal.RemoveFailed, System: err}
	}
	return nil
}
