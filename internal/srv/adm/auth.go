package adm

import (
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/log"
	"github.com/natholdallas/natools4go/fext"
	"github.com/natholdallas/natools4go/strs"

	"codemgr/internal/auth"
	"codemgr/internal/db"
	"codemgr/internal/srv/internal"
)

// Auth is what an admin sign-in or refresh exposes. The refresh token is
// deliberately absent: it travels only in an httpOnly cookie, so an XSS bug
// cannot read it.
type Auth struct {
	ID          uint   `json:"id"`
	AccessToken string `json:"accessToken"`
} //	@name	AdmAuth

type AuthIn struct {
	Username string `json:"username" validate:"required"`
	Password string `json:"password" validate:"required,max=64"`
} //	@name	AdmAuthIn

// Login godoc
//
//	@Summary		Admin sign in
//	@Description	Sign in with username and password; returns an access token and sets the refresh cookie
//	@Tags			admAuth
//	@ID				admSignIn
//	@Accept			json
//	@Produce		json
//	@Param			body	body		AuthIn	true	"Credentials"
//	@Success		200		{object}	Auth
//	@Failure		400		{object}	Fail
//	@Router			/adm/api/v1/auth/login [post]
func Login(c fiber.Ctx) error {
	d, err := fext.BodyVarser[AuthIn](c)
	if err != nil {
		return &fext.Fail{Code: internal.InvalidData, Message: err.Error()}
	}
	v, err := db.AuthAdmin(db.Tx, d.Username, d.Password)
	if err != nil {
		return &fext.Fail{Code: internal.SignInFailed}
	}
	p, err := auth.Adm.GenPair(strs.FormatUint(v.ID))
	if err != nil {
		return &fext.Fail{Status: fiber.StatusInternalServerError, System: err}
	}
	auth.Adm.SetRefreshCookie(c, p.RefreshToken)
	return c.JSON(Auth{ID: v.ID, AccessToken: p.AccessToken})
}

// Refresh godoc
//
//	@Summary		Rotate admin tokens
//	@Description	Exchange the refresh cookie for a new access token and a rotated refresh cookie
//	@Tags			admAuth
//	@ID				admRefresh
//	@Produce		json
//	@Success		200	{object}	Auth
//	@Failure		401	{object}	Fail
//	@Router			/adm/api/v1/auth/refresh [post]
func Refresh(c fiber.Ctx) error {
	token := auth.Adm.RefreshTokenFrom(c)
	if token == "" {
		return &fext.Fail{Status: fiber.StatusUnauthorized, Code: internal.SignInFailed}
	}
	userID, err := auth.Adm.ConsumeRefresh(token)
	if err != nil {
		// The cookie is unusable (revoked, expired, replayed): clear it so the
		// browser stops resending a dead token on every request.
		auth.Adm.ClearRefreshCookie(c)
		return &fext.Fail{Status: fiber.StatusUnauthorized, Code: internal.SignInFailed}
	}
	p, err := auth.Adm.GenPair(userID)
	if err != nil {
		return &fext.Fail{Status: fiber.StatusInternalServerError, System: err}
	}
	auth.Adm.SetRefreshCookie(c, p.RefreshToken)
	return c.JSON(Auth{ID: strs.ParseUint[uint](userID), AccessToken: p.AccessToken})
}

// Logout godoc
//
//	@Summary		Revoke admin refresh token
//	@Description	Revoke the refresh cookie and clear it. Idempotent: no session is not an error.
//	@Tags			admAuth
//	@ID				admLogout
//	@Produce		json
//	@Success		200
//	@Router			/adm/api/v1/auth/logout [post]
func Logout(c fiber.Ctx) error {
	token := auth.Adm.RefreshTokenFrom(c)
	auth.Adm.ClearRefreshCookie(c)
	if token != "" {
		if err := auth.Adm.RevokeRefresh(token); err != nil {
			log.Warn("revoke refresh token failed: ", err)
		}
	}
	return nil
}
