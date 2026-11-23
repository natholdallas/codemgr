package adm

import (
	"errors"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/log"
	"github.com/natholdallas/natools4go/fext"
	"github.com/natholdallas/natools4go/orms"
	"github.com/natholdallas/natools4go/pwd"
	"github.com/natholdallas/natools4go/rands"
	"github.com/natholdallas/natools4go/strs"
	"gorm.io/gorm"

	"codemgr/internal/auth"
	"codemgr/internal/db"
	"codemgr/internal/srv/internal"
)

type UserQueries struct {
	orms.Sorter
	orms.Pagination
} //	@name	AdmUserQueries

type UsersPage struct {
	Total   int64     `json:"total"`
	Page    int64     `json:"page"`
	Content []db.User `json:"content"`
} //	@name	AdmUsersPage

type UserIn struct {
	Email    string `json:"email" validate:"required,email,max=254"`
	Username string `json:"username" validate:"required,min=3,max=50"`
	Password string `json:"password" validate:"required,min=8,max=64"`
} //	@name	AdmUserIn

type UserUpdateIn struct {
	Email    string `json:"email" validate:"required,email,max=254"`
	Username string `json:"username" validate:"required,min=3,max=50"`
	Password string `json:"password" validate:"omitempty,min=8,max=64"`
} //	@name	AdmUserUpdateIn

// normalizeEmail lowercases and trims an address the validator already
// accepted.
func normalizeEmail(raw string) string {
	return strings.ToLower(strings.TrimSpace(raw))
}

func (s *UserIn) Get() (*db.User, error) {
	hash, err := pwd.Hash(s.Password)
	if err != nil {
		return nil, err
	}
	return &db.User{
		Email:    normalizeEmail(s.Email),
		Username: strings.TrimSpace(s.Username),
		Password: hash,
	}, nil
}

// ListUser godoc
//
//	@Summary	List Users
//	@Tags		admUser
//	@ID			admListUsers
//	@Accept		json
//	@Produce	json
//	@Security	ApiKeyAuth
//	@Param		query	query		UserQueries	false	"Query params"
//	@Success	200		{object}	UsersPage
//	@Router		/adm/api/v1/user [get]
func ListUser(c fiber.Ctx) error {
	q, err := fext.QueryParser[UserQueries](c)
	if err != nil {
		return &fext.Fail{Code: internal.InvalidData, Message: err.Error()}
	}
	v := orms.QE[db.User](db.Tx).
		Scopes(q.Sorter.Scope).
		IPaginate(q.Pagination)
	return c.JSON(v)
}

// FindUser godoc
//
//	@Summary	Find User by ID
//	@Tags		admUser
//	@ID			admFindUser
//	@Accept		json
//	@Produce	json
//	@Security	ApiKeyAuth
//	@Param		id	path		int	true	"User ID"
//	@Success	200	{object}	User
//	@Router		/adm/api/v1/user/{id} [get]
func FindUser(c fiber.Ctx) error {
	id, err := internal.ParseID(c)
	if err != nil {
		return err
	}
	v, err := orms.First[db.User](db.Tx, id)
	if err != nil {
		return &fext.Fail{Code: internal.RecordNotFound, System: err, Status: fiber.StatusNotFound}
	}
	return c.JSON(v)
}

// CreateUser godoc
//
//	@Summary	Create User
//	@Tags		admUser
//	@ID			admCreateUser
//	@Accept		json
//	@Produce	json
//	@Security	ApiKeyAuth
//	@Param		body	body		UserIn	true	"User object"
//	@Success	200		{object}	db.User
//	@Failure	400		{object}	Fail
//	@Router		/adm/api/v1/user [post]
func CreateUser(c fiber.Ctx) error {
	d, err := fext.BodyVarser[UserIn](c)
	if err != nil {
		return &fext.Fail{Code: internal.InvalidData, Message: err.Error()}
	}
	v, err := d.Get()
	if err != nil {
		return &fext.Fail{Code: internal.InvalidData, Message: err.Error()}
	}
	if err := orms.Create(db.Tx, v); err != nil {
		return &fext.Fail{Code: internal.CreateFailed, System: err}
	}
	return nil
}

