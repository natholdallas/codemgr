package flag

import (
	"fmt"
	"os"
	"strings"

	"github.com/natholdallas/natools4go/ask"
	"github.com/natholdallas/natools4go/orms"
	"github.com/natholdallas/natools4go/pwd"
	"github.com/natholdallas/natools4go/rands"

	"codemgr/internal/db"
)

func Gensec() {
	fmt.Println("remake secret script")
	fmt.Println("adm: ", rands.Char(32))
	fmt.Println("usr: ", rands.Char(32))
	fmt.Println("crypto: ", rands.Char(32))
	fmt.Println("secret remake success, please edit your configuration")
}

func RstDB() {
	fmt.Println("resetting database")
	db.Reset()
}

func CrtDB() {
	fmt.Println("creating database")
	db.AutoCreate()
}

func MigDB() {
	fmt.Println("migration database")
	db.Migrate()
}

func SynDB() {
	fmt.Println("sync database schema")
	if err := orms.SyncTablesHard(db.Tx, db.Models...); err != nil {
		fail(err)
	}
}

func RstTable() {
	fmt.Println("reset table structures")
	if err := orms.ResetTables(db.Tx, db.Models...); err != nil {
		fail(err)
	}
}

func EncDB() {
	fmt.Println("encrypt database rows and media files")
	users, files, err := db.EncryptData()
	if err != nil {
		fail(err)
	}
	fmt.Printf("sealed %d users, %d media files\n", users, files)
}

// fail reports a script error on stderr and exits non-zero, so a failed
// migration or seed is never mistaken for success by a wrapping script.
func fail(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}

func Usr() {
	fmt.Println("add user script")
	email := ask.Read[string]("email")
	username := ask.Read[string]("username")
	password := readPassword()
	hash, err := pwd.Hash(password)
	if err != nil {
		fail(err)
	}
	v := db.User{
		Email:    strings.ToLower(strings.TrimSpace(email)),
		Username: strings.TrimSpace(username),
		Password: hash,
	}
	if err := orms.Create(db.Tx, &v); err != nil {
		fail(err)
	}
	fmt.Println("success")
}

func Adm() {
	fmt.Println("add admin script")
	username := ask.Read[string]("username")
	password := readPassword()
	hash, err := pwd.Hash(password)
	if err != nil {
		fail(err)
	}
	v := db.Admin{Username: username, Password: hash}
	if err := orms.Create(db.Tx, &v); err != nil {
		fail(err)
	}
	fmt.Println("success")
}

// readPassword prompts without echoing. ask.Read echoes input, which would print
// the new credential to the terminal and leave it in scrollback.
func readPassword() string {
	password, err := ask.ReadPassword("password")
	if err != nil {
		fmt.Println("read password:", err)
		return ""
	}
	return password
}

func Mock() {
	fmt.Println("database mock script")
	if err := db.Mock(); err != nil {
		fail(err)
	}
}
