package internal

import (
	"errors"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/log"
	"github.com/natholdallas/natools4go/fext"
	"github.com/natholdallas/natools4go/orms"
	"github.com/natholdallas/natools4go/rands"
	"gorm.io/gorm"

	"codemgr/internal/conf"
	"codemgr/internal/crypt"
	"codemgr/internal/db"
)

// Kind classifies an uploaded file and drives its validation rules.
type Kind string

const (
	KindImage Kind = "image"
	KindVideo Kind = "video"
	KindFile  Kind = "file"
)

// kindConf holds the allowed extension and MIME rules for one kind.
type kindConf struct {
	exts  []string
	mimes []string
}

var kindConfs = map[Kind]kindConf{
	KindImage: {
		exts:  []string{".jpg", ".jpeg", ".png", ".webp", ".gif"},
		mimes: []string{"image/jpeg", "image/png", "image/webp", "image/gif"},
	},
	KindVideo: {
		exts:  []string{".mp4", ".webm", ".mov", ".m4v"},
		mimes: []string{"video/mp4", "video/webm", "video/quicktime"},
	},
	KindFile: {
		exts: []string{
			".pdf", ".zip", ".gz", ".7z", ".rar", ".doc", ".docx",
			".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".md", ".csv",
		},
	},
}

// avatarConf is deliberately narrower than KindImage: animated GIFs make poor
// avatars and the client always uploads a cropped PNG.
var avatarConf = kindConf{
	exts:  []string{".jpg", ".jpeg", ".png", ".webp"},
	mimes: []string{"image/jpeg", "image/png", "image/webp"},
}

// maxAvatarDimension caps the decoded pixel size so a tiny file cannot
// decompress into gigabytes of bitmap on the client.
const maxAvatarDimension = 4096

// KindOf infers the media kind from a filename extension, falling back to
// KindFile. Uploads that omit the "kind" field must not reject plain images.
func KindOf(filename string) Kind {
	ext := strings.ToLower(filepath.Ext(filename))
	if ext == "" {
		return KindFile
	}
	for _, k := range []Kind{KindImage, KindVideo} {
		if slices.Contains(kindConfs[k].exts, ext) {
			return k
		}
	}
	return KindFile
}

// safeFileMIME reports whether a sniffed MIME type may be served statically
// without running active content (blocks HTML/SVG/JS/XML that could XSS).
func safeFileMIME(mime string) bool {
	blocked := []string{
		"text/html", "application/xhtml+xml", "image/svg+xml",
		"application/javascript", "text/javascript", "application/x-javascript",
		"application/xml", "text/xml", "application/x-httpd-php",
	}
	if slices.Contains(blocked, mime) {
		return false
	}
	allowed := []string{
		"image/", "video/", "audio/", "text/plain", "application/pdf",
		"application/zip", "application/gzip", "application/x-tar",
		"application/x-7z-compressed", "application/x-rar-compressed",
		"application/vnd.rar", "application/x-gzip", "application/x-bzip2",
		"application/x-xz",
		"application/msword", "application/vnd.openxmlformats-officedocument.",
		"application/vnd.ms-", "application/json", "application/octet-stream",
	}
	for _, p := range allowed {
		if strings.HasPrefix(mime, p) {
			return true
		}
	}
	return false
}

// sniffMIME sniffs the real content type of an uploaded file using its first
// bytes instead of trusting the client-provided filename extension.
func sniffMIME(file *multipart.FileHeader) string {
	src, err := file.Open()
	if err != nil {
		return ""
	}
	defer src.Close()
	buf := make([]byte, 512)
	n, err := src.Read(buf)
	if err != nil && err != io.EOF {
		return ""
	}
	return http.DetectContentType(buf[:n])
}

// SaveFile validates and stores an uploaded file of the given kind, returning
// the persisted media record.
func SaveFile(c fiber.Ctx, file *multipart.FileHeader, kind Kind, userID uint) (*db.Media, error) {
	cf, ok := kindConfs[kind]
	if !ok {
		return nil, &fext.Fail{Code: InvalidMedia, Message: "unsupported media kind"}
	}

	suffix := strings.ToLower(filepath.Ext(file.Filename))
	if suffix == "" || !slices.Contains(cf.exts, suffix) {
		return nil, &fext.Fail{Code: InvalidMedia, Message: "invalid file extension"}
	}

	if max := int64(conf.App.MediaMaxSize) * 1024 * 1024; max > 0 && file.Size > max {
		return nil, &fext.Fail{Code: InvalidMedia, Message: "file too large"}
	}

	mime := sniffMIME(file)
	if kind == KindFile {
		if !safeFileMIME(mime) {
			return nil, &fext.Fail{Code: InvalidMedia, Message: "file type not allowed"}
		}
	} else if !slices.Contains(cf.mimes, mime) {
		return nil, &fext.Fail{Code: InvalidMedia, Message: "file content does not match its extension"}
	}

	return storeFile(c, file, kind, suffix, mime, userID)
}

// SaveAvatar validates an avatar upload (extension, size, sniffed MIME and
// decoded pixel dimensions) and stores the original bytes unmodified. The
// client is responsible for cropping the image to a square.
func SaveAvatar(c fiber.Ctx, file *multipart.FileHeader, userID uint) (*db.Media, error) {
	suffix := strings.ToLower(filepath.Ext(file.Filename))
	if suffix == "" || !slices.Contains(avatarConf.exts, suffix) {
		return nil, &fext.Fail{Code: InvalidMedia, Message: "invalid avatar extension"}
	}

	if max := int64(conf.App.AvatarMaxSize) * 1024 * 1024; max > 0 && file.Size > max {
		return nil, &fext.Fail{Code: InvalidMedia, Message: "avatar too large"}
	}

	mime := sniffMIME(file)
	if !slices.Contains(avatarConf.mimes, mime) {
		return nil, &fext.Fail{Code: InvalidMedia, Message: "invalid avatar image"}
	}
	if err := checkAvatarDimensions(file, mime); err != nil {
		return nil, err
	}

	return storeFile(c, file, KindImage, suffix, mime, userID)
}