// UpdateUser godoc
//
//	@Summary	Update User
//	@Tags		admUser
//	@ID			admUpdateUser
//	@Accept		json
//	@Produce	json
//	@Security	ApiKeyAuth
//	@Param		id		path	int				true	"User ID"
//	@Param		body	body	UserUpdateIn	true	"User object"
//	@Success	200
//	@Failure	400	{object}	Fail
//	@Router		/adm/api/v1/user/{id} [put]
func UpdateUser(c fiber.Ctx) error {
	id, err := internal.ParseID(c)
	if err != nil {
		return err
	}
	d, err := fext.BodyVarser[UserUpdateIn](c)
	if err != nil {
		return &fext.Fail{Code: internal.InvalidData, Message: err.Error()}
	}
	email := normalizeEmail(d.Email)
	username := strings.TrimSpace(d.Username)
	current, err := orms.First[db.User](db.Tx, id)
	if err != nil {
		return &fext.Fail{Code: internal.RecordNotFound, Status: fiber.StatusNotFound}
	}
	if existing, ferr := db.FindUserByEmail(db.Tx, email); ferr == nil && existing.ID != id {
		return &fext.Fail{Code: internal.EmailTaken}
	}
	if existing, ferr := db.FindUserByUsername(db.Tx, username); ferr == nil && existing.ID != id {
		return &fext.Fail{Code: internal.UsernameTaken}
	}
	if err := db.UpdateEmail(db.Tx, id, email); err != nil {
		return &fext.Fail{Code: internal.UpdateFailed, System: err}
	}
	if err := db.UpdateUsername(db.Tx, id, username); err != nil {
		return &fext.Fail{Code: internal.UpdateFailed, System: err}
	}
	if d.Password != "" {
		hash, herr := pwd.Hash(d.Password)
		if herr != nil {
			return &fext.Fail{Code: internal.InvalidData, Message: herr.Error()}
		}
		if uerr := db.UpdateUserPassword(db.Tx, id, hash); uerr != nil {
			return &fext.Fail{Code: internal.UpdateFailed, System: uerr}
		}
	}
	// A changed password or sign-in address must invalidate every session.
	if d.Password != "" || email != normalizeEmail(current.Email) {
		if rerr := auth.Usr.RevokeAll(strs.FormatUint(id)); rerr != nil {
			log.Warn("revoke refresh tokens: ", rerr)
		}
	}
	return nil
}

// RemoveUser godoc
//
//	@Summary	Remove User
//	@Tags		admUser
//	@ID			admDeleteUser
//	@Accept		json
//	@Produce	json
//	@Security	ApiKeyAuth
//	@Param		id	path	int	true	"User ID"
//	@Success	200
//	@Router		/adm/api/v1/user/{id} [delete]
func RemoveUser(c fiber.Ctx) error {
	id, err := internal.ParseID(c)
	if err != nil {
		return err
	}
	v, err := orms.First[db.User](db.Tx, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &fext.Fail{Code: internal.RecordNotFound, Status: fiber.StatusNotFound}
		}
		return &fext.Fail{Code: internal.RemoveFailed, System: err}
	}
	affected, err := orms.DeleteByID[db.User](db.Tx, id)
	if err != nil {
		return &fext.Fail{Code: internal.RemoveFailed, System: err}
	}
	if affected == 0 {
		return &fext.Fail{Code: internal.RecordNotFound, Status: fiber.StatusNotFound}
	}
	internal.RemoveMediaByURL(id, v.Avatar)
	if err := auth.Usr.RevokeAll(strs.FormatUint(id)); err != nil {
		log.Warn("revoke refresh tokens: ", err)
	}
	return nil
}

type ResetUserPasswordOut struct {
	Password string `json:"password"`
} //	@name	AdmResetUserPassword

// ResetUserPassword godoc
//
//	@Summary		Reset User password
//	@Description	Reset a user password to a new random one, returned once
//	@Tags			admUser
//	@ID				admResetUserPassword
//	@Accept			json
//	@Produce		json
//	@Security		ApiKeyAuth
//	@Param			id	path		int	true	"User ID"
//	@Success		200	{object}	ResetUserPasswordOut
//	@Failure		400	{object}	Fail
//	@Router			/adm/api/v1/user/{id}/reset-password [post]
func ResetUserPassword(c fiber.Ctx) error {
	id, err := internal.ParseID(c)
	if err != nil {
		return err
	}
	plain := rands.Char(20)
	hash, err := pwd.Hash(plain)
	if err != nil {
		return &fext.Fail{Code: internal.InvalidData, Message: err.Error()}
	}
	if err := db.UpdateUserPassword(db.Tx, id, hash); err != nil {
		return &fext.Fail{Code: internal.UpdateFailed, System: err}
	}
	if err := auth.Usr.RevokeAll(strs.FormatUint(id)); err != nil {
		log.Warn("revoke refresh tokens: ", err)
	}
	return c.JSON(ResetUserPasswordOut{Password: plain})
}
