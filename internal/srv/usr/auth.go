package usr

import (
	"errors"
	stdmail "net/mail"
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
	"codemgr/internal/mail"
	"codemgr/internal/oauth"
	"codemgr/internal/srv/internal"
)

// Auth is what a sign-in or refresh success exposes to the browser. The refresh
// token is deliberately absent: it travels only in an httpOnly cookie, so an
// XSS bug cannot read it.
type Auth struct {
	ID          uint   `json:"id"`
	AccessToken string `json:"accessToken"`
} //	@name	UsrAuth

// CodeIn requests a verification code for an email address.
type CodeIn struct {
	Email string `json:"email" validate:"required,email,max=254"`
} //	@name	UsrCodeIn

// CodeSent is the only answer the code endpoints give: whether the address is
// registered must never be observable.
type CodeSent struct {
	Sent bool `json:"sent"`
} //	@name	UsrCodeSent

// SignUpIn registers an account after the email code is verified.
type SignUpIn struct {
	Email    string `json:"email" validate:"required,email,max=254"`
	Code     string `json:"code" validate:"required,len=6"`
	Username string `json:"username" validate:"required,min=3,max=50"`
	Password string `json:"password" validate:"required,min=8,max=64"`
} //	@name	UsrSignUpIn

// PasswordIn signs in with either the email or the username. The password has
// no length policy here on purpose: the stored hash is the gate, and a minimum
// would lock out accounts created before the policy existed.
type PasswordIn struct {
	Account  string `json:"account" validate:"required,max=254"`
	Password string `json:"password" validate:"required,max=64"`
} //	@name	UsrPasswordIn

// EmailCodeIn signs in with an emailed verification code.
type EmailCodeIn struct {
	Email string `json:"email" validate:"required,email,max=254"`
	Code  string `json:"code" validate:"required,len=6"`
} //	@name	UsrEmailCodeIn

// normalizeEmail parses and canonicalizes an address. Display-name forms
// ("Somebody <a@b.c>") are rejected so one account cannot be addressed under
// several spellings.
func normalizeEmail(raw string) (string, bool) {
	trimmed := strings.TrimSpace(raw)
	addr, err := stdmail.ParseAddress(trimmed)
	if err != nil || addr.Name != "" || !strings.EqualFold(addr.Address, trimmed) {
		return "", false
	}
	email := strings.ToLower(addr.Address)
	if len(email) > 254 || !strings.Contains(email, "@") {
		return "", false
	}
	return email, true
}

// issueTokens returns the access/refresh pair for an authenticated account.
func issueTokens(c fiber.Ctx, id uint) error {
	p, err := auth.Usr.GenPair(strs.FormatUint(id))
	if err != nil {
		return &fext.Fail{Status: fiber.StatusInternalServerError, System: err}
	}
	auth.Usr.SetRefreshCookie(c, p.RefreshToken)
	return c.JSON(Auth{ID: id, AccessToken: p.AccessToken})
}

// sendCode emails a verification code; delivery failures are logged, never
// surfaced, because an unauthenticated caller must not learn SMTP state.
func sendCode(purpose, email, code string) {
	if err := mail.SendVerificationCode("Codemgr Vault", email, code); err != nil {
		log.Warn("send verification code: ", err)
	}
}

// SignUpCode godoc
//
//	@Summary		Send a registration verification code
//	@Description	Emails a 6-digit code. The response is identical whether or not the address is already registered.
//	@Tags			usrAuth
//	@ID				usrSignUpCode
//	@Accept			json
//	@Produce		json
//	@Param			body	body		CodeIn	true	"Email"
//	@Success		200		{object}	CodeSent
//	@Failure		400		{object}	Fail
//	@Router			/usr/api/v1/auth/signup/code [post]
func SignUpCode(c fiber.Ctx) error {
	d, err := fext.BodyVarser[CodeIn](c)
	if err != nil {
		return &fext.Fail{Code: internal.InvalidData, Message: err.Error()}
	}
	email, ok := normalizeEmail(d.Email)
	if !ok {
		return &fext.Fail{Code: internal.EmailInvalid}
	}
	registered := false
	if _, err := db.FindUserByEmail(db.Tx, email); err == nil {
		registered = true
	}
	// A code is stored for every address, registered or not: the follow-up
	// /signup call must behave identically for both, otherwise it becomes an
	// account-existence oracle. Only registered addresses get a notice instead
	// of a code, and only unregistered ones get the code mail.
	code, skipped, ferr := issueCode(purposeSignUp, email)
	if ferr != nil {
		return ferr
	}
	if !skipped {
		if registered {
			if merr := mail.SendNotice(
				[]string{email},
				"Codemgr Vault sign-up",
				"An account already exists for this address. If this was you, sign in instead; otherwise ignore this message.",
			); merr != nil {
				log.Warn("send sign-up notice: ", merr)
			}
		} else {
			sendCode(purposeSignUp, email, code)
		}
	}
	return c.JSON(CodeSent{Sent: true})
}