// checkAvatarDimensions decodes only the image header to bound the bitmap a
// client would allocate. WebP has no stdlib decoder, so its MIME check stands
// alone there.
func checkAvatarDimensions(file *multipart.FileHeader, mime string) error {
	if mime == "image/webp" {
		return nil
	}
	src, err := file.Open()
	if err != nil {
		return &fext.Fail{Code: InvalidMedia, Message: "invalid avatar image"}
	}
	defer src.Close()
	cfg, _, err := image.DecodeConfig(src)
	if err != nil || cfg.Width <= 0 || cfg.Height <= 0 {
		return &fext.Fail{Code: InvalidMedia, Message: "invalid avatar image"}
	}
	if cfg.Width > maxAvatarDimension || cfg.Height > maxAvatarDimension {
		return &fext.Fail{Code: InvalidMedia, Message: "avatar dimensions too large"}
	}
	return nil
}

// storeFile writes an already validated upload under a dated sub-directory and
// persists its media row, removing the file again if the DB write fails.
func storeFile(
	c fiber.Ctx,
	file *multipart.FileHeader,
	kind Kind,
	suffix, mime string,
	userID uint,
) (*db.Media, error) {
	path := time.Now().Format("2006/01") + "/" + rands.Char(20) + suffix
	dest := conf.App.RMedia + "/" + path
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return nil, &fext.Fail{Status: fiber.StatusInternalServerError, System: err}
	}
	src, err := file.Open()
	if err != nil {
		return nil, &fext.Fail{Status: fiber.StatusInternalServerError, System: err}
	}
	raw, err := io.ReadAll(src)
	if cerr := src.Close(); cerr != nil {
		log.Warn("close upload: ", cerr)
	}
	if err != nil {
		return nil, &fext.Fail{Status: fiber.StatusInternalServerError, System: err}
	}
	// Files are sealed at rest; the size limit was already checked against the
	// upload header, and the body limit caps the request itself.
	sealed, err := crypt.Seal(raw)
	if err != nil {
		return nil, &fext.Fail{Status: fiber.StatusInternalServerError, System: err}
	}
	if err := os.WriteFile(dest, sealed, 0o600); err != nil {
		return nil, &fext.Fail{Status: fiber.StatusInternalServerError, System: err}
	}

	v := db.Media{
		Name:   file.Filename,
		Path:   path,
		URL:    conf.App.MediaBase() + "/" + path,
		MIME:   mime,
		Kind:   string(kind),
		Size:   file.Size,
		UserID: userID,
	}
	if err := db.Tx.Save(&v).Error; err != nil {
		if remErr := os.Remove(dest); remErr != nil {
			log.Warn("remove media file after DB failure: ", remErr)
		}
		return nil, &fext.Fail{Code: UploadFailed, System: err}
	}
	return &v, nil
}

// ServeMedia decrypts a sealed media file and streams it back. The disk holds
// ciphertext only, so the reverse proxy must reach the backend for media
// instead of serving the directory directly.
func ServeMedia(c fiber.Ctx) error {
	rel := path.Clean("/" + strings.TrimPrefix(c.Params("*"), "/"))[1:]
	if rel == "" || path.IsAbs(rel) || strings.Contains(rel, "..") {
		return &fext.Fail{Status: fiber.StatusNotFound}
	}
	v, err := orms.First[db.Media](db.Tx, "path = ?", rel)
	if err != nil {
		return &fext.Fail{Status: fiber.StatusNotFound}
	}
	raw, err := os.ReadFile(v.LocalPath())
	if err != nil {
		return &fext.Fail{Status: fiber.StatusNotFound}
	}
	plain, err := crypt.Open(raw)
	if err != nil {
		log.Warn("open media: ", err)
		return &fext.Fail{Status: fiber.StatusNotFound}
	}
	c.Set(fiber.HeaderContentType, v.MIME)
	c.Set(fiber.HeaderCacheControl, "public, max-age=86400")
	return c.Send(plain)
}

// AvatarInUse reports whether any user currently points at the given media URL.
// A failed lookup returns false: blocking an admin delete on a transient DB
// error would be worse than allowing the delete.
func AvatarInUse(url string) bool {
	if url == "" {
		return false
	}
	var n int64
	if err := db.Tx.Model(&db.User{}).Where("avatar = ?", url).Count(&n).Error; err != nil {
		log.Warn("count avatar usage: ", err)
		return false
	}
	return n > 0
}

// RemoveMediaByURL deletes the media row (and file) owned by userID for the
// given URL. Only the owner's row is removed so shared URLs are never dropped,
// and a missing row is not an error: the avatar URL may predate the row.
func RemoveMediaByURL(userID uint, url string) {
	if url == "" {
		return
	}
	v, err := orms.First[db.Media](db.Tx, "user_id = ? AND url = ?", userID, url)
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			log.Warn("find media by url: ", err)
		}
		return
	}
	if err := db.RemoveByID(db.Tx, v.ID); err != nil {
		log.Warn("remove media by url: ", err)
	}
}

// ParseUploadFile reads the "file" field from the multipart request.
func ParseUploadFile(c fiber.Ctx) (*multipart.FileHeader, error) {
	file, err := c.FormFile(UploadFormFile)
	if err != nil {
		return nil, &fext.Fail{Code: InvalidData, System: err}
	}
	return file, nil
}
