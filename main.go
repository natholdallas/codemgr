// Package main is the entry point of codemgr.
package main

import (
	"codemgr/internal/conf"
	"codemgr/internal/db"
	"codemgr/internal/flag"
	"codemgr/internal/srv"
)

// @title						codemgr
// @version					1.0
// @description				API Documentation
// @securityDefinitions.apikey	ApiKeyAuth
// @in							header
// @name						Authorization
func main() {
	flag.PreRun()
	// --gensec only prints fresh secrets; the configuration still holds the old
	// (or empty) values, so validating and connecting afterwards is pointless.
	if conf.Flag.Gensec {
		return
	}
	conf.Validate()
	db.Connect()
	flag.Run()
	srv.Setup()
}
