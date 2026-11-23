// Package client use resty to make http request
package client

import (
	"crypto/tls"
	"fmt"
	"net/http"
	"strings"
	"time"

	"resty.dev/v3"

	"codemgr/internal/conf"
)

var client = resty.New()

func init() {
	client.SetTLSClientConfig(&tls.Config{
		InsecureSkipVerify: conf.App.RestyInsecureSkipVerify,
	})
	// Without a timeout a stalled Google endpoint hangs the caller (and its
	// request) forever.
	client.SetTimeout(10 * time.Second)
}

func CookiesToString(cookies []*http.Cookie) string {
	var parts []string
	for _, c := range cookies {
		parts = append(parts, fmt.Sprintf("%s=%s", c.Name, c.Value))
	}
	return strings.Join(parts, "; ")
}
