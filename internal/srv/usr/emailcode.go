package usr

import (
	"crypto/subtle"
	"errors"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/natholdallas/natools4go/fext"
	"github.com/redis/go-redis/v9"

	"codemgr/internal/crypt"
	"codemgr/internal/db"
	"codemgr/internal/mail"
	"codemgr/internal/srv/internal"
)

// The only two purposes a verification code is issued for. They are part of
// the Redis key, so a sign-up code cannot be replayed at the login endpoint.
const (
	purposeSignUp = "signup"
	purposeLogin  = "login"
)

const (
	// codeTTL bounds how long a code stays valid.
	codeTTL = 10 * time.Minute
	// codeCooldown suppresses resend spam for the same address.
	codeCooldown = 60 * time.Second
	// codeMaxTries caps guesses per issued code.
	codeMaxTries = 5
	// codeKeySpace prefixes every verification-code key.
	codeKeySpace = "usr:vcode:"
)

// codeKey is the Redis hash key for one purpose+address pair. The address
// never appears in the key: it is hashed with the server key.
func codeKey(purpose, email string) string {
	return codeKeySpace + purpose + ":" + crypt.Index(email)
}

// operationFailed reports a storage failure as a server error: a failed write
// must never look like "code sent".
func operationFailed(err error) error {
	return &fext.Fail{Status: fiber.StatusInternalServerError, Code: internal.OperationFailed, System: err}
}

// issueCode generates and stores a code. The boolean result is true when the
// cooldown suppressed a resend (the caller must not send the returned value).
func issueCode(purpose, email string) (string, bool, error) {
	key := codeKey(purpose, email)
	ok, err := db.Rx.SetNX(db.Rc, key+":cooldown", "1", codeCooldown).Result()
	if err != nil {
		return "", false, operationFailed(err)
	}
	if !ok {
		return "", true, nil
	}
	code := mail.GenerateVerificationCode()
	// Stored value is a keyed hash: a leaked Redis snapshot does not reveal
	// usable codes, and comparison stays constant-time.
	hashed := crypt.Index("code:" + purpose + ":" + email + ":" + code)
	pipe := db.Rx.TxPipeline()
	pipe.Set(db.Rc, key, hashed, codeTTL)
	pipe.Del(db.Rc, key+":tries")
	if _, err := pipe.Exec(db.Rc); err != nil {
		return "", false, operationFailed(err)
	}
	return code, false, nil
}

// consumeCode verifies and burns a code. Attempts are counted before the
// comparison, so a guessing loop cannot exceed codeMaxTries.
func consumeCode(purpose, email, code string) error {
	key := codeKey(purpose, email)
	stored, err := db.Rx.Get(db.Rc, key).Result()
	if errors.Is(err, redis.Nil) {
		return &fext.Fail{Code: internal.CodeExpired}
	}
	if err != nil {
		return operationFailed(err)
	}
	tries, err := db.Rx.Incr(db.Rc, key+":tries").Result()
	if err != nil {
		return operationFailed(err)
	}
	if tries == 1 {
		if err := db.Rx.Expire(db.Rc, key+":tries", codeTTL).Err(); err != nil {
			return operationFailed(err)
		}
	}
	if tries > codeMaxTries {
		return &fext.Fail{Code: internal.CodeTooMany}
	}
	expected := crypt.Index("code:" + purpose + ":" + email + ":" + code)
	if subtle.ConstantTimeCompare([]byte(stored), []byte(expected)) != 1 {
		return &fext.Fail{Code: internal.CodeInvalid}
	}
	pipe := db.Rx.TxPipeline()
	pipe.Del(db.Rc, key, key+":tries")
	if _, err := pipe.Exec(db.Rc); err != nil {
		return operationFailed(err)
	}
	return nil
}