// SignUp godoc
//
//	@Summary		Register an account
//	@Description	Verifies the emailed code, then creates the account and signs it in
//	@Tags			usrAuth
//	@ID				usrSignUp
//	@Accept			json
//	@Produce		json
//	@Param			body	body		SignUpIn	true	"Registration"
//	@Success		200		{object}	Auth
//	@Failure		400		{object}	Fail
//	@Router			/usr/api/v1/auth/signup [post]
func SignUp(c fiber.Ctx) error {
	d, err := fext.BodyVarser[SignUpIn](c)
	if err != nil {
		return &fext.Fail{Code: internal.InvalidData, Message: err.Error()}
	}
	email, ok := normalizeEmail(d.Email)
	if !ok {
		return &fext.Fail{Code: internal.EmailInvalid}
	}
	username := strings.TrimSpace(d.Username)
	if ferr := consumeCode(purposeSignUp, email, d.Code); ferr != nil {
		return ferr
	}
	if _, ferr := db.FindUserByEmail(db.Tx, email); ferr == nil {
		return &fext.Fail{Code: internal.EmailTaken}
	}
	if _, ferr := db.FindUserByUsername(db.Tx, username); ferr == nil {
		return &fext.Fail{Code: internal.UsernameTaken}
	}
	hash, err := pwd.Hash(d.Password)
	if err != nil {
		return &fext.Fail{Code: internal.InvalidData, Message: err.Error()}
	}
	v := &db.User{Email: email, Username: username, Password: hash}
	if err := orms.Create(db.Tx, v); err != nil {
		// A concurrent registration with the same identifier shows up as a
		// unique-index conflict; report the field the client can change.
		if _, ferr := db.FindUserByEmail(db.Tx, email); ferr == nil {
			return &fext.Fail{Code: internal.EmailTaken}
		}
		if _, ferr := db.FindUserByUsername(db.Tx, username); ferr == nil {
			return &fext.Fail{Code: internal.UsernameTaken}
		}
		return &fext.Fail{Code: internal.CreateFailed, System: err}
	}
	return issueTokens(c, v.ID)
}

// SendCode godoc
//
//	@Summary		Send a sign-in verification code
//	@Description	Emails a 6-digit code to a registered address. The response is identical for unknown addresses, which are never sent a message.
//	@Tags			usrAuth
//	@ID				usrSendCode
//	@Accept			json
//	@Produce		json
//	@Param			body	body		CodeIn	true	"Email"
//	@Success		200		{object}	CodeSent
//	@Failure		400		{object}	Fail
//	@Router			/usr/api/v1/auth/code [post]
func SendCode(c fiber.Ctx) error {
	d, err := fext.BodyVarser[CodeIn](c)
	if err != nil {
		return &fext.Fail{Code: internal.InvalidData, Message: err.Error()}
	}
	email, ok := normalizeEmail(d.Email)
	if !ok {
		return &fext.Fail{Code: internal.EmailInvalid}
	}
	// Store a code for every address but mail only registered ones: an unknown
	// address then answers the same at /login/email (a live code exists, so the
	// guess is "invalid" rather than "expired" for both).
	registered := false
	if _, err := db.FindUserByEmail(db.Tx, email); err == nil {
		registered = true
	}
	code, skipped, ferr := issueCode(purposeLogin, email)
	if ferr != nil {
		return ferr
	}
	if !skipped && registered {
		sendCode(purposeLogin, email, code)
	}
	return c.JSON(CodeSent{Sent: true})
}

// LoginPassword godoc
//
//	@Summary		Sign in with a password
//	@Description	Sign in with email or username plus password, returns access and refresh tokens
//	@Tags			usrAuth
//	@ID				usrSignInPassword
//	@Accept			json
//	@Produce		json
//	@Param			body	body		PasswordIn	true	"Credentials"
//	@Success		200		{object}	Auth
//	@Failure		400		{object}	Fail
//	@Router			/usr/api/v1/auth/login [post]
func LoginPassword(c fiber.Ctx) error {
	d, err := fext.BodyVarser[PasswordIn](c)
	if err != nil {
		return &fext.Fail{Code: internal.InvalidData, Message: err.Error()}
	}
	account := strings.TrimSpace(d.Account)
	if strings.Contains(account, "@") {
		normalized, ok := normalizeEmail(account)
		if !ok {
			return &fext.Fail{Code: internal.SignInFailed}
		}
		account = normalized
	}
	v, err := db.AuthUser(db.Tx, account, d.Password)
	if err != nil {
		return &fext.Fail{Code: internal.SignInFailed}
	}
	return issueTokens(c, v.ID)
}

