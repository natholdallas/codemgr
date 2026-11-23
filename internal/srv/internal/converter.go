package internal

import (
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"github.com/natholdallas/natools4go/fext"

	"codemgr/internal/conf"
)

func Log(prefix string) fiber.Handler {
	return logger.New(logger.Config{
		TimeFormat: time.DateTime,
		Format:     "[" + prefix + "]" + fext.StdLogFmt,
		Stream:     conf.App.LogWriter(),
	})
}
