package db

import "github.com/natholdallas/natools4go/orms"

// Vault is the single end-to-end-encrypted envelope a user uploads so other
// devices can sync. The server never sees plaintext: Blob is an opaque JSON
// document produced by the client's WebCrypto layer.
type Vault struct {
	orms.Model[uint]
	UserID  uint   `gorm:"column:user_id;uniqueIndex:idx_vault_user;not null;comment:Owner user ID" json:"user_id"`              // Owner user ID
	Blob    string `gorm:"column:blob;type:longtext;not null;comment:Client-side encrypted envelope (JSON)" json:"-"`            // Client-side encrypted envelope (JSON)
	Version int64  `gorm:"column:version;not null;default:1;comment:Revision counter for optimistic concurrency" json:"version"` // Revision counter for optimistic concurrency
	Size    int    `gorm:"column:size;not null;default:0;comment:Envelope size in bytes" json:"size"`                            // Envelope size in bytes
} //	@name	Vault
