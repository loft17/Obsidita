# Obsidita HTTP API

Reference for the endpoints exposed by the server (`server/`). The web app (`web/src/api.ts`) is the only official client, but the API can be used from scripts as long as you follow the cookie authentication and CSRF protection described below.

> All routes live under `/api`. Express routes are case-insensitive (`/API/files/tree` also works).

> Error messages returned by the server are in Spanish (e.g. `"Contraseña incorrecta"`); they are quoted here as-is.

---

## Contents

- [General concepts](#general-concepts)
  - [Authentication](#authentication)
  - [CSRF](#csrf)
  - [Request and response format](#request-and-response-format)
  - [File paths](#file-paths)
  - [Status codes](#status-codes)
  - [Limits](#limits)
- [Setup](#setup--apisetup) — initial configuration
- [Auth](#auth--apiauth) — login and logout
- [Files](#files--apifiles) — notes, attachments, folders and trash
- [Search](#search--apisearch) — search and tags
- [Settings](#settings--apisettings) — server and vault settings
- [Sync](#sync--apisync) — GitHub sync and note history
- [Fonts](#fonts--apifonts) — custom fonts
- [Health](#health--healthz) — service status for proxy and Docker
- [curl example](#curl-example)

---

## General concepts

### Authentication

- `POST /api/auth/login` creates a session and returns a **signed** `token` cookie (`HttpOnly`, `SameSite=Strict`, `Secure` when the request arrives over HTTPS).
- The cookie lasts at most `SESSION_MAX_DAYS` (30 days) and expires earlier after `SESSION_IDLE_DAYS` (7 days) without use.
- The server only stores the token hash (`data/sessions.json`), so logging out invalidates the cookie even if someone copied it.
- **Public** routes: `/api/setup/*` and `/api/auth/*`. **Everything else** requires a session:
  - Not configured yet (no `data/config.json`) → `503 {"error":"Not configured"}`.
  - No valid session → `401 {"error":"Unauthorized"}`.

### CSRF

Every `/api` request whose method is not `GET`, `HEAD` or `OPTIONS` goes through `csrfGuard` (`server/security.js`):

- `Sec-Fetch-Site: cross-site` → `403 {"error":"Origen no permitido"}`.
- If an `Origin` header is present, it must exactly match the server's origin (scheme, host and port). Behind a proxy, `X-Forwarded-Proto` / `X-Forwarded-Host` are used when `TRUST_PROXY` is set.
- Requests without an `Origin` header (e.g. `curl`) are accepted.

### Request and response format

- Bodies are JSON (`Content-Type: application/json`), except `POST /api/files/upload`, which receives the raw file.
- JSON bodies are limited to **100 KB**, except under `/api/files/*`, which accepts up to `MAX_NOTE_MB` (20 MB).
- Errors always look like `{"error": "<message>"}`. Some add extra fields (e.g. the `409` conflict when saving).
- File-system errors are mapped to generic messages (`No encontrado`, `Permiso denegado`, `Ya existe`…) so internal server paths are never exposed.
- Any unknown `/api/...` route returns `404 {"error":"No encontrado"}` (never the SPA's `index.html`).

### File paths

- All note and folder paths are **relative to the vault** and use `/` as separator (`Projects/Web/idea.md`).
- When the path is part of the URL (`/files/read/:filePath`, `/files/:filePath`…), send it **fully encoded** with `encodeURIComponent`, slashes included: `/api/files/read/Projects%2FWeb%2Fidea.md`.
- The server rejects:
  - Paths that escape the vault (`..`, absolute paths, symlinks pointing outside) → `Path traversal attempt`.
  - Anything inside `.obsidian/` or `.git/` → `Ruta protegida`.

### Status codes

| Code | Meaning |
|------|---------|
| `200` | OK |
| `304` | Note unchanged (`GET /files/read` with `?version=`) |
| `400` | Invalid request, failed validation or failed operation |
| `401` | No session, or wrong password on login |
| `403` | Wrong setup token, wrong current password, or CSRF |
| `404` | Not found |
| `409` | Save conflict: the note changed on the server |
| `413` | Body too large |
| `429` | Too many attempts (login / password) or too many searches. Includes `Retry-After` (seconds) |
| `500` | Internal error |
| `503` | Server not configured yet |

### Limits

Configured through environment variables (see `.env.example`) and readable via [`GET /api/settings/limits`](#get-apisettingslimits).

- **Login and password-protected actions** (login, change vault, change password): 5 failures in 15 min per IP (IPv6 grouped by /64) lock that IP for 1 min, doubling on each lock up to 1 h. In addition, 50 failures in total within 15 min lock login for everyone for 5 min.
- **Search and tags**: `SEARCH_RATE_MAX` (120) requests per IP per minute, shared between `/search` and `/search/tags`.

---

## Setup — `/api/setup`

Public. Used for the initial configuration, while `data/config.json` does not exist yet.

### `GET /api/setup/status`

Installation status.

```json
{ "configured": true, "minPasswordLength": 12, "siteTitle": "My notes" }
```

`siteTitle` is public because it is shown on the login screen (empty = default title).

### `POST /api/setup/init`

Creates the configuration. Only works while the app is not configured.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `setupToken` | string | yes | One-time token printed to the server console when it starts unconfigured |
| `vaultPath` | string | yes | **Absolute** vault path. Created if missing. Cannot be a system folder, and must be inside `VAULTS_ROOT` if that is set |
| `password` | string | yes | At least `MIN_PASSWORD_LENGTH` characters |
| `port` | number | no | Port (1-65535). Defaults to `3000` |

Response: `{ "success": true }`.

Errors: `400 Already configured`, `403` wrong token, `400` missing fields, short password, invalid port or path.

On success, previous sessions and sync configuration (`data/sync.json`) are removed, after backing up `data/`.

---

## Auth — `/api/auth`

Public.

### `POST /api/auth/login`

```json
{ "password": "..." }
```

- `200 { "success": true }` + `token` cookie.
- `400 Missing password`, `401 Contraseña incorrecta`, `429` too many attempts (with `Retry-After`).

### `POST /api/auth/logout`

Invalidates the current session and clears the cookie. Returns `{ "success": true }` (even without a session).

---

## Files — `/api/files`

Session required.

### `GET /api/files/tree`

The whole vault tree as a flat list, sorted by name, depth-first. Hidden entries (starting with `.`, including `.trash`) and symlinks are skipped.

```json
[
  { "type": "folder", "path": "Projects", "name": "Projects" },
  { "type": "file", "path": "Projects/idea.md", "name": "idea.md", "size": 1234, "mtime": 1760000000000 },
  { "type": "other", "path": "Projects/photo.png", "name": "photo.png" }
]
```

`type`: `folder`, `file` (`.md` notes only, with `size` in bytes and `mtime` in ms) or `other` (any other file).

### `GET /api/files/read/:filePath`

Reads a note as UTF-8 text.

| Query | Description |
|-------|-------------|
| `version` | Optional. Version the client already has. If it matches the current one, responds `304` with no body |

```json
{ "content": "# Hello\n...", "version": "3f786850e387550fdab836ed7e6dc881de23001b" }
```

`version` is the SHA-1 of the content. Sent with `Cache-Control: no-store`.

### `GET /api/files/raw/:filePath`

Returns the binary file as-is (images and other attachments) with its `Content-Type`. Served with a `sandbox` CSP so an SVG opened directly cannot run scripts. `404` if missing.

### `GET /api/files/export-pdf/:filePath`

Returns an HTML page with the rendered note (frontmatter removed) that opens the browser's print dialog on load. This backs "Export to PDF".

### `POST /api/files/write/:filePath`

Saves a note (creating it and its folders if needed).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | string | yes | Full note content |
| `baseVersion` | string | no | Version read before editing. If the note changed on the server since then, it is not overwritten |

- `200 { "success": true, "version": "<new version>" }`
- `409` on conflict, with the server's current version so the client can decide what to keep:

```json
{ "error": "conflict", "content": "<current content>", "version": "<current version>" }
```

There is no conflict if the server content is already identical to what was sent.

### `POST /api/files/upload`

Uploads a file. **The body is the raw file** (any `Content-Type`, up to `MAX_UPLOAD_MB`); metadata goes in the query string.

| Query | Description |
|-------|-------------|
| `name` | Required. File name |
| `note` | Path of the note the file is attached to. The target folder comes from the attachment setting (`attachmentFolderPath`) |
| `folder` | Alternative to `note`: exact target folder (`''` = root). Only allowed extensions are accepted (see [`/settings/uploads`](#get-apisettingsuploads)) |

Never overwrites: if the name is taken it is saved as `image 1.png`, `image 2.png`…

```json
{ "path": "attachments/image 1.png" }
```

Errors: `400 Archivo vacío` (empty file), `400 Tipo de archivo no permitido` (extension not allowed), `413` too large.

### `DELETE /api/files/:filePath`

Moves the file or folder to the trash (`.trash/` inside the vault). Returns `{ "success": true }`.

### `POST /api/files/rename`

Renames or moves a file or folder and **rewrites the links** (wikilinks and markdown links) in notes that pointed to it.

```json
{ "oldPath": "idea.md", "newPath": "Projects/idea.md" }
```

```json
{ "success": true, "updated": ["Index.md", "Journal/2026-10-19.md"] }
```

`updated`: notes whose links were changed. Errors: source missing, target already exists, or moving a folder into itself.

### `POST /api/files/copy`

Duplicates a file or folder next to the original (`idea 1.md`, `idea 2.md`…).

```json
{ "path": "idea.md" }
```

```json
{ "success": true, "path": "idea 1.md" }
```

### `POST /api/files/create-note`

```json
{ "path": "Projects/new.md", "content": "" }
```

`content` is optional (empty by default). Fails if the file exists. Returns `{ "success": true }`.

### `POST /api/files/create-folder`

```json
{ "path": "Projects/2026" }
```

Fails if the folder exists. Returns `{ "success": true }`.

### `GET /api/files/download-folder/:folderPath`

Streams a folder as a ZIP (`<folder>-<date>.zip`). Symlinks are skipped. `400 No es una carpeta` if the path is a file.

### Trash

Actions use `POST` to avoid clashing with `DELETE /api/files/:filePath` (a note named `trash`).

#### `GET /api/files/trash`

Trash contents, most recent first.

```json
[
  { "id": "idea.md.1760000000000.deleted", "path": "Projects/idea.md", "name": "idea.md", "isFolder": false, "deletedAt": 1760000000000 }
]
```

`path` is the original location. Items deleted from Obsidian desktop have no original path and are restored to the root.

#### `POST /api/files/trash/restore`

```json
{ "id": "idea.md.1760000000000.deleted" }
```

Restores the item to its original path (or `idea 1.md` if that path is taken): `{ "success": true, "path": "Projects/idea.md" }`.

#### `POST /api/files/trash/delete`

Permanently deletes an item: `{ "id": "..." }` → `{ "success": true }`.

#### `POST /api/files/trash/empty`

Empties the trash: `{ "success": true }`.

---

## Search — `/api/search`

Session required. Both endpoints share the `SEARCH_RATE_MAX` requests per minute per IP limit (`429` + `Retry-After: 60`).

### `GET /api/search?q=<text>`

Case-insensitive search over all file names and the content of markdown notes (notes larger than `SEARCH_MAX_FILE_MB` are not read).

- Empty `q` → `[]`.
- `q` longer than `SEARCH_MAX_QUERY_LENGTH` → `400`.
- `q` of the form `tag:project` or `tag:#project` searches by tag (including subtags such as `project/web`).

```json
[
  {
    "path": "Projects/idea.md",
    "name": "idea.md",
    "nameMatch": true,
    "total": 3,
    "matches": [{ "line": 12, "text": "…an idea for the project…", "start": 4, "length": 4 }]
  }
]
```

- `total`: number of occurrences in the content. `matches` holds at most `SEARCH_MAX_MATCHES_PER_FILE`.
- `matches[].line` is 1-based; `start` and `length` locate the match inside `text` (a snippet of ~60 characters on each side).
- Ordering: name matches first, then by number of occurrences. At most `SEARCH_MAX_RESULTS` results.

### `GET /api/search/tags`

All tags in the vault (frontmatter `tags:` and `#tags` in the body, outside code blocks), case-insensitive.

```json
[{ "tag": "project/web", "paths": ["Projects/idea.md"] }]
```

---

## Settings — `/api/settings`

Session required.

### `GET /api/settings/vault`

`{ "vaultPath": "/srv/vaults/notes" }`

### `POST /api/settings/vault`

Changes the vault folder. Requires the current password (with the same attempt limit as login).

```json
{ "vaultPath": "/srv/vaults/other", "password": "..." }
```

- `200 { "vaultPath": "/srv/vaults/other" }` (the folder is created if missing).
- `403 Contraseña incorrecta`, `429`, `400` invalid path or path exists but is not a folder.

### `POST /api/settings/password`

```json
{ "currentPassword": "...", "newPassword": "..." }
```

Closes **all** sessions and gives a fresh cookie to the caller. `403` wrong current password, `400` new password too short, `429` too many attempts.

### `POST /api/settings/sessions/revoke`

Closes every session, including the current one (clears the cookie). `{ "success": true }`.

### `GET /api/settings/limits`

Server limits (read-only, set via environment variables).

```json
{
  "maxNoteMB": 20,
  "maxUploadMB": 50,
  "minPasswordLength": 12,
  "searchMaxQueryLength": 200,
  "searchMaxFileMB": 2,
  "searchMaxScannedMB": 200,
  "searchRateMax": 120,
  "searchMaxResults": 200,
  "searchMaxMatchesPerFile": 5,
  "sessionMaxDays": 30,
  "sessionIdleDays": 7
}
```

### `GET /api/settings/update`

Checks GitHub for a newer version (cached for 6 h; 30 min after a failure). With `UPDATE_CHECK=0` the server never contacts GitHub.

```json
{ "enabled": true, "current": "0.9.23", "latest": "0.9.24", "updateAvailable": true, "url": "https://github.com/loft17/Obsidita" }
```

### `POST /api/settings/site-title`

Site title (browser tab and login screen). Max 60 characters; empty = default.

```json
{ "siteTitle": "My notes" }
```

Returns `{ "siteTitle": "My notes" }`.

### `GET /api/settings/uploads`

Extensions that can be uploaded with `folder` (drag and drop into the file explorer).

```json
{ "extensions": ["md", "png", "jpg"], "defaults": ["md", "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "ico"] }
```

### `POST /api/settings/uploads`

```json
{ "extensions": "md, .pdf *.csv" }
```

`extensions` can be a string separated by spaces, commas or `;`, or an array. It is normalized (no dot, lowercase, deduplicated; max 100). Empty = back to defaults. Same response as the `GET`.

### `GET /api/settings/attachments`

Folder for new attachments, in Obsidian's format (`.obsidian/app.json → attachmentFolderPath`).

```json
{ "attachmentFolderPath": "./attachments" }
```

Values: `/` (vault root), `./` (same folder as the note), `./subfolder` (subfolder next to the note) or a vault path.

### `POST /api/settings/attachments`

`{ "attachmentFolderPath": "attachments" }` → returns the saved value. Rejects `..`, `.obsidian` and `.git`.

### `GET /api/settings/notes`

Daily notes and templates settings, stored in the same files as their Obsidian plugins (`.obsidian/daily-notes.json` and `.obsidian/templates.json`). `''` = default value.

```json
{
  "dailyNotes": { "folder": "Journal", "format": "YYYY-MM-DD", "template": "Templates/Daily" },
  "templates": { "folder": "Templates", "dateFormat": "YYYY-MM-DD", "timeFormat": "HH:mm" }
}
```

### `POST /api/settings/notes`

Partial update: only the fields sent are changed.

```json
{ "dailyNotes": { "folder": "Journal" }, "templates": { "timeFormat": "HH:mm" } }
```

Paths cannot contain `..`, `.obsidian` or `.git`; formats (moment.js) may include `/` to create subfolders, without `..` and up to 100 characters. Returns the full configuration.

### `GET /api/settings/download-vault`

Streams the whole vault as a ZIP (`vault-<date>.zip`). `.git` and `.trash` are excluded by default; `?git=1` and `?trash=1` include them. Symlinks are skipped.

---

## Sync — `/api/sync`

Session required. Syncs the vault with a GitHub repository.

### `GET /api/sync`

Configuration and status. Never returns the token, only `hasToken`.

```json
{
  "provider": "github",
  "interval": 15,
  "github": { "repo": "https://github.com/user/notes.git", "branch": "main", "authorName": "Obsidita", "authorEmail": "obsidita@localhost", "hasToken": true },
  "status": { "running": false, "lastSync": "2026-10-19T08:00:00.000Z", "lastAttempt": "2026-10-19T08:00:00.000Z", "lastError": null, "lastMessage": "..." }
}
```

### `POST /api/sync/config`

Partial update. Returns the resulting configuration (same as the `GET`).

| Field | Description |
|-------|-------------|
| `provider` | `none` or `github` |
| `interval` | Minutes between automatic syncs: `0` (off), `5`, `15`, `30`, `60`, `180` or `1440` |
| `github.repo` | Repository (`user/repo` or a GitHub URL). `''` clears it |
| `github.branch` | Branch (defaults to `main`) |
| `github.authorName`, `github.authorEmail` | Commit author (max 200 characters) |
| `github.token` | GitHub token. Only changed when sent: `''` = keep, `null` = delete |

### `POST /api/sync/run`

Syncs now and **waits for it to finish**. If a sync is already running, waits for that one. Returns the configuration; the outcome is in `status.lastError` / `status.lastMessage`.

### `GET /api/sync/history?path=<note>`

Git commits that touched the note (following renames), newest first. Only with `provider: "github"`.

```json
[{ "hash": "a1b2c3...", "date": 1760000000000, "author": "Obsidita", "message": "Sync", "path": "Projects/idea.md" }]
```

`path` is the note's path in that commit. No repository or no commits → `[]`.

### `GET /api/sync/history/version?path=<note>&commit=<hash>`

The note's content at that commit and the diff it introduced:

```json
{ "hash": "...", "date": 1760000000000, "author": "...", "message": "...", "path": "...", "content": "...", "diff": "diff --git ..." }
```

`400` if the commit is not in the note's history or the version exceeds `MAX_NOTE_MB`. If only the diff is too large, `diff` is empty.

---

## Fonts — `/api/fonts`

Session required. Custom fonts copied into `FONTS_DIR` (default `web/src/fonts/`).

### `GET /api/fonts`

Family, weight and style are derived from the file name (Google Fonts convention: `Lora-BoldItalic.ttf`, `Lora-VariableFont_wght.ttf`).

```json
[{ "file": "Lora-BoldItalic.ttf", "family": "Lora", "weight": "700", "style": "italic" }]
```

For variable fonts `weight` is `"100 900"`.

### `GET /api/fonts/file/:name`

Returns the font file (`.woff2`, `.woff`, `.ttf`, `.otf`) with `Cache-Control: private, max-age=86400`. `404` if missing or the name is invalid.

---

## Health — `/healthz`

Public (no session, no CSRF) and outside `/api`, meant for the reverse proxy, Docker's `HEALTHCHECK` or an external monitor. It returns no paths or vault data. It also answers `HEAD` and sends `Cache-Control: no-store`.

### `GET /healthz`

```json
{ "status": "ok", "configured": true, "vault": true, "version": "0.9.20262019", "uptime": 3600 }
```

- `configured`: whether setup has been completed.
- `vault`: whether the vault folder exists and is readable and writable (`null` when not configured). A disk that does not answer within 3 s counts as `false`.
- `uptime`: seconds since the process started.

Status `200` when everything is fine **or setup is still pending** (so the container is not flagged unhealthy before setup); `503` with `"status": "error"` when configured but the vault is not accessible.

```bash
curl -fsS http://localhost:3000/healthz
# Docker: HEALTHCHECK CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
```

---

## curl example

```bash
BASE=http://localhost:3000

# Login: stores the session cookie in cookies.txt
curl -c cookies.txt -H 'Content-Type: application/json' \
  -d '{"password":"your-password"}' $BASE/api/auth/login

# Vault tree
curl -b cookies.txt $BASE/api/files/tree

# Read a note (the whole path is encoded, slashes included)
curl -b cookies.txt "$BASE/api/files/read/Projects%2Fidea.md"

# Save a note
curl -b cookies.txt -H 'Content-Type: application/json' \
  -d '{"content":"# Hello\n"}' "$BASE/api/files/write/Projects%2Fidea.md"

# Upload an image as an attachment of the note
curl -b cookies.txt --data-binary @photo.png -H 'Content-Type: image/png' \
  "$BASE/api/files/upload?note=Projects%2Fidea.md&name=photo.png"

# Search
curl -b cookies.txt "$BASE/api/search?q=project"

# Logout
curl -b cookies.txt -X POST $BASE/api/auth/logout
```
