// Package client use resty to make http request
package client

import (
	"crypto/tls"
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
