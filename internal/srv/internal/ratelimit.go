package internal

import (
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/log"
	"github.com/natholdallas/natools4go/fext"
	"github.com/redis/go-redis/v9"

	"codemgr/internal/db"
)

// KeyFunc derives the rate-limit bucket key from a request.
type KeyFunc func(fiber.Ctx) string

// IPKey buckets by client IP, for endpoints that run before authentication.
//
// The real peer is authoritative. Only a loopback peer is our own reverse
// proxy (matching fiber.Config.TrustProxyConfig), and only then is the header
// read — taking the RIGHTMOST entry, the one the proxy appended, because
// everything to its left came from the client and is attacker-chosen.
func IPKey(c fiber.Ctx) string {
	peer := c.RequestCtx().RemoteIP()
	if peer == nil {
		return ""
	}
	if !peer.IsLoopback() {
		return peer.String()
	}
	ips := c.IPs()
	if len(ips) > 0 {
		return ips[len(ips)-1]
	}
	return peer.String()
}

// limitScript increments and, on the first hit, starts the expiry atomically.
var limitScript = redis.NewScript(`
local n = redis.call("INCR", KEYS[1])
if n == 1 then redis.call("PEXPIRE", KEYS[1], ARGV[1]) end
return n
`)

// RateLimit allows limit requests per window per keyFunc bucket. It fails open
// on Redis errors: the limiter is a hardening layer, not an authorization gate,
// and Redis availability is already checked at startup.
func RateLimit(keyFunc KeyFunc, scope string, limit int64, window time.Duration) fiber.Handler {
	prefix := "rl:" + scope + ":"
	return func(c fiber.Ctx) error {
		if db.Rx == nil {
			return c.Next()
		}
		key := keyFunc(c)
		if key == "" {
			return c.Next()
		}
		n, err := limitScript.Run(db.Rc, db.Rx, []string{prefix + key}, window.Milliseconds()).Int64()
		if err != nil {
			log.Warn("rate limit: ", err)
			return c.Next()
		}
		if n > limit {
			c.Set(fiber.HeaderRetryAfter, strconv.FormatInt(int64(window.Seconds())+1, 10))
			return &fext.Fail{Status: fiber.StatusTooManyRequests, Code: TooManyRequests}
		}
		return c.Next()
	}
}
