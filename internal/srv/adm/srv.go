// Package adm registers the admin API routes.
package adm

import (
	"time"

	"github.com/gofiber/fiber/v3"

	"codemgr/internal/auth"
	"codemgr/internal/srv/internal"
)

var jwt = auth.Adm

// userKey buckets authenticated rate limits by admin ID.
func userKey(c fiber.Ctx) string {
	if claims := jwt.Claims(c); claims != nil {
		return claims.ID
	}
	return ""
}

func Setup(api fiber.Router) {
	api.Group("/auth").
		Use(internal.RateLimit(internal.IPKey, "adm:auth", 30, time.Minute)).
		Post("/login", internal.RateLimit(internal.IPKey, "adm:login", 10, time.Minute), Login).
		Post("/refresh", Refresh).
		Post("/logout", Logout)
	api.Group("/profile", jwt.Middlewares...).
		Get("/me", FindProfile).
		Put("/me", UpdateProfile).
		Put("/password", internal.RateLimit(userKey, "adm:password", 10, time.Hour), ResetPassword).
		Post("/avatar", internal.RateLimit(userKey, "adm:avatar", 20, time.Hour), UploadAvatar).
		Delete("/avatar", DeleteAvatar)
	api.Group("/user", jwt.Middlewares...).
		Get("", ListUser).
		Get("/:id", FindUser).
		Post("", CreateUser).
		Put("/:id", UpdateUser).
		Delete("/:id", RemoveUser).
		Post("/:id/reset-password", ResetUserPassword)
	api.Group("/admin", jwt.Middlewares...).
		Get("", ListAdmin).
		Get("/:id", FindAdmin).
		Post("", CreateAdmin).
		Put("/:id", UpdateAdmin).
		Delete("/:id", RemoveAdmin).
		Post("/:id/reset-password", ResetAdminPassword)
	api.Group("/stat", jwt.Middlewares...).
		Get("", GetStats)
	api.Group("/media", jwt.Middlewares...).
		Get("", ListMedia).
		Post("", internal.RateLimit(userKey, "adm:media", 60, time.Hour), UploadMedia).
		Delete("/:id", RemoveMedia)
}