// LoginEmail godoc
//
//	@Summary	Sign in with an emailed code
//	@Tags		usrAuth
//	@ID			usrSignInEmail
//	@Accept		json
//	@Produce	json
//	@Param		body	body		EmailCodeIn	true	"Email and code"
//	@Success	200		{object}	Auth
//	@Failure	400		{object}	Fail
//	@Router		/usr/api/v1/auth/login/email [post]
func LoginEmail(c fiber.Ctx) error {
	d, err := fext.BodyVarser[EmailCodeIn](c)
	if err != nil {
		return &fext.Fail{Code: internal.InvalidData, Message: err.Error()}
	}
	email, ok := normalizeEmail(d.Email)
	if !ok {
		return &fext.Fail{Code: internal.SignInFailed}
	}
	// The code is checked before the account lookup so an unknown address
	// fails the same way a live code with a wrong guess does.
	if ferr := consumeCode(purposeLogin, email, d.Code); ferr != nil {
		return ferr
	}
	v, err := db.FindUserByEmail(db.Tx, email)
	if err != nil {
		return &fext.Fail{Code: internal.SignInFailed}
	}
	return issueTokens(c, v.ID)
}

// Refresh godoc
//
//	@Summary		Rotate user tokens
//	@Description	Exchange the refresh cookie for a new access token and a rotated refresh cookie
//	@Tags			usrAuth
//	@ID				usrRefresh
//	@Produce		json
//	@Success		200	{object}	Auth
//	@Failure		401	{object}	Fail
//	@Router			/usr/api/v1/auth/refresh [post]
func Refresh(c fiber.Ctx) error {
	token := auth.Usr.RefreshTokenFrom(c)
	if token == "" {
		return &fext.Fail{Status: fiber.StatusUnauthorized, Code: internal.SignInFailed}
	}
	userID, err := auth.Usr.ConsumeRefresh(token)
	if err != nil {
		// The cookie is unusable (revoked, expired, replayed): clear it so the
		// browser stops resending a dead token on every request.
		auth.Usr.ClearRefreshCookie(c)
		return &fext.Fail{Status: fiber.StatusUnauthorized, Code: internal.SignInFailed}
	}
	p, err := auth.Usr.GenPair(userID)
	if err != nil {
		return &fext.Fail{Status: fiber.StatusInternalServerError, System: err}
	}
	auth.Usr.SetRefreshCookie(c, p.RefreshToken)
	return c.JSON(Auth{ID: strs.ParseUint[uint](userID), AccessToken: p.AccessToken})
}

// Logout godoc
//
//	@Summary		Revoke user refresh token
//	@Description	Revoke the refresh cookie and clear it. Idempotent: no session is not an error.
//	@Tags			usrAuth
//	@ID				usrLogout
//	@Produce		json
//	@Success		200
//	@Router			/usr/api/v1/auth/logout [post]
func Logout(c fiber.Ctx) error {
	token := auth.Usr.RefreshTokenFrom(c)
	auth.Usr.ClearRefreshCookie(c)
	if token != "" {
		if err := auth.Usr.RevokeRefresh(token); err != nil {
			log.Warn("revoke refresh token failed: ", err)
		}
	}
	return nil
}

type GoogleAuthIn struct {
	Code string `json:"code" validate:"required"`
} //	@name	UsrGoogleAuthIn

