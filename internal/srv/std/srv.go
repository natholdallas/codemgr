// Package std registers the public (unauthenticated) API routes.
package std

import (
	"github.com/gofiber/fiber/v3"
)

func Setup(api fiber.Router) {
	api.Group("/config").
		Get("", FindConfig)
}
