// Package oauth implements third-party login (Google, Telegram) verification
// and authorization URL building backed by the app configuration.
package oauth

import (
	"errors"

	"codemgr/internal/client"
	"codemgr/internal/conf"
)

// GoogleExchange trades an authorization code for the Google profile using the
// registered redirect URI from the configuration.
func GoogleExchange(code string) (client.GoogleUser, error) {
	if !conf.App.OauthGoogleEnabled {
		return client.GoogleUser{}, errors.New("google oauth not enabled")
	}
	token, err := client.GoogleToken(code, conf.App.OauthGoogleRedirectURI)
	if err != nil {
		return client.GoogleUser{}, err
	}
	return client.GoogleUserInfo(token)
}
