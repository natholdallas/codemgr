// Package auth provides access/refresh JWT pairs backed by Redis revocation.
package auth

import (
	"errors"
	"fmt"
	"time"

	jwtware "github.com/gofiber/contrib/v3/jwt"
	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/natholdallas/natools4go/fext"
	"github.com/natholdallas/natools4go/rands"
	"github.com/natholdallas/natools4go/strs"
	"github.com/redis/go-redis/v9"

	"codemgr/internal/conf"
	"codemgr/internal/db"
)

// Claims is the JWT claim set of both token kinds. Access and refresh tokens
// are signed with the same secret, so Typ is the only thing that separates
// them: without it a long-lived refresh token is also a valid access token.
type Claims struct {
	jwt.RegisteredClaims
	Typ string `json:"typ"`
}

const (
	// TokenAccess marks an access token: short-lived, carries the numeric user
	// ID in ID, and is the only kind the route middleware accepts.
	TokenAccess = "access"
	// TokenRefresh marks a refresh token: long-lived, carries the token ID in
	// ID and the numeric user ID in Subject.
	TokenRefresh = "refresh"
)

// Pair is an access token and its matching refresh token.
type Pair struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
}

// Auth manages token issuance and refresh-token revocation for one audience.
type Auth struct {
	SecretKey  string
	Prefix     string
	AccessTTL  time.Duration
	RefreshTTL time.Duration
	// Middlewares parses the bearer token and rejects everything that is not a
	// live access token. It replaces the single handler of a plain JWT wrapper:
	// the signature check alone would let a refresh token through. The element
	// type is any because fiber.Router.Group takes variadic any.
	Middlewares []any
}

// New builds an Auth manager. Prefix (e.g. "adm"/"usr") namespaces the Redis keys.
func New(secretKey, prefix string, accessTTL, refreshTTL time.Duration) Auth {
	a := Auth{secretKey, prefix, accessTTL, refreshTTL, nil}
	a.Middlewares = a.buildMiddlewares()
	return a
}

// Usr and Adm are the process-wide token managers. They are built once from
// the loaded configuration; the configuration is never reloaded at runtime.
var (
	Usr = New(
		conf.App.SecretUsr,
		"usr",
		time.Duration(conf.App.AccessMinutes)*time.Minute,
		time.Duration(conf.App.RefreshHours)*time.Hour,
	)
	Adm = New(
		conf.App.SecretAdm,
		"adm",
		time.Duration(conf.App.AccessMinutes)*time.Minute,
		time.Duration(conf.App.RefreshHours)*time.Hour,
	)
)

func (a *Auth) redisKey(jti string) string {
	return fmt.Sprintf("%s:refresh:%s", a.Prefix, jti)
}

// redisUserKey is the set of live refresh token IDs issued to one user, so a
// password change can invalidate every session at once.
func (a *Auth) redisUserKey(userID string) string {
	return fmt.Sprintf("%s:refresh:user:%s", a.Prefix, userID)
}

// sign serialises claims with HS256 under the audience's secret.
func (a *Auth) sign(claims *Claims) (string, error) {
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(a.SecretKey))
}

// parse verifies a token's signature and returns its claims. Only HMAC
// signatures are accepted, so an "alg: none" or RSA header cannot be used to
// bypass verification.
func (a *Auth) parse(token string) (*Claims, error) {
	claims := &Claims{}
	if _, err := jwt.ParseWithClaims(token, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(a.SecretKey), nil
	}); err != nil {
		return nil, err
	}
	return claims, nil
}

// buildMiddlewares returns the parse-and-verify chain every protected route
// mounts. A refresh token passes the signature check, so the type marker and
// the numeric access subject are what actually gate the request.
func (a *Auth) buildMiddlewares() []any {
	parse := jwtware.New(jwtware.Config{
		SigningKey:   jwtware.SigningKey{Key: []byte(a.SecretKey)},
		ErrorHandler: fext.JWTErrorHandler,
		Claims:       &Claims{},
	})
	guard := func(c fiber.Ctx) error {
		t := jwtware.FromContext(c)
		if t == nil {
			return &fext.Fail{Status: fiber.StatusUnauthorized}
		}
		cl, ok := t.Claims.(*Claims)
		if !ok || cl.Typ != TokenAccess || strs.ParseUint[uint](cl.ID) == 0 {
			return &fext.Fail{Status: fiber.StatusUnauthorized}
		}
		return c.Next()
	}
	return []any{parse, guard}
}

// Claims returns the verified access claims of the request, or nil when the
// request is not authenticated.
func (a *Auth) Claims(c fiber.Ctx) *Claims {
	t := jwtware.FromContext(c)
	if t == nil {
		return nil
	}
	cl, ok := t.Claims.(*Claims)
	if !ok {
		return nil
	}
	return cl
}

