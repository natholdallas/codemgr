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

type Auth struct {
	ID           uint   `json:"id"`
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
} //	@name	AdmAuth

type AuthIn struct {
	Username string `json:"username" validate:"required"`
	Password string `json:"password" validate:"required,min=4,max=20"`
} //	@name	AdmAuthIn

type RefreshIn struct {
	RefreshToken string `json:"refreshToken" validate:"required"`
} //	@name	AdmRefreshIn

// Login godoc
//
//	@Summary		Admin sign in
//	@Description	Sign in with username and password, returns access and refresh tokens
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
	return c.JSON(Auth{v.ID, p.AccessToken, p.RefreshToken})
}

// Refresh godoc
//
//	@Summary		Rotate admin tokens
//	@Description	Exchange a valid refresh token for a new access/refresh pair
//	@Tags			admAuth
//	@ID				admRefresh
//	@Accept			json
//	@Produce		json
//	@Param			body	body		RefreshIn	true	"Refresh token"
//	@Success		200		{object}	Auth
//	@Failure		400		{object}	Fail
//	@Router			/adm/api/v1/auth/refresh [post]
func Refresh(c fiber.Ctx) error {
	d, err := fext.BodyVarser[RefreshIn](c)
	if err != nil {
		return &fext.Fail{Code: internal.InvalidData, Message: err.Error()}
	}
	userID, err := auth.Adm.VerifyRefresh(d.RefreshToken)
	if err != nil {
		return &fext.Fail{Code: internal.SignInFailed, Message: "invalid refresh token"}
	}
	if err = auth.Adm.RevokeRefresh(d.RefreshToken); err != nil {
		log.Warn("revoke refresh token failed: ", err)
	}
	p, err := auth.Adm.GenPair(userID)
	if err != nil {
		return &fext.Fail{Status: fiber.StatusInternalServerError, System: err}
	}
	return c.JSON(Auth{strs.ParseUint[uint](userID), p.AccessToken, p.RefreshToken})
}

// Logout godoc
//
//	@Summary		Revoke admin refresh token
//	@Description	Revoke the given refresh token so it can no longer be used
//	@Tags			admAuth
//	@ID				admLogout
//	@Accept			json
//	@Produce		json
//	@Param			body	body	RefreshIn	true	"Refresh token"
//	@Success		200
//	@Failure		400	{object}	Fail
//	@Router			/adm/api/v1/auth/logout [post]
func Logout(c fiber.Ctx) error {
	d, err := fext.BodyVarser[RefreshIn](c)
	if err != nil {
		return &fext.Fail{Code: internal.InvalidData, Message: err.Error()}
	}
	if err := auth.Adm.RevokeRefresh(d.RefreshToken); err != nil {
		return &fext.Fail{Status: fiber.StatusInternalServerError, System: err}
	}
	return nil
}
