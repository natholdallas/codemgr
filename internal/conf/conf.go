// Package conf used to configuration vars on runtime
package conf

import (
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v3/log"
	"github.com/natholdallas/natools4go/vipers"
)

var (
	Flag *FlagConf = new(FlagConf)
	App  *AppConf  = new(AppConf)
)

func init() {
	LoadFlag()
	LoadApp()
}

func Validate() {
	vipers.MustValidate(Flag)
	vipers.MustValidate(App)
	validateDatabase()
	// The body limit caps the whole request, so it must fit the largest single
	// file we accept; otherwise the upload is rejected before its own check.
	if App.BodyLimit < max(App.MediaMaxSize, App.AvatarMaxSize) {
		panic(fmt.Errorf(
			"app.body-limit (%d MB) must be >= resources.media-max-size and resources.media-avatar-max-size",
			App.BodyLimit,
		))
	}
	// The two audiences are separated only by their signing secret. Sharing one
	// would let a user token authorize the admin API.
	if App.SecretAdm == App.SecretUsr {
		panic("jwt.secret.adm and jwt.secret.usr must differ: a shared secret lets a user token authorize the admin API")
	}
	// A deployed instance must not echo system errors back to clients or fall
	// back to the development CORS allowlist.
	if App.Debug && App.Nginx {
		panic("app.debug must be false when app.nginx is true: a deployed instance must not echo system errors or use the dev CORS allowlist")
	}
	if App.Swagger && App.Nginx {
		log.Warn("app.swagger is true while app.nginx is true: the API reference is publicly reachable")
	}
}

// validateDatabase enforces the connection fields each driver actually needs.
// A blanket `validate:"required"` on host/port/credentials made sqlite unusable:
// a file database needs none of them.
func validateDatabase() {
	switch App.DBDriver {
	case "sqlite", "sqlite3":
		return
	}
	var missing []string
	if App.DBHost == "" {
		missing = append(missing, "db.host")
	}
	if App.DBPort == "" {
		missing = append(missing, "db.port")
	}
	if len(missing) > 0 {
		panic(fmt.Errorf("missing required configuration:\n\t%s", strings.Join(missing, "\n\t")))
	}
}
