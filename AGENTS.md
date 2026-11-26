# AGENTS.md

## Primary entrypoints

- **`./main.sh`** — unified CLI for all operations (not `go build`, not `make`)
- **Server & app registries** (`main.sh` top section): `apps[]`, `servers[]`, `app_env[]` drive every build/deploy command. Edit them to add/remove servers or frontend apps — no code changes needed (see "Configuration" below).
- `./main.sh dev [restart|stop]` — starts tmux session: window 0 = Go hot-reload (gowatch), then one window per app in `apps[]` (`pnpm dev`); `restart`/`stop` kill the session
- `./main.sh build` — backend + SDK (`build_core`, sequential: swag → `go build` ∥ `gen:api`) and **then** the frontends for the **default server** (`build_front`). They are sequential on purpose: `pnpm generate` imports the generated SDK, so building while `gen:api` rewrites `app/lib/sdk` races
- `./main.sh deploy [--skip-build] [--force-service] [--allow-placeholder-env]` — builds backend+SDK **once**, then for **EACH server in `servers[]`**: rebuilds every app with that server's env, zips, rsyncs, and (re)starts the service. **Target mode (`tmux` | `systemctl`, default `systemctl`) is chosen by editing `deploy_mode` at the top of `main.sh`** — there is no `deploy-tmux`/`deploy-systemctl` subcommand or `--use-systemctl` flag. `--skip-build` reuses artifacts and warns (via each app's `dist/.built-for` marker) when they were built for a different server. `--allow-placeholder-env` bypasses the guard that otherwise aborts when an app would ship `localhost`/`example.com` as its API base
- `./main.sh servers` — list available servers/apps from the registries
- `./main.sh docs` — `swag fmt && swag init --parseDependency --parseInternal`, then regenerates the frontend SDK via `pnpm gen:api` (alova/wormhole)
- `./main.sh copyfile [--force]` — copies `assets/conf.toml` → `conf.toml` **only when absent** (an existing `conf.toml` holds the JWT secrets; `--force` overwrites it), then `assets/nuxt.env` → each app's `.env` and `assets/nuxt.env.production` → each app's `.env.production`
- `./main.sh init` — first-time: installs gowatch/swag, inits submodules, `go mod tidy`, `pnpm install`
- `./main.sh synconf [server]` — rsync `conf.toml` to the mode-appropriate remote dir of `[server]` (default: first server in `servers[]`)
- `./main.sh webconf [server]` — when `web_server != none`, generate & install the nginx/caddy site config on `[server]` from `domains[]` and reload it (no redeploy). `deploy` also runs this automatically after each server.
- `./main.sh serverlog [server] [once|lines]` — tail remote `journalctl -u <name>` (default follows; requires limited sudo)
- `./main.sh push "msg"` — `git add -A && git commit -m "msg" && git push` (defaults to `upd`)
- `./main.sh renewal <name>` — renames the entire project (irreversible, see "Project scaffolding")
- `./main.sh initremote [name] [--public|--private]` — create a GitHub repo (private by default), bind `origin`, set upstream (never pushes)

## Configuration (`main.sh` top section)

- `apps[]` — frontend apps, `name|dir|build_cmd|out_dir`. `build_cmd` runs inside `dir` (e.g. `pnpm generate`); `out_dir` is the build output relative to `dir`.
- `servers[]` — deploy targets, `name|ssh_user|host`; the **default server** (for `build`/`synconf`/`webconf`/`serverlog` when no `[server]` is given) is the **first entry**. **`./main.sh deploy` ships to every entry in `servers[]`** (frontends rebuilt per-server env). Root users skip sudo automatically (`SUDO=""`, sudoers setup skipped).
- `app_env[]` — per-server per-app env overrides keyed `"server:app:VAR"`, exported during each app's frontend build. Nuxt/c12 gives existing env vars precedence over `--dotenv .env.production`, so `.env.production` stays a fallback. **`NUXT_PUBLIC_API_BASE` / `NUXT_PUBLIC_SITE_URL` are auto-derived from `domains[]` + `app_bind[]`** — explicit `app_env` entries still win.
- `web_server` — `none` (default) | `nginx` | `caddy`. When not `none`, deploy/webconf render `assets/nginx/*` / `assets/caddy/*` for every **non-empty** endpoint in `domains[]` and install+reload on the remote (`/etc/nginx/conf.d/$pname.conf`, or `/etc/caddy/conf.d/$pname.caddy` + an `import` line in the main Caddyfile). It also patches the remote `conf.toml`: `app.nginx = true`, `resources.media-url` (only when the media domain is set), and `cors.prd` — the `http://` + `https://` origin of every configured domain is appended (existing entries are kept), because `AllowOriginsFunc` matches origins exactly and the frontends are served from their own hosts.
- `domains[]` — the endpoint domains, `endpoint|domain` (empty = that site is skipped): `usr` (user site), `adm` (admin site), `api` (backend reverse proxy → `web_api_addr`), `media` (media files). Static roots derive from `apps[]`: `<deploy_dir>/<app dir>/<out_dir>/public` for usr/adm, `<deploy_dir>/media` for media. Nginx sites listen on `:80` (run `certbot --nginx` for TLS); caddy does auto-HTTPS.
- `app_bind[]` — maps each frontend app to its `api` and `site` endpoints (used only for the env auto-derivation above).
- `web_api_addr` (default `127.0.0.1:8080`, must match `conf.toml app.port`) and `client_max_body` (default `20m`, must match `app.body-limit`).
- `deploy_mode` — `systemctl` (default) or `tmux`:
  - `systemctl` renders `assets/run.service` (`@PNAME@`/`@SRV_DIR@`) and installs it under `/etc/systemd/system`, then enables/restarts the unit with a health check; it wires limited passwordless sudo via a **shared, fixed** file `/etc/sudoers.d/<user>-codemgrx` — do not rename that filename. Whitelist: `systemctl/mkdir/chmod/install/journalctl/nginx/caddy/tee` (the last three only matter with `web_server != none`).
  - `tmux` kills/restarts a remote tmux session running `./bin/backend`.
