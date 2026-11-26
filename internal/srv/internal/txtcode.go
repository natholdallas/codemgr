// Package internal
package internal

// common
const (
	RecordNotFound  = "err.record.not.found"
	CreateFailed    = "err.data.create"
	UpdateFailed    = "err.data.update"
	RemoveFailed    = "err.data.remove"
	SignInFailed    = "err.sign.in.failed"
	OperationFailed = "err.operation.failed"
	InvalidData     = "err.invalid.data"
	InvalidMedia    = "err.invalid.media"
	UploadFailed    = "err.upload.failed"
	OauthFailed     = "err.oauth.failed"
	MediaInUse      = "err.media.in.use"
	TooManyRequests = "err.too.many.requests"
)

// media
const (
	UploadFormFile = "file" // multipart field name
)

// auth
const (
	EmailInvalid  = "err.email.invalid"
	EmailTaken    = "err.email.taken"
	UsernameTaken = "err.username.taken"
	CodeInvalid   = "err.code.invalid"
	CodeExpired   = "err.code.expired"
	CodeTooMany   = "err.code.too.many"
)

// vault
const (
	VaultConflict = "err.vault.conflict"
)