// SignInGoogle godoc
//
//	@Summary		Sign in with Google
//	@Description	Exchange a Google OAuth code for an access/refresh token pair.
//	@Description	Binds the Google account to an existing account with the same email, or creates one.
//	@Tags			usrAuth
//	@ID				usrSignInGoogle
//	@Accept			json
//	@Produce		json
//	@Param			body	body		GoogleAuthIn	true	"Google OAuth code"
//	@Success		200		{object}	Auth
//	@Failure		400		{object}	Fail
//	@Router			/usr/api/v1/auth/google [post]
func SignInGoogle(c fiber.Ctx) error {
	d, err := fext.BodyVarser[GoogleAuthIn](c)
	if err != nil {
		return &fext.Fail{Code: internal.InvalidData, Message: err.Error()}
	}
	user, err := oauth.GoogleExchange(d.Code)
	if err != nil {
		return &fext.Fail{Code: internal.OauthFailed, System: err}
	}
	if user.Email == "" {
		return &fext.Fail{Code: internal.OauthFailed, Message: "google email missing"}
	}
	if !user.VerifiedEmail {
		return &fext.Fail{Code: internal.OauthFailed, Message: "google email not verified"}
	}
	v, err := db.FindUserByGoogle(db.Tx, user.Email)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		// An account created by email registration may exist without the Google
		// binding; bind it instead of creating a second account for one person.
		if existing, merr := db.FindUserByEmail(db.Tx, user.Email); merr == nil {
			if uerr := db.UpdateGoogleInfo(db.Tx, existing.ID, user.Email, user.Name, user.Picture); uerr != nil {
				return &fext.Fail{Code: internal.UpdateFailed, System: uerr}
			}
			v = existing
		} else {
			v, err = createGoogleUser(user.Email, user.Name, user.Picture)
			if err != nil {
				return &fext.Fail{Code: internal.CreateFailed, System: err}
			}
		}
	} else if err != nil {
		return &fext.Fail{Code: internal.OperationFailed, System: err}
	}
	return issueTokens(c, v.ID)
}

// SignInTelegram godoc
//
//	@Summary		Sign in with Telegram
//	@Description	Verify the Telegram Login Widget payload and return an access/refresh token pair.
//	@Description	Creates an account automatically when no user is bound to the Telegram ID.
//	@Tags			usrAuth
//	@ID				usrSignInTelegram
//	@Accept			json
//	@Produce		json
//	@Param			body	body		oauth.TelegramAuth	true	"Signed Telegram widget payload"
//	@Success		200		{object}	Auth
//	@Failure		400		{object}	Fail
//	@Router			/usr/api/v1/auth/telegram [post]
func SignInTelegram(c fiber.Ctx) error {
	d, err := fext.BodyVarser[oauth.TelegramAuth](c)
	if err != nil {
		return &fext.Fail{Code: internal.InvalidData, Message: err.Error()}
	}
	if err = oauth.CheckTelegramAuth(&d); err != nil {
		return &fext.Fail{Code: internal.OauthFailed, System: err}
	}
	v, err := db.FindUserByTelegram(db.Tx, d.ID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		v, err = createTelegramUser(&d)
		if err != nil {
			return &fext.Fail{Code: internal.CreateFailed, System: err}
		}
	} else if err != nil {
		return &fext.Fail{Code: internal.OperationFailed, System: err}
	}
	return issueTokens(c, v.ID)
}

// oauthUsername derives a unique username (max 50 chars) from a base string.
func oauthUsername(base string) string {
	base = strings.TrimSpace(base)
	if i := strings.Index(base, "@"); i > 0 {
		base = base[:i]
	}
	var b strings.Builder
	for _, r := range base {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' {
			b.WriteRune(r)
		}
	}
	u := b.String()
	if u == "" {
		u = "user"
	}
	if len(u) > 42 {
		u = u[:42]
	}
	return u + "_" + rands.Char(4)
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func randomPassword() string {
	return pwd.TryHash(rands.Char(20))
}

// createUser inserts a generated account, retrying with a fresh username when
// the blind index collides.
func createUser(build func() *db.User) (db.User, error) {
	var lastErr error
	for range 5 {
		v := build()
		if err := orms.Create(db.Tx, v); err != nil {
			lastErr = err
			continue
		}
		return *v, nil
	}
	return db.User{}, lastErr
}

func createGoogleUser(email, name, picture string) (db.User, error) {
	return createUser(func() *db.User {
		return &db.User{
			Email:    email,
			Username: oauthUsername(email),
			Password: randomPassword(),
			GoogleInfo: db.GoogleInfo{
				Email:  email,
				Name:   name,
				Avatar: picture,
			},
		}
	})
}

func createTelegramUser(d *oauth.TelegramAuth) (db.User, error) {
	name := strings.TrimSpace(d.FirstName + " " + d.LastName)
	base := d.Username
	if base == "" {
		base = "telegram_" + d.ID
	}
	return createUser(func() *db.User {
		return &db.User{
			Username: oauthUsername(base),
			Password: randomPassword(),
			TelegramInfo: db.TelegramInfo{
				ID:     d.ID,
				Name:   name,
				Avatar: d.PhotoURL,
			},
		}
	})
}
