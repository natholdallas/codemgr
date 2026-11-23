// Package srv to setup server
package srv

import (
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/recover"
	"github.com/gofiber/fiber/v3/middleware/requestid"
	"github.com/gofiber/fiber/v3/middleware/static"
	"github.com/natholdallas/natools4go/fext"
	"github.com/natholdallas/natools4go/strs"

	"codemgr/internal/conf"
	"codemgr/internal/srv/adm"
	"codemgr/internal/srv/internal"
	"codemgr/internal/srv/std"
	"codemgr/internal/srv/swg"
	"codemgr/internal/srv/usr"
)

func Setup() {
	app := fiber.New(fiber.Config{
		AppName:      conf.App.Name,
		ErrorHandler: fext.ErrorHandler,
		BodyLimit:    conf.App.BodyLimit * 1024 * 1024,
		// Only a loopback proxy (the bundled nginx) may set the client IP;
		// a direct client cannot forge X-Forwarded-For for rate-limit buckets.
		ProxyHeader:        fiber.HeaderXForwardedFor,
		TrustProxy:         true,
		TrustProxyConfig:   fiber.TrustProxyConfig{Loopback: true},
		EnableIPValidation: true,
	})
	// Without an explicit recover middleware a single panicking handler takes
	// the whole process down: Fiber v3 does not install one by default.
	app.Use(recover.New())
	app.Use(func(c fiber.Ctx) error {
		c.Set(fiber.HeaderXContentTypeOptions, "nosniff")
		return c.Next()
	})
	app.Use(requestid.New())
	app.Use(cors.New(cors.Config{
		AllowOriginsFunc: internal.AllowOriginsFunc,
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"},
		AllowHeaders:     []string{"Content-Type", "Authorization", "X-Request-ID"},
		ExposeHeaders:    []string{"Content-Length", "X-Request-ID"},
	}))
	// Media lives on disk as ciphertext, so every request is decrypted by the
	// backend; the web server proxies /media instead of serving the directory.
	app.Get(conf.App.MediaRoute+"/*", internal.ServeMedia)
	app.Use("/", static.New(conf.App.RWeb, static.Config{
		Next: internal.NginxMiddleware,
	}))
	app.Get("/favicon.ico", static.New("./assets/favicon.ico"))
	std.Setup(app.Group("/api/v1").Use(internal.Log("GEN")))
	adm.Setup(app.Group("/adm/api/v1").Use(internal.Log("ADM")))
	usr.Setup(app.Group("/usr/api/v1").Use(internal.Log("USR")))
	swg.Setup(app.Group("/doc/api/v1").Use(internal.Log("DOC")))
	fext.MustListen(app, strs.ToStart(conf.App.Port, strs.Colon))
}