- `use_rsync` (`USE_RSYNC`) — transfer method: `true`=rsync, `false`=scp.

## Architecture

```
Go backend (Fiber v3)         Nuxt 3 frontends (pnpm workspace)
├── internal/srv/std/  public ── port 8080, prefix /api/v1/
├── internal/srv/usr/  user   ── JWT, prefix /usr/api/v1/
├── internal/srv/adm/  admin  ── JWT, prefix /adm/api/v1/
├── internal/db/        GORM models (auto-migrate on startup)
├── internal/conf/      Viper config loading (init() runs LoadFlag+LoadApp)
├── internal/flag/      CLI flag scripts (--adm/--usr/--mock/...)
├── internal/auth/      JWT sign/verify
├── internal/mail/      SMTP mailer + templates (password hashing lives in the external natools4go/pwd)
└── internal/client/    Google API client

web/apps/usr/  (port 3000) — shadcn-vue + TailwindCSS + Tauri v2
web/apps/adm/  (port 3001) — Vuetify + TailwindCSS (v4, CSS-first via `app/assets/styles/css/tailwind.css`; layer order declared in `public/layers.css`)
web/packages/natholdallas/ — git submodule of shared, optional Nuxt modules (see "Shared Nuxt modules" below)
web/packages/apiclient/   — build-time SDK codegen tool, not a Nuxt module (see "Swagger → Frontend SDK" below)
```

## Go specifics

- **Module:** `codemgr` — this name is baked into all imports, `main.sh`, and `assets/run.service`
- **Build output:** `bin/backend` (gitignored)
- **Config:** `conf.toml` (TOML, gitignored). Template at `assets/conf.toml`. Loaded via Viper.
- **Secrets required:** `secret.adm`, `secret.usr` and `crypto.key` (validated, 32-char strings). Generate with `./bin/backend --gensec`, which **prints** new secrets — you must paste them into `conf.toml` yourself. `crypto.key` seals account identifiers and media files at rest (`internal/crypt`); rotating it makes existing sealed data unreadable
- **Hot-reload:** `gowatch -o bin/backend` (gowatch installed via `go install github.com/silenceper/gowatch@latest`)
- **Go tabs** — 4-space tab indent (`.editorconfig`)
- **CLI flags** (defined in `internal/conf/flag.go`, dispatched in `internal/flag/flag.go`): `--adm`, `--usr`, `--db-reset`, `--db-create`, `--db-migrate`, `--db-sync`, `--db-reset-table`, `--db-encrypt`, `--mock`, `--gensec`. `--db-sync` maps to `orms.SyncTablesHard` (add missing columns, drop removed ones, reorder); `--db-reset-table` maps to `orms.ResetTables`; `--db-encrypt` runs `db.EncryptData` once to seal pre-existing plaintext identifiers and media files
- **Auto-migrate:** `db.Connect()` runs `db.Migrate()` on startup when `db.auto-migrate = true`

### Database migration layers

Four distinct CLI flags handle schema evolution. All are dispatched from `internal/flag/runner.go`:

| Flag             | Source                                             | Behavior                                                                                                                                                                                                                                                             | Data                            |
| ---------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `--db-migrate`   | `db.Migrate()` → `orms.MustAutoMigrate`            | Incremental, add-only: creates missing tables/columns, alters types/comments. Runs on startup when `db.auto-migrate`                                                                                                                                                 | Safe                            |
| `--db-sync`      | `orms.SyncDB(db.Tx, db.Models...)`                 | Data-preserving reconciliation per table: add missing columns, **drop extra ones**, **reorder columns to struct order**. MySQL/MariaDB reorder in place via `ALTER TABLE ... MODIFY COLUMN ... FIRST/AFTER`; other drivers rebuild the table and copy shared columns | Dropped columns lose their data |
| `--db-reset-table` | `orms.ResetTables(db.Tx, db.Models...)`            | Drops + recreates each registered table from its struct so column order exactly matches declaration order                                                                                                                                                            | All data lost                   |
| `--db-reset`     | `db.Reset()`                                       | Drops + recreates the whole database                                                                                                                                                                                                                                 | All data lost                   |

`--db-create` (`db.AutoCreate()`) creates the database if missing. The GORM model set is the single source of truth — registered in `db.Models` (`internal/db/db.go`), which `Migrate`, `SyncDB`, and `ResetTables` all iterate. GORM's own `AutoMigrate` only ever appends new columns (at the end) and never drops or reorders, which is why `--db-sync`/`--db-reset-table` exist.

