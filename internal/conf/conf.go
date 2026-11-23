// Package conf used to configuration vars on runtime
package conf

import (
	"fmt"
	"strings"

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
