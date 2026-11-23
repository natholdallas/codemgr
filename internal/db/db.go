// Package db to setup database
package db

import (
	"context"
	"fmt"

	"github.com/natholdallas/natools4go/orms"
	"github.com/natholdallas/natools4go/pwd"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"

	"codemgr/internal/conf"
)

var (
	Tx *gorm.DB
	Tc context.Context
	Rx *redis.Client
	Rc context.Context
)

var Models = []any{
	&Admin{},
	&User{},
	&Media{},
	&SysConf{},
	&Vault{},
}

func Connect() {
	Tx = orms.MustNew(orms.MustDialector(
		conf.App.DBDriver,
		conf.App.DBDsn,
		conf.App.DBName,
		conf.App.DBQuery,
		conf.App.DBAutoCreate,
	), &gorm.Config{
		Logger: orms.LogPreset(conf.App.LogWriter(), conf.App.LogLevelGorm),
	})
	Tc = context.Background()
	Rx = redis.NewClient(&redis.Options{
		Addr: conf.App.RedisAddr,
		DB:   conf.App.RedisIndex,
	})
	Rc = context.Background()
	// Redis backs refresh-token storage, so an unreachable server must fail the
	// boot instead of surfacing on the first sign-in attempt.
	if err := Rx.Ping(Rc).Err(); err != nil {
		panic(fmt.Errorf("connect redis: %w", err))
	}
	if conf.App.DBAutoMigrate {
		Migrate()
	}
}

// Mock inserts the demo admin and user. It stops at the first failure so a
// duplicate seed (unique username) is reported instead of silently ignored.
func Mock() error {
	if err := orms.Create(Tx, &Admin{Username: "admin", Password: pwd.TryHash("123456")}); err != nil {
		return err
	}
	if err := orms.Create(Tx, &User{Email: "user@example.com", Username: "user", Password: pwd.TryHash("123456")}); err != nil {
		return err
	}
	return nil
}

func Migrate() {
	dropLegacyIndexes(Tx)
	orms.MustAutoMigrate(Tx, Models...)
}

// dropLegacyIndexes removes the unique constraints that used to sit on the
// plaintext identifier columns. They must go before AutoMigrate widens those
// columns to text, and the sealed columns carry their own unique blind-index
// columns instead.
func dropLegacyIndexes(tx *gorm.DB) {
	if !tx.Migrator().HasTable(&User{}) {
		return
	}
	for _, name := range []string{"uni_users_username", "uni_users_google_email", "uni_users_telegram_id"} {
		if !tx.Migrator().HasIndex(&User{}, name) {
			continue
		}
		if err := tx.Migrator().DropIndex(&User{}, name); err != nil {
			panic(fmt.Errorf("drop legacy index %s: %w", name, err))
		}
	}
}

func Reset() {
	orms.Reset(conf.App.DBName, conf.App.DBDriver, conf.App.DBDsn)
}

func AutoCreate() {
	orms.AutoCreate(conf.App.DBName, conf.App.DBDriver, conf.App.DBDsn)
}