- **CORS origin matching:** `AllowOriginsFunc` compares origins **exactly** against `cors.dev` / `cors.prd` (`slices.Contains`). Prefix matching was removed because it accepted `https://example.com.attacker.net` for a whitelisted `https://example.com`. List every allowed origin in full.
- **Log rotation:** `lumberjack` writes to `<RLog>/app.log` (10MB, 7 backups, 28 days)
- **Lint — must run after any backend Go change and be completely clean before reporting done** (the team's nvim — AstroNvim/astrolsp with `gopls` + `staticcheck = true` — surfaces exactly these diagnostics, so a clean run here equals a zero-diagnostic editor buffer). **Run `./scripts/lint.sh`**, which chains all of it:
  - `gofumpt -l .` — must print nothing; `gci diff -s standard -s default -s 'Prefix(codemgr)' .` — must print nothing. These standalone binaries are the **authoritative** format gate: golangci-lint 2.14's built-in `gofumpt` formatter disagrees with them (it flags already-formatted files, and the flagged set changes between runs), so `formatters` is deliberately absent from `.golangci.yml`. `./scripts/lint.sh --fix` applies both.
  - `go build ./...` — must compile
  - `go vet ./...`
  - `~/.local/share/go/bin/staticcheck ./...`
  - `~/.local/share/go/bin/golangci-lint run ./...` — analysis linters only (govet/staticcheck/unused/revive/misspell); `revive use-any` forces `any` over `interface{}`
  - `gopls check <each edited .go file>` — exact parity with the editor buffer; this is what reports "should use range loop", "`err` shadows declaration at ...", "use `min`/`max`", "use `strings.Builder`/`WriteString`", and similar hints. If `gopls check` is clean, the nvim buffer will be too.
  - Fix everything each tool reports and re-run until the output is clean; never finish a change with leftover diagnostics.
- **No `_ = expr` blank assignments** — never write code that discards a value/error with `_ = xxx` (e.g. `_ = db.AutoMigrate(...)`). Handle the error/result properly instead (check it, log it, or propagate it).
- **No Go tests exist** — there is no `*_test.go` anywhere in *this* repo (password helpers come from `natools4go/pwd`). Don't assume a test suite here; the verification is the lint suite (see **Lint** above) + `go build`. (`natools4go` itself does have tests — run `go test ./...` there when changing it.)
- **`go mod` has no `replace` directives** — the old telegram-bot-api fork override was unused (the module is not in the dependency graph) and has been removed. Add one only when a dependency genuinely needs patching, and document why.

## GORM model conventions (internal/db/)

Every GORM model in `internal/db/` must follow these rules.

- **Full gotags on every field — no bare fields.** Each field must declare both tags:
  - `gorm` tag: always starts with `column:<snake_case>`; string columns add `size:<n>` (sealed plaintext columns use `type:text` instead, since ciphertext outgrows the original); **every column adds `comment:<English description>`**; append constraints as needed (`primaryKey`, `unique`, `not null`, `default`, `index`, ...)
  - `json` tag: snake_case matching the column; `json:"-"` for fields never exposed (e.g. `Password`)
- **Trailing comment on every field** — `// <description>` matching the gorm `comment` value (see `internal/db/admin.go:12`).
- **Embed a base model instead of hand-writing ID/timestamps** — `orms.Model[uint]` (ID + created/updated at) or `orms.IDModel[uint]` (ID only). Do not redeclare `ID`, `CreatedAt`, `UpdatedAt` yourself. `orms.SoftModel[T]` exists but is **not used here** — do not introduce soft delete unless asked.
- **Embedded prefixed structs** (this project does **not** use the many-to-one struct+FK embedding pattern): group related columns into a plain struct embedded with a column prefix — see `internal/db/user.go` (`GoogleInfo`/`TelegramInfo`):

  ```go
  type User struct {
      orms.Model[uint]
      Username      string       `gorm:"column:username;type:text;comment:Username (encrypted)" json:"username"`                                   // Username (encrypted)
      UsernameIndex *string      `gorm:"column:username_index;size:64;uniqueIndex:uni_users_username_index;comment:Username blind index" json:"-"` // Username blind index
      GoogleInfo    GoogleInfo   `gorm:"embedded;embeddedPrefix:google_" json:"-"`                                                                 // Google login info
  }

  type GoogleInfo struct {
      Email      string  `gorm:"column:email;type:text;comment:Google email (encrypted)" json:"email"`                                          // Google email (encrypted)
      EmailIndex *string `gorm:"column:email_index;size:64;uniqueIndex:uni_users_google_email_index;comment:Google email blind index" json:"-"` // Google email blind index
  } //	@name	GoogleInfo
  ```

- **Nullable columns are pointers only when absence is meaningful** (`*string`, `*int`, `*time.Time`). Blind-index columns are always `*string` so an unbound account stores `NULL` and the unique index permits any number of them (`UsernameIndex`, `GoogleInfo.EmailIndex`, `TelegramInfo.IDIndex`).
- **Sealed fields + blind indexes** — every identifier that could identify a person is sealed with `crypt` and looked up through a deterministic HMAC index (`internal/db/user.go`): the plaintext column is `type:text`, the index column is `size:64` + a `uniqueIndex:uni_*`; `BeforeSave`/`AfterFind` seal/open the plaintext (`crypt.EncryptString`/`DecryptString`), and writes recompute the index with `crypt.Index`. Never query a sealed column directly — look it up by its normalized (`strings.ToLower(strings.TrimSpace(...))`) index. `Media.Name` is sealed the same way.
- **JSON-persisted fields** (`orms.Dict[T]` / `orms.List[T]`): declare the column as `gorm:"type:json;comment:..."` (a `Dict`'s type must be `json`).
- **Register new models** in `internal/db/db.go` → add to the `Models` var → `Migrate()` runs `orms.MustAutoMigrate` over them.

Example matching existing style:

```go
type User struct {
	orms.Model[uint]
	Username string `gorm:"column:username;size:50;unique;comment:Username" json:"username"` // Username
	Password string `gorm:"column:password;size:255;comment:Password" json:"-"`              // Password
} //	@name	User
```

## Backend code patterns (`internal/srv`, `auth`, `oauth`, `conf`, `mail`, `flag`)

When writing backend code, copy these existing shapes; do not invent new ones.

### `orms` generic CRUD

Every helper takes the `*gorm.DB` session as the first argument — pass `db.Tx`, or `t` inside a transaction.

| Helper | Purpose |
|---|---|
| `orms.First[T](tx, conds...)` | One row by PK or any condition: `orms.First[User](tx, "username = ?", username)` |
| `orms.Take[T]` / `orms.Last[T]` | One row, no ordering assumption |
| `orms.Find[T](tx, conds...)` | List rows |
| `orms.IFirst[T]` / `ITake` / `ILast` / `IFind` | Same, but swallow the error and return the zero value |
| `orms.Create[T](tx, v)` | Insert (pass `&v` to get the ID back) |
| `orms.Save[T](tx, v)` | Upsert by PK |
| `orms.Delete[T](tx, conds...)` | Delete by PK or condition |
| `orms.UpdateByID[T](tx, id, column, value)` | Update a single column |
| `orms.UpdatesByID[T](tx, id, values)` | Update multiple columns; **pass a map**, otherwise zero values (`0`/`false`/`""`) are not written |
| `orms.QE[T](tx)` | Chain wrapper scoped to model T: `.QE[Media](tx).Where(...)` then `internal.Paginate(...)` |
| `orms.Q[T](tx)` / `orms.QM[T, M](tx)` | Chain without a model / map model M onto result type T |
| `orms.Transaction(tx, fn)` | Wrap a multi-step write |
| `orms.Count[T]` / `Exists[T]` / `PluckStrings[T]` | Quick aggregates |

- **Ownership filtering**: user-facing row queries carry `Where("user_id = ?", uid)`; read then verify before mutating (`usr.RemoveMedia`: fetch, compare `v.UserID != uid` → 403, then delete).
- **Passwords**: write with `pwd.Hash` / `pwd.TryHash`, verify with `pwd.Verify` (argon2id); `db.AuthUser`/`db.AuthAdmin` transparently upgrade legacy plaintext.
- **Clearing a column**: `gorm.Expr("NULL")` in the values map; the OAuth helpers `db.ClearGoogleInfo` / `db.ClearTelegramInfo` encapsulate it.
- **Sealed columns**: query by the normalized blind index (`db.FindUserByEmail` / `db.FindUserByUsername`), never by the ciphertext column.

### List queries (sorting + pagination)

A query DTO embeds `orms.Sorter` + `orms.Pagination`; the handler parses it and hands the query to `internal.Paginate` (`internal/srv/internal/paginate.go`):

```go
type UserQueries struct {
	orms.Sorter
	orms.Pagination
} //	@name	AdmUserQueries

func ListUser(c fiber.Ctx) error {
	q, err := fext.QueryParser[UserQueries](c)
	if err != nil {
		return &fext.Fail{Code: internal.InvalidData, Message: err.Error()}
	}
	v, err := internal.Paginate(orms.QE[db.User](db.Tx), q.Sorter, q.Pagination)
	if err != nil {
		return &fext.Fail{Code: internal.OperationFailed, System: err}
	}
	return c.JSON(v)
}
```

- **Never use `Scopes(q.Sorter.Scope)` + `IPaginate` here.** GORM executes scopes lazily, so the sort also lands on the `COUNT` query; PostgreSQL rejects `SELECT count(*) ... ORDER BY col` with SQLSTATE 42803 and the error is swallowed, returning an empty page. `internal.Paginate` attaches the sort as an eager `Order` clause (GORM's `Count` strips it) and propagates the query error — so it works on PostgreSQL, MySQL and SQLite.
- `internal.Paginate` returns `orms.Page[T]` (`{total, page, content}`); page/size are sanitized by `orms.Pagination` (size defaults 20, capped 100) and the sort column is validated by `Sorter.Valid`.
- Declare a per-endpoint named Page DTO (`AdmUsersPage`, `UsrMediaPage`, ...) with the **same shape** purely for swagger naming — the handler returns the helper result directly since the JSON shapes match.
- A single row maps onto a flat DTO with `orms.QM[Profile, db.User](db.Tx).IFirst(id)` — **unless the model seals columns**: a projection bypasses `AfterFind`, so `usr.findProfile` loads `orms.First[db.User]` and maps manually.
- Simple count: `db.Tx.Model(&X{}).Count(&n)`.

### Fiber handlers and routes

```go
var jwt = fext.NewJWT(conf.App.SecretUsr)

func Setup(api fiber.Router) {
	auth := api.Group("/auth").
		Use(internal.RateLimit(internal.IPKey, "usr:auth", 30, time.Minute))
	auth.Post("/login", internal.RateLimit(internal.IPKey, "usr:login", 10, time.Minute), LoginPassword)
	auth.Post("/refresh", Refresh)
	api.Group("/profile", jwt.Middleware).
		Get("/me", FindProfile).
		Put("/me", UpdateProfile)
}
```

- `/api/v1` (`std`, public) has no JWT; `/adm/api/v1` + `/usr/api/v1` each use their own `jwt.Middleware` (`secret.adm`/`secret.usr`). Groups are mounted in `srv.Setup()` by `internal.Log("GEN"/"ADM"/"USR"/"DOC")`.
- **Rate limiting**: every auth group carries `internal.RateLimit(internal.IPKey, "<scope>", n, window)`; credential/code endpoints get a second tighter bucket. Authenticated routes bucket by `internal.userKey` (user ID) instead of IP.
- Input: bodies via `fext.BodyVarser[T](c)` (bind + validate against the `validate` tags); queries via `fext.QueryParser[T](c)`; path IDs via `internal.ParseID(c)` (custom name: `internal.ParseID(c, "userID")`). **Never pass `c.Params("id")` straight to GORM** — a value containing a space or `?` is treated as a raw WHERE clause; `ParseID` rejects it as 400 `InvalidData`. Every parse failure returns `&fext.Fail{Code: internal.InvalidData, Message: err.Error()}`.
- Errors: return `&fext.Fail{Code, Status, Message, System}`; `fext.ErrorHandler` renders `{code, message}` (status defaults to 400; `System` only appears in debug mode). Error-code constants live in `internal/srv/internal/txtcode.go` (`InvalidData`, `SignInFailed`, `RecordNotFound`, `UploadFailed`, `InvalidMedia`, `VaultConflict`, ...). Success is `return c.JSON(v)`; an empty 200 is a bare `return nil`.
- Identity: `jwt.Claims(c)` returns `*jwt.RegisteredClaims`, whose numeric subject is `claims.ID` (a **string**) — convert with `strs.ParseUint[uint]` / `strs.FormatUint`. On unauthenticated requests `claims` may be `nil`, so only call it behind `jwt.Middleware`.

### JWT and refresh rotation (`internal/auth`)

Two process-wide managers built once from config at package init: `auth.Usr` and `auth.Adm` (`auth.New(secret, "usr"/"adm", accessTTL, refreshTTL)`).

- `GenPair(strs.FormatUint(id))` → `Pair{AccessToken, RefreshToken}`; the refresh token is recorded in Redis for revocation (`usr:refresh:<jti>`, plus a per-user set for `RevokeAll`).
- `VerifyRefresh(token)` validates the signature, checks Redis and returns the **subject string**; `RevokeRefresh(token)` invalidates one pair; `RevokeAll(userID)` clears every session (used on password change/reset).
- Every `/auth/refresh` rotates: revoke the old pair, issue a new one.

### Media upload (`internal/srv/internal/media.go`)

Shared by `adm`/`usr`:

```go
file, err := internal.ParseUploadFile(c)                    // multipart "file" field
if err != nil {
	return err
}
kind := internal.Kind(strings.ToLower(c.FormValue("kind")))
if kind == "" {
	kind = internal.KindOf(file.Filename)                   // image/video/file by extension
}
v, err := internal.SaveFile(c, file, kind, userID)          // validates + seals + creates db.Media
if err != nil {
	return err
}
return c.JSON(v)
```

- `Kind` is validated against extension plus **sniffed MIME** (content, not filename); `KindFile` rejects XSS-capable types via `safeFileMIME`. Avatars use the narrower `SaveAvatar` (no GIF, pixel-dimension cap).
- Files land at `<RMedia>/<YYYY>/<MM>/<rands.Char(20)><ext>` and are **sealed with `crypt.Seal`** before hitting disk; `db.Media.Name` is sealed by the model hooks. `URL` is `conf.App.MediaBase() + "/" + path` and the file is removed if the DB write fails (and on delete via `Media.AfterDelete`).
- Reads go through `internal.ServeMedia`, which decrypts and streams; the disk holds ciphertext only, so the reverse proxy must forward the media route to the backend instead of serving the directory.
- Avatar replacement removes the old row with `internal.RemoveMediaByURL`; admin deletes are blocked while an avatar still references the URL (`AvatarInUse`).

### Accounts, OAuth and verification codes (`internal/oauth`, `internal/srv/usr`)

- **Google:** `oauth.GoogleExchange(code)` → `client.GoogleUser`; on `gorm.ErrRecordNotFound`, `createGoogleUser` provisions the account (`oauthUsername` derives a unique username, random password).
- **Telegram:** bind `oauth.TelegramAuth` (the Login Widget payload) as the body DTO, verify with `oauth.CheckTelegramAuth` (HMAC + 5-minute freshness), then `createTelegramUser`.
- Bind/unbind endpoints live at `/usr/api/v1/profile/bind/...` and reuse the same exchange; unbind clears the embedded columns (`db.ClearGoogleInfo`/`ClearTelegramInfo`).
- **Email codes** (`usr/emailcode.go`): Redis key `usr:vcode:<purpose>:<crypt.Index(email)>` (the address never appears in the key), purpose-scoped so a sign-up code cannot be replayed at login; 10-minute TTL, 60-second resend cooldown, 5 guesses. Responses must never reveal whether an address is registered, and `consumeCode` runs before the account lookup so both failures look identical.
- `normalizeEmail` accepts only a bare address (no display name) and lowercases it; every lookup uses that canonical form.
- `mail.SendVerificationCode` failures are logged, never surfaced, because an unauthenticated caller must not learn SMTP state. Mail helpers: `mail.SendNotice` for plain notices.

### Vault (`internal/db/vault.go`, `internal/srv/usr/vault.go`)

End-to-end encrypted envelope: the client encrypts with WebCrypto and the server stores `Blob` as an **opaque JSON document** — it is never decrypted or interpreted server-side. Writes are optimistic: `version = 0` creates, otherwise `UPDATE ... WHERE user_id = ? AND version = ?` with `version + 1`; zero rows affected → 409 `VaultConflict` so the client merges. Deleting an absent vault is not an error.

### Configuration and runtime (`internal/conf/`)

Everything goes through `conf.App` (`conf.App.Port`, `conf.App.MediaBase()`…); Viper keys map to `conf.toml` by dotted path (`db.name` → `[db] name =`). `conf.init()` calls `LoadFlag()` + `LoadApp()` **at package import time**, before `main()`, and the config is never reloaded at runtime (the DB pool and both auth managers are built once).

- `Validate()` enforces the `validate:"required"` keys (`secret.adm`, `secret.usr`, `crypto.key`/`SecretData`, `db.*`, `resources.*`), checks host/credentials only for server-based drivers (SQLite needs none) and requires `app.body-limit` ≥ the largest single-file limit.
- `SecretData` (`[crypto] key`) seals identifiers and media: rotating it makes existing sealed data unreadable.
- `conf.toml` is gitignored — copy from `assets/conf.toml` via `./main.sh copyfile` before running.

### CLI flags (`internal/flag/`)

Flags are defined in `internal/conf/flag.go` and dispatched in `internal/flag/flag.go` by `flags.Run(flag, script)` (a hit runs the script then exits). `PreRun()` runs before `db.Connect()` (`--gensec` prints 32-char adm/usr/crypto secrets to paste into `conf.toml`); `Run()` runs after connecting: `--adm`/`--usr` (interactive account creation), `--mock` (admin/123456, user/123456), the DB scripts in the table above, and `--db-encrypt` (one-shot sealing of pre-existing plaintext identifiers and media files, idempotent).

### Backend conventions (beyond lint)

- `orms.UpdatesByID` / `Updates` with a struct skip zero values — pass a `map[string]any` whenever zero is meaningful (reset/clear operations).
- Never put raw user input into `Order` — go through `internal.Paginate(..., q.Sorter, q.Pagination)`, which validates the column with `Sorter.Valid`.
- After swagger/SDK changes run `./main.sh docs`; for backend changes run `./scripts/lint.sh --fix` first, then `./scripts/lint.sh`.

## Frontend specifics

- **Package manager:** pnpm@12.21.0 (enforced in `web/package.json` `packageManager`)
- **Workspace packages:** `apps/*` (Nuxt apps), `packages/*` (build-time tooling — currently `apiclient`, the SDK codegen), `packages/natholdallas/*` (shared Nuxt modules, git submodule)
- **Prod build:** `pnpm generate` (SSG / static generation via `nuxt generate --dotenv .env.production`), not `nuxt build`. Root script `pnpm gen` (`pnpm -F adm -F usr --parallel generate`) runs both apps' SSG in parallel — distinct from `pnpm gen:api` (SDK generation)
- **SSR disabled:** both apps set `ssr: false`
- **Formatting:** `pnpm format` (Prettier) — run from `web/` dir. Config: no semis, single quotes, 120 print width, 2-space indent
- **ESLint:** auto-generated by Nuxt (`.nuxt/eslint.config.mjs`), imported by root config. Check per-app directory.
- **Lint:** after writing frontend code, run `pnpm lint` (or `pnpm lint:fix` to autofix) from `web/` — the root script is `pnpm -r --no-bail run lint`, so it runs each app's own `lint`/`lint:fix` (`eslint .` / `eslint . --fix`) across every app under `web/apps/` (adm, usr); packages without a lint script are skipped. **All `warn` and `error` findings must be fixed before finishing** (run `pnpm lint` after writing code, fix every warning/error — `pnpm lint:fix` for auto-fixables, then manually fix the rest; re-run until clean). Each app has its own `eslint.config.mjs` importing that app's generated `.nuxt/eslint.config.mjs` (adm additionally disables `vue/valid-v-slot` for Vuetify dotted slot names, and both apps ignore the generated `app/lib/sdk`); `.nuxt/` must exist first (`postinstall` runs `nuxt prepare`).
- **Build warning suppressions (copy these when adding an app):** Tailwind 4 emits `oklch(from …)` and nested `calc()`-in-`var()` that cssnano's `postcss-calc` cannot parse, so each app sets `postcss.plugins.cssnano = { preset: ['default', { calc: false }] }` (only the calc transform is skipped). Each app also disables Rolldown's `pluginTimings` diagnostic (`vite.build.rolldownOptions.checks.pluginTimings = false`) and filters two upstream-only Nitro warnings in `nitro.rollupConfig.onwarn`: `CIRCULAR_DEPENDENCY` (nitro/i18n/icon runtime graph, already hidden by Nitro's default handler) and the h3 v1 `UNUSED_EXTERNAL_IMPORT` for `H3Error`/`H3Event`/`deleteCookie`.
- **Env vars:** `NUXT_PUBLIC_API_BASE` (backend URL), `NUXT_PUBLIC_SITE_URL`, `ENABLE_PWA`, `ENABLE_SEO`
- **Env files:** `.env` (dev) from `assets/nuxt.env`, `.env.production` (prod) from `assets/nuxt.env.production`, both copied by `./main.sh copyfile`. `deploy` **refuses** to ship a bundle whose `NUXT_PUBLIC_API_BASE` is still `localhost`/`example.com` unless `--allow-placeholder-env` is passed; set the override to `same-origin` for a single-host (reverse-proxied) deployment.
- **Shared packages:** git submodule at `web/packages/natholdallas` → `https://github.com/natholdallas/nuxt-modules.git`
- **Test utils:** configured via `.nuxtrc`: `setups.@nuxt/test-utils="4.4.0"` — test with `nuxi test` from app dir

## Shared Nuxt modules (web/packages/natholdallas/)

Every package under `web/packages/natholdallas/` is a **Nuxt module** (each exposes a `defineNuxtModule` in its `index.ts`). They are **optional** — an app only loads the ones it lists in its `nuxt.config.ts` `modules` and declares as `@natholdallas/*` `workspace:*` deps. This directory is a **git submodule** (shared across projects) pointing at `nuxt-modules.git`. Changes are committed inside the submodule and the pointer is bumped in this repo — keep both commits together so a checkout is never left with a dangling pointer. Two rules keep apps healthy:

- **Modules must not assign `runtimeConfig.public.*`.** Module setup runs after `nuxt.config.ts`, so doing so silently overrides the app. `apiBase` is declared by each app and fed by `main.sh` from `domains[]`/`app_env`.
- **Modules declare everything they import.** Packages used only by app-level components belong in the app; otherwise apps end up relying on hoisted phantom dependencies.

- **`alova`** — registers the alova runtime auto-imports (`lib/`). Provides the runtime side (alova instance, `Api`, `Apis`) that the generated SDK in `app/lib/sdk/` builds on. Used by both apps.
- **`i18n`** — wraps `@nuxtjs/i18n`. Ships the **globally stored shared translation keys** in `locale/*.ts` (`zh_cn`, `en_us`, `zh_tw`, `ja_jp`). **Do NOT modify these** — they are the global key set. To change or add translations, edit the **project's own i18n files** (`web/apps/<app>/app/locale/*.ts`), which import and spread the shared dict (e.g. `import zh from '@natholdallas/i18n/locale/zh_cn'` then `...zh`) and layer app-specific keys on top. The submodule locales should stay untouched so every project gets the same base keys.
- **`infra`** — bundles the common infra modules: `@nuxtjs/seo`, `@nuxt/icon`, `@vite-pwa/nuxt`, `@nuxtjs/device`, `@vueuse/nuxt`, `dayjs-nuxt`, `nuxt-og-image`, `@nuxt/eslint`, `@nuxt/test-utils`. Enables Nuxt 4 compatibility (`compatibilityVersion: 4`, typed pages, vite env API) and sets PWA/dayjs defaults. It does **not** touch `runtimeConfig.public.apiBase` — each app declares that itself (bundle analysis is opt-in via `ANALYZE=true`). Also auto-imports shared components (`PwaProvider`) and composables (`crud`, `routes`, `interval`). Used by both apps (adm via `vuetify`, usr via `shadcn`).
- **`pinia`** — wraps `@pinia/nuxt`; enables Pinia stores (`useAuthStore`, ...). Used by both apps (the SDK's `beforeRequest` reads the access token from `useAuthStore()`).
- **`shadcn`** — the shadcn-vue module (usr app): depends on `@natholdallas/i18n`, bundles `shadcn-nuxt` + Tailwind v4 (`@tailwindcss/vite`) + reka-ui + vee-validate/zod, and registers `Uix`-prefixed module components (`Form`, `DataTable`, `Field`, `Modal`, ...). Chart/carousel/input-otp packages (`@unovis/vue`, `embla-carousel-vue`, `vue-input-otp`) are declared by the **app**, since only app-level components use them.
- **`tailwindcss`** — Tailwind v4 CSS-first module (postcss/vite plugin + sass), for apps that don't use the shadcn/vuetify bundles. Optional, not currently used.
- **`tauri`** — Tauri v2 integration (`@tauri-apps/api`); used by both apps (each declares `dev:tauri`/`package` scripts).
- **`unocss`** — UnoCSS module (wraps `@unocss/nuxt` + presets, ships an example `uno.config.ts`). Optional, not currently used.
- **`vuetify`** — the Vuetify module (adm app): depends on `@natholdallas/i18n` + `@natholdallas/infra`, wraps `vuetify-nuxt-module` with theme/component defaults, wires Tailwind postcss, and registers `Vx`-prefixed module components (`Form`, `Dialog`, `Upload`, `Drawer`, ...).
- **`watermark`** — adds a `Watermark` component + runtime config. Optional, not currently used.

## Swagger → Frontend SDK (alova/wormhole)

The frontend SDKs are **generated** from the backend swagger doc, not hand-written. Flow: `swag init` produces `docs/swagger.json` → `web/packages/apiclient/alova.config.ts` runs `@alova/wormhole` → emits each app's `app/lib/sdk/*` directly (gitignored, no `gen/` subdir).

**`web/packages/apiclient`** is **not a Nuxt module** — it's the build-time SDK generator. It holds the `@alova/wormhole` config (`alova.config.ts`) plus the custom codegen plugins (`codegen/plugins.ts`) that turn `docs/swagger.json` into each app's typed API SDK (`app/lib/sdk/`). It's only ever driven by `pnpm gen:api` (`pnpm --dir packages/apiclient exec alova gen -f`) at build time; app code never imports it at runtime.

- **Entrypoint:** `./main.sh docs` regenerates swagger **and** the SDK. `./main.sh build` also runs `pnpm gen:api` before `pnpm generate`.
- **Config:** `web/packages/apiclient/alova.config.ts` — two generators (usr → `/usr/api/v1`+`/api/v1`, adm → `/adm/api/v1`+`/api/v1`), driven by plugins in `web/packages/apiclient/codegen/plugins.ts`. The root `pnpm gen:api` runs it via `pnpm --dir packages/apiclient exec alova gen -f`.
- **Generated files** per app (`app/lib/sdk/`): `index.ts` (alova runtime: `baseURL: useRuntimeConfig().public.apiBase`, Bearer injected in `beforeRequest` from `useAuthStore()`, `Api.NewEvent` — plus each app's wiring injected by `customIndex` in `alova.config.ts`), `createApis.ts`, `apiDefinitions.ts`, `globals.d.ts` (types + `declare global Apis` for usr / `AdmApis` for adm), `models.ts` (`type X = G.X` re-export from `globals` + `const X = {...}` model factories, including shared `PageQueries`/`SortQueries`/`BaseQueries`/`Page` helpers).
- **Runtime behavior** (`api.NewEvent`): 200 → success toast (non-GET), 401 → attempt one `useAuthStore().$refresh()` retry (deduped per request), then `$signOut()` on failure, else → error fallback by `code`/`message`. Wired in each app's generated `app/lib/sdk/index.ts` (edit the `usrWiring`/`admWiring` templates in `alova.config.ts`, then regenerate).

### Swagger annotation conventions (the ONLY manual cost)

Changing/adding an API = edit the swag annotations + run `./main.sh docs`.

- **`@ID` must be globally unique** across the whole doc. Naming: `{app}{Verb}{Entity}` e.g. `usrSignIn`, `admListUsers`; std (public) has **no** prefix (`findConfig`) and must not collide with a stripped app name. Codegen strips the `usr`/`adm` prefix **and** the tag-matching entity suffix → concise methods under the tag group (`admListUsers` → `Apis.User.list`, `admCreateAdmin` → `Apis.Admin.create`). Reserve-word verbs (`delete`) are aliased (`deleteUser` → `Apis.User.remove`).
- **`@Tags` carries the app prefix** (`usrAuth`, `admAdmin`, `admUser`); std uses bare (`Config`). Codegen strips it → SDK group `Apis.User`, `Apis.Auth`, ... The swagger UI (`internal/srv/swg/srv.go`) also strips it for display.
- **`@name` must be globally unique.** Every app-owned DTO gets a `Usr`/`Adm` prefix (`UsrUser`, `AdmAuthIn`, `AdmAdminsPage`); shared/global models (`User`, `Admin`, `Media`, `BaseQueries`, `Fail`) stay unprefixed. Codegen's `stripSchemaPrefix` strips the `Usr`/`Adm` prefix automatically — **no manual map needed** when adding a new DTO.
- **`@Success`/`@Param` should reference the Go type name**, not the `@name` (e.g. `{object} User` even if `@name UsrUser`).
- **Response models are assumed fully populated**: `requiredResponses` marks every property of 2xx-response schemas as required. So response DTOs must not have genuinely-missing fields (avoid `omitempty`-nullable response fields).
- **Error DTOs**: any handler returning `fext.Fail` should declare `@Failure 400/500 {object} Fail`.
- **Security**: `main.go` declares a global `ApiKeyAuth` header scheme; protected routes add `@Security ApiKeyAuth`.

## Project scaffolding

- **`./main.sh renewal <name>`** — renames the entire project. Replaces all `codemgr` strings, deletes `.git`, removes/re-adds submodule, inits fresh git repo. Copies config/env files first. **Irreversible** — prompts for confirmation.

## Order of operations

```
init → copyfile → (edit conf.toml) → dev
build → deploy
```

## Key gotchas

- `conf.toml` is gitignored — must run `./main.sh copyfile` or manually copy `assets/conf.toml` before running
- `secret.adm` and `secret.usr` are validated as required — the app won't start without them
- The swagger UI is served at `/doc/api/v1` (mounted in `internal/srv/srv.go:41`) only when `app.swagger = true` in `conf.toml` (default `false`); the spec is still written to `docs/` regardless
- Frontend `nuxt.config.ts` imports from `@natholdallas/*` workspace packages — these come from the git submodule
- The `internal/conf` package `init()` function runs on import (loads flags and app config before `main()`)
- The generated SDK (`web/apps/*/app/lib/sdk/`) and the swagger spec (`docs/`) are both **gitignored** — always regenerate via `./main.sh docs`, never commit them
- `swag` is pinned to **v2.0.0-rc5** in `go.mod` (`github.com/swaggo/swag/v2`) and installed by `./main.sh init` via `go install github.com/swaggo/swag/v2/cmd/swag@v2.0.0-rc5`. If `swag --version` differs, reinstall with the v2 command above
- `stripSchemaPrefix` only strips names whose remainder starts uppercase, so the shared `Admin` model (whose name happens to start with the `Adm` prefix) is preserved; don't introduce app DTOs whose stripped name would collide with a shared model used in the same app
- Every new DB model must have **complete gotags** (`gorm:"column:...;comment:..."` + `json` tag) and a trailing comment on **every field** — see the "GORM model conventions" section above
