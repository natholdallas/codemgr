// Package usr registers the user API routes.
package usr

import (
	"time"

	"github.com/gofiber/fiber/v3"

	"codemgr/internal/auth"
	"codemgr/internal/srv/internal"
)

var jwt = auth.Usr

// userKey buckets authenticated rate limits by user ID.
func userKey(c fiber.Ctx) string {
	if claims := jwt.Claims(c); claims != nil {
		return claims.ID
	}
	return ""
}

func Setup(api fiber.Router) {
	auth := api.Group("/auth").
		Use(internal.RateLimit(internal.IPKey, "usr:auth", 30, time.Minute))
	// The code and credential endpoints carry a second, tighter bucket: the
	// shared group limit alone would still allow 30 guesses a minute.
	auth.Post("/signup/code", internal.RateLimit(internal.IPKey, "usr:signup-code", 5, time.Minute), SignUpCode)
	auth.Post("/signup", internal.RateLimit(internal.IPKey, "usr:signup", 5, time.Minute), SignUp)
	auth.Post("/code", internal.RateLimit(internal.IPKey, "usr:code", 5, time.Minute), SendCode)
	auth.Post("/login", internal.RateLimit(internal.IPKey, "usr:login", 10, time.Minute), LoginPassword)
	auth.Post("/login/email", internal.RateLimit(internal.IPKey, "usr:login-email", 10, time.Minute), LoginEmail)
	auth.Post("/refresh", Refresh)
	auth.Post("/logout", Logout)
	auth.Post("/google", SignInGoogle)
	auth.Post("/telegram", SignInTelegram)
	api.Group("/profile", jwt.Middlewares...).
		Get("/me", FindProfile).
		Put("/me", UpdateProfile).
		Put("/password", internal.RateLimit(userKey, "usr:password", 10, time.Hour), ResetPassword).
		Post("/avatar", internal.RateLimit(userKey, "usr:avatar", 20, time.Hour), UploadAvatar).
		Delete("/avatar", DeleteAvatar).
		Put("/bind/google", BindGoogle).
		Put("/bind/telegram", BindTelegram).
		Delete("/bind/:platform", UnbindPlatform)
	api.Group("/vault", jwt.Middlewares...).
		Get("", FindVault).
		Put("", internal.RateLimit(userKey, "usr:vault", 600, time.Hour), SaveVault).
		Delete("", internal.RateLimit(userKey, "usr:vault-delete", 10, time.Hour), DeleteVault)
	api.Group("/media", jwt.Middlewares...).
		Get("", ListMedia).
		Post("", internal.RateLimit(userKey, "usr:media", 30, time.Hour), UploadMedia).
		Delete("/:id", RemoveMedia)
}