// GenPair issues an access token and a refresh token for the given user ID.
// The refresh token is recorded in Redis so it can be revoked or rotated.
func (a *Auth) GenPair(userID string) (Pair, error) {
	now := time.Now()
	access, err := a.sign(&Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        userID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(a.AccessTTL)),
		},
		Typ: TokenAccess,
	})
	if err != nil {
		return Pair{}, err
	}
	jti := rands.Char(32)
	refresh, err := a.sign(&Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        jti,
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(a.RefreshTTL)),
		},
		Typ: TokenRefresh,
	})
	if err != nil {
		return Pair{}, err
	}
	if db.Rx == nil {
		return Pair{}, errors.New("redis unavailable")
	}
	// A refresh token that is not recorded in Redis can never be redeemed:
	// ConsumeRefresh looks the jti up and treats a miss as revoked. Failing here
	// is better than handing the client a token that is dead on arrival.
	userKey := a.redisUserKey(userID)
	pipe := db.Rx.TxPipeline()
	pipe.Set(db.Rc, a.redisKey(jti), userID, a.RefreshTTL)
	pipe.SAdd(db.Rc, userKey, jti)
	pipe.Expire(db.Rc, userKey, a.RefreshTTL)
	if _, err := pipe.Exec(db.Rc); err != nil {
		return Pair{}, fmt.Errorf("store refresh token: %w", err)
	}
	return Pair{access, refresh}, nil
}

// ConsumeRefresh validates a refresh token and atomically burns its jti, so
// two concurrent replays of the same token can never both mint a new pair.
func (a *Auth) ConsumeRefresh(token string) (string, error) {
	claims, err := a.parse(token)
	if err != nil {
		return "", err
	}
	if claims.Typ != TokenRefresh || claims.ID == "" || claims.Subject == "" {
		return "", errors.New("invalid refresh token")
	}
	if db.Rx == nil {
		return "", errors.New("redis unavailable")
	}
	val, err := db.Rx.GetDel(db.Rc, a.redisKey(claims.ID)).Result()
	if err == redis.Nil {
		return "", errors.New("refresh token revoked")
	}
	if err != nil {
		return "", err
	}
	if val != claims.Subject {
		return "", errors.New("refresh token mismatch")
	}
	if _, err := db.Rx.SRem(db.Rc, a.redisUserKey(claims.Subject), claims.ID).Result(); err != nil {
		return "", err
	}
	return claims.Subject, nil
}

// RevokeRefresh invalidates the given refresh token in Redis.
func (a *Auth) RevokeRefresh(token string) error {
	claims, err := a.parse(token)
	if err != nil {
		return err
	}
	if claims.Typ != TokenRefresh || claims.ID == "" {
		return errors.New("invalid refresh token")
	}
	if db.Rx == nil {
		return errors.New("redis unavailable")
	}
	pipe := db.Rx.TxPipeline()
	pipe.Del(db.Rc, a.redisKey(claims.ID))
	if claims.Subject != "" {
		pipe.SRem(db.Rc, a.redisUserKey(claims.Subject), claims.ID)
	}
	_, err = pipe.Exec(db.Rc)
	return err
}

// RevokeAll invalidates every refresh token issued to the given user.
func (a *Auth) RevokeAll(userID string) error {
	if userID == "" {
		return errors.New("invalid user id")
	}
	if db.Rx == nil {
		return errors.New("redis unavailable")
	}
	userKey := a.redisUserKey(userID)
	jtis, err := db.Rx.SMembers(db.Rc, userKey).Result()
	if err != nil {
		return err
	}
	pipe := db.Rx.TxPipeline()
	for _, jti := range jtis {
		pipe.Del(db.Rc, a.redisKey(jti))
	}
	pipe.Del(db.Rc, userKey)
	_, err = pipe.Exec(db.Rc)
	return err
}

// refreshCookieName namespaces the cookie per audience so one browser can hold
// a user and an admin session at once.
func (a *Auth) refreshCookieName() string {
	return a.Prefix + "_refresh"
}

// refreshCookiePath keeps the token off every endpoint except the auth routes.
func (a *Auth) refreshCookiePath() string {
	return "/" + a.Prefix + "/api/v1/auth"
}

// SetRefreshCookie stores the refresh token where JavaScript cannot read it.
// SameSite=Lax is enough as long as the frontend and the API are on the same
// registrable domain (main.sh derives both from domains[]); a genuinely
// cross-site deployment must switch to SameSite=None plus HTTPS.
func (a *Auth) SetRefreshCookie(c fiber.Ctx, token string) {
	c.Cookie(&fiber.Cookie{
		Name:     a.refreshCookieName(),
		Value:    token,
		Path:     a.refreshCookiePath(),
		MaxAge:   int(a.RefreshTTL.Seconds()),
		Secure:   !conf.App.Debug,
		HTTPOnly: true,
		SameSite: fiber.CookieSameSiteLaxMode,
	})
}

// ClearRefreshCookie expires the cookie; logout must work even when the token
// it held was already gone.
func (a *Auth) ClearRefreshCookie(c fiber.Ctx) {
	c.Cookie(&fiber.Cookie{
		Name:     a.refreshCookieName(),
		Value:    "",
		Path:     a.refreshCookiePath(),
		MaxAge:   -1,
		Expires:  time.Unix(1, 0),
		Secure:   !conf.App.Debug,
		HTTPOnly: true,
		SameSite: fiber.CookieSameSiteLaxMode,
	})
}

// RefreshTokenFrom reads the audience's refresh cookie; empty means "no session".
func (a *Auth) RefreshTokenFrom(c fiber.Ctx) string {
	return c.Cookies(a.refreshCookieName())
}
