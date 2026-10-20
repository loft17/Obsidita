# API HTTP de Obsidita

Referencia de los endpoints que expone el servidor (`server/`). La web (`web/src/api.ts`) es el único cliente oficial, pero la API se puede usar desde scripts siempre que se respeten la autenticación por cookie y la protección CSRF descritas abajo.

> Todas las rutas cuelgan de `/api`. Express no distingue mayúsculas en las rutas (`/API/files/tree` también funciona).

---

## Índice

- [Conceptos generales](#conceptos-generales)
  - [Autenticación](#autenticación)
  - [CSRF](#csrf)
  - [Formato de las peticiones y respuestas](#formato-de-las-peticiones-y-respuestas)
  - [Rutas de archivos](#rutas-de-archivos)
  - [Códigos de estado](#códigos-de-estado)
  - [Límites](#límites)
- [Setup](#setup--apisetup) — configuración inicial
- [Auth](#auth--apiauth) — login y logout
- [Files](#files--apifiles) — notas, adjuntos, carpetas y papelera
- [Search](#search--apisearch) — búsqueda y etiquetas
- [Settings](#settings--apisettings) — ajustes del servidor y del vault
- [Sync](#sync--apisync) — sincronización con GitHub e historial
- [Fonts](#fonts--apifonts) — fuentes propias
- [Salud](#salud--healthz) — estado del servicio para proxy y Docker
- [Ejemplo con curl](#ejemplo-con-curl)

---

## Conceptos generales

### Autenticación

- `POST /api/auth/login` crea una sesión y devuelve una cookie **firmada** `token` (`HttpOnly`, `SameSite=Strict`, `Secure` si la petición llega por HTTPS).
- La cookie dura como máximo `SESSION_MAX_DAYS` (30 días) y caduca antes si pasa `SESSION_IDLE_DAYS` (7 días) sin usarse.
- En el servidor solo se guarda el hash del token (`data/sessions.json`), así que cerrar sesión invalida la cookie aunque alguien la haya copiado.
- Rutas **públicas**: `/api/setup/*` y `/api/auth/*`. **Todo lo demás** exige sesión:
  - Sin configurar (no existe `data/config.json`) → `503 {"error":"Not configured"}`.
  - Sin sesión válida → `401 {"error":"Unauthorized"}`.

### CSRF

Todas las peticiones a `/api` con método distinto de `GET`, `HEAD` u `OPTIONS` pasan por `csrfGuard` (`server/security.js`):

- `Sec-Fetch-Site: cross-site` → `403 {"error":"Origen no permitido"}`.
- Si llega cabecera `Origin`, debe coincidir exactamente (esquema, host y puerto) con el del servidor. Detrás de un proxy se usan `X-Forwarded-Proto` / `X-Forwarded-Host` si `TRUST_PROXY` está definido.
- Sin cabecera `Origin` (p. ej. `curl`) la petición se acepta.

### Formato de las peticiones y respuestas

- Los cuerpos son JSON (`Content-Type: application/json`), salvo `POST /api/files/upload`, que recibe el archivo en crudo.
- El JSON se limita a **100 KB**, excepto en `/api/files/*`, que admite hasta `MAX_NOTE_MB` (20 MB).
- Los errores siempre tienen la forma `{"error": "<mensaje>"}`. Algunos añaden campos (p. ej. el `409` de conflicto al guardar).
- Los errores del sistema de archivos se traducen a mensajes genéricos (`No encontrado`, `Permiso denegado`, `Ya existe`…) para no exponer rutas internas del servidor.
- Cualquier ruta `/api/...` inexistente responde `404 {"error":"No encontrado"}` (nunca el `index.html` de la SPA).

### Rutas de archivos

- Todas las rutas de notas y carpetas son **relativas al vault** y usan `/` como separador (`Proyectos/Web/idea.md`).
- Cuando la ruta va en la URL (`/files/read/:filePath`, `/files/:filePath`…), se envía **codificada entera** con `encodeURIComponent`, incluidas las barras: `/api/files/read/Proyectos%2FWeb%2Fidea.md`.
- El servidor rechaza:
  - Rutas que salen del vault (`..`, rutas absolutas, enlaces simbólicos que apuntan fuera) → `Path traversal attempt`.
  - Cualquier cosa dentro de `.obsidian/` o `.git/` → `Ruta protegida`.

### Códigos de estado

| Código | Significado |
|--------|-------------|
| `200` | Correcto |
| `304` | La nota no ha cambiado (`GET /files/read` con `?version=`) |
| `400` | Petición no válida, validación fallida o error de la operación |
| `401` | Sin sesión, o contraseña incorrecta en el login |
| `403` | Token de setup incorrecto, contraseña actual incorrecta o CSRF |
| `404` | No encontrado |
| `409` | Conflicto al guardar: la nota cambió en el servidor |
| `413` | Cuerpo demasiado grande |
| `429` | Demasiados intentos (login / contraseña) o demasiadas búsquedas. Incluye `Retry-After` (segundos) |
| `500` | Error interno |
| `503` | El servidor no está configurado todavía |

### Límites

Se configuran con variables de entorno (ver `.env.example`) y se pueden consultar con [`GET /api/settings/limits`](#get-apisettingslimits).

- **Login y acciones con contraseña** (login, cambiar vault, cambiar contraseña): 5 fallos en 15 min por IP (las IPv6 se agrupan por /64) bloquean esa IP 1 min, duplicándose en cada bloqueo hasta 1 h. Además, 50 fallos en total en 15 min bloquean el login para todos durante 5 min.
- **Búsqueda y etiquetas**: `SEARCH_RATE_MAX` (120) peticiones por IP y minuto, compartido entre `/search` y `/search/tags`.

---

## Setup — `/api/setup`

Públicas. Sirven para la configuración inicial, cuando todavía no existe `data/config.json`.

### `GET /api/setup/status`

Estado de la instalación.

```json
{ "configured": true, "minPasswordLength": 12, "siteTitle": "Mis notas" }
```

`siteTitle` es público porque se muestra en la pantalla de login (vacío = título por defecto).

### `POST /api/setup/init`

Crea la configuración. Solo funciona si la app no está configurada.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `setupToken` | string | sí | Token de un solo uso que el servidor imprime en la consola al arrancar sin configurar |
| `vaultPath` | string | sí | Ruta **absoluta** del vault. Se crea si no existe. No puede ser una carpeta del sistema, y si `VAULTS_ROOT` está definido debe estar dentro |
| `password` | string | sí | Al menos `MIN_PASSWORD_LENGTH` caracteres |
| `port` | number | no | Puerto (1-65535). Por defecto `3000` |

Respuesta: `{ "success": true }`.

Errores: `400 Already configured`, `403` token incorrecto, `400` campos ausentes, contraseña corta, puerto o ruta no válidos.

Al terminar se borran las sesiones y la configuración de sincronización anteriores (`data/sync.json`), con copia de seguridad previa de `data/`.

---

## Auth — `/api/auth`

Públicas.

### `POST /api/auth/login`

```json
{ "password": "..." }
```

- `200 { "success": true }` + cookie `token`.
- `400 Missing password`, `401 Contraseña incorrecta`, `429` demasiados intentos (con `Retry-After`).

### `POST /api/auth/logout`

Invalida la sesión actual y borra la cookie. Responde `{ "success": true }` (también sin sesión).

---

## Files — `/api/files`

Requieren sesión.

### `GET /api/files/tree`

Árbol completo del vault como lista plana, ordenada por nombre y recorrida en profundidad. Se omiten los elementos ocultos (los que empiezan por `.`, incluida `.trash`) y los enlaces simbólicos.

```json
[
  { "type": "folder", "path": "Proyectos", "name": "Proyectos" },
  { "type": "file", "path": "Proyectos/idea.md", "name": "idea.md", "size": 1234, "mtime": 1760000000000 },
  { "type": "other", "path": "Proyectos/foto.png", "name": "foto.png" }
]
```

`type`: `folder`, `file` (solo notas `.md`, con `size` en bytes y `mtime` en ms) u `other` (cualquier otro archivo).

### `GET /api/files/read/:filePath`

Lee una nota como texto UTF-8.

| Query | Descripción |
|-------|-------------|
| `version` | Opcional. Versión que ya tiene el cliente. Si coincide con la actual, responde `304` sin cuerpo |

```json
{ "content": "# Hola\n...", "version": "3f786850e387550fdab836ed7e6dc881de23001b" }
```

`version` es el SHA-1 del contenido. Se envía `Cache-Control: no-store`.

### `GET /api/files/raw/:filePath`

Devuelve el archivo binario tal cual (imágenes y otros adjuntos), con su `Content-Type`. Se sirve con una CSP en modo `sandbox` para que un SVG abierto directamente no pueda ejecutar scripts. `404` si no existe.

### `GET /api/files/export-pdf/:filePath`

Devuelve una página HTML con la nota renderizada (sin el frontmatter) que lanza el diálogo de impresión del navegador al cargarse. Es la base de "Exportar a PDF".

### `POST /api/files/write/:filePath`

Guarda una nota (la crea si no existe, junto con sus carpetas).

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `content` | string | sí | Contenido completo de la nota |
| `baseVersion` | string | no | Versión que se leyó antes de editar. Si la nota ha cambiado en el servidor desde entonces, no se sobrescribe |

- `200 { "success": true, "version": "<nueva versión>" }`
- `409` si hay conflicto. Trae la versión actual del servidor para que el cliente decida qué conservar:

```json
{ "error": "conflict", "content": "<contenido actual>", "version": "<versión actual>" }
```

No hay conflicto si el contenido del servidor ya es idéntico al que se envía.

### `POST /api/files/upload`

Sube un archivo. El **cuerpo es el archivo en crudo** (cualquier `Content-Type`, hasta `MAX_UPLOAD_MB`); los metadatos van en la query.

| Query | Descripción |
|-------|-------------|
| `name` | Obligatorio. Nombre del archivo |
| `note` | Ruta de la nota a la que se adjunta. La carpeta destino sale del ajuste de adjuntos (`attachmentFolderPath`) |
| `folder` | Alternativa a `note`: carpeta destino exacta (`''` = raíz). Solo admite las extensiones permitidas (ver [`/settings/uploads`](#get-apisettingsuploads)) |

Nunca sobrescribe: si el nombre ya existe se guarda como `imagen 1.png`, `imagen 2.png`…

```json
{ "path": "adjuntos/imagen 1.png" }
```

Errores: `400 Archivo vacío`, `400 Tipo de archivo no permitido`, `413` demasiado grande.

### `DELETE /api/files/:filePath`

Mueve el archivo o carpeta a la papelera (`.trash/` dentro del vault). Responde `{ "success": true }`.

### `POST /api/files/rename`

Renombra o mueve un archivo o carpeta y **reescribe los enlaces** (wikilinks y enlaces markdown) de las notas que apuntaban a él.

```json
{ "oldPath": "idea.md", "newPath": "Proyectos/idea.md" }
```

```json
{ "success": true, "updated": ["Índice.md", "Diario/2026-10-19.md"] }
```

`updated`: notas cuyos enlaces se han modificado. Errores: el origen no existe, el destino ya existe o se intenta mover una carpeta dentro de sí misma.

### `POST /api/files/copy`

Duplica un archivo o carpeta junto al original (`idea 1.md`, `idea 2.md`…).

```json
{ "path": "idea.md" }
```

```json
{ "success": true, "path": "idea 1.md" }
```

### `POST /api/files/create-note`

```json
{ "path": "Proyectos/nueva.md", "content": "" }
```

`content` es opcional (vacío por defecto). Falla si el archivo ya existe. Responde `{ "success": true }`.

### `POST /api/files/create-folder`

```json
{ "path": "Proyectos/2026" }
```

Falla si la carpeta ya existe. Responde `{ "success": true }`.

### `GET /api/files/download-folder/:folderPath`

Descarga una carpeta como ZIP (`<carpeta>-<fecha>.zip`) por streaming. Se omiten los enlaces simbólicos. `400 No es una carpeta` si la ruta es un archivo.

### Papelera

Las acciones van por `POST` para no chocar con `DELETE /api/files/:filePath` (una nota llamada `trash`).

#### `GET /api/files/trash`

Contenido de la papelera, lo más reciente primero.

```json
[
  { "id": "idea.md.1760000000000.deleted", "path": "Proyectos/idea.md", "name": "idea.md", "isFolder": false, "deletedAt": 1760000000000 }
]
```

`path` es la ruta original. Lo borrado desde Obsidian de escritorio no tiene ruta original y se restaura en la raíz.

#### `POST /api/files/trash/restore`

```json
{ "id": "idea.md.1760000000000.deleted" }
```

Devuelve el elemento a su ruta original (o a `idea 1.md` si esa ruta está ocupada): `{ "success": true, "path": "Proyectos/idea.md" }`.

#### `POST /api/files/trash/delete`

Borra definitivamente un elemento: `{ "id": "..." }` → `{ "success": true }`.

#### `POST /api/files/trash/empty`

Vacía la papelera: `{ "success": true }`.

---

## Search — `/api/search`

Requieren sesión. Comparten el límite de `SEARCH_RATE_MAX` peticiones por minuto e IP (`429` + `Retry-After: 60`).

### `GET /api/search?q=<texto>`

Busca sin distinguir mayúsculas en el nombre de todos los archivos y en el contenido de las notas markdown (las de más de `SEARCH_MAX_FILE_MB` no se leen).

- `q` vacío → `[]`.
- `q` más largo que `SEARCH_MAX_QUERY_LENGTH` → `400`.
- `q` con la forma `tag:proyecto` o `tag:#proyecto` busca por etiqueta (incluye subetiquetas como `proyecto/web`).

```json
[
  {
    "path": "Proyectos/idea.md",
    "name": "idea.md",
    "nameMatch": true,
    "total": 3,
    "matches": [{ "line": 12, "text": "…una idea para el proyecto…", "start": 4, "length": 4 }]
  }
]
```

- `total`: número de apariciones en el contenido. `matches` incluye como mucho `SEARCH_MAX_MATCHES_PER_FILE`.
- `matches[].line` empieza en 1; `start` y `length` marcan la coincidencia dentro de `text` (un fragmento de unos 60 caracteres a cada lado).
- Orden: primero las coincidencias por nombre, después por número de apariciones. Como mucho `SEARCH_MAX_RESULTS` resultados.

### `GET /api/search/tags`

Todas las etiquetas del vault (del frontmatter `tags:` y `#etiquetas` del cuerpo, fuera de bloques de código), sin distinguir mayúsculas.

```json
[{ "tag": "proyecto/web", "paths": ["Proyectos/idea.md"] }]
```

---

## Settings — `/api/settings`

Requieren sesión.

### `GET /api/settings/vault`

`{ "vaultPath": "/srv/vaults/notas" }`

### `POST /api/settings/vault`

Cambia la carpeta del vault. Exige la contraseña actual (con el mismo límite de intentos que el login).

```json
{ "vaultPath": "/srv/vaults/otro", "password": "..." }
```

- `200 { "vaultPath": "/srv/vaults/otro" }` (la carpeta se crea si no existe).
- `403 Contraseña incorrecta`, `429`, `400` ruta no válida o que existe pero no es una carpeta.

### `POST /api/settings/password`

```json
{ "currentPassword": "...", "newPassword": "..." }
```

Cierra **todas** las sesiones y da una cookie nueva a quien hace el cambio. `403` contraseña actual incorrecta, `400` contraseña nueva demasiado corta, `429` demasiados intentos.

### `POST /api/settings/sessions/revoke`

Cierra todas las sesiones, también la actual (borra la cookie). `{ "success": true }`.

### `GET /api/settings/limits`

Límites del servidor (solo lectura, definidos con variables de entorno).

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

Comprueba si hay una versión nueva en GitHub (con caché de 6 h; 30 min si falla). Con `UPDATE_CHECK=0` no se conecta a GitHub.

```json
{ "enabled": true, "current": "0.9.23", "latest": "0.9.24", "updateAvailable": true, "url": "https://github.com/loft17/Obsidita" }
```

### `POST /api/settings/site-title`

Título de la web (pestaña y pantalla de login). Máximo 60 caracteres; vacío = el predeterminado.

```json
{ "siteTitle": "Mis notas" }
```

Responde `{ "siteTitle": "Mis notas" }`.

### `GET /api/settings/prefs`

Preferencias de la interfaz (tema, fuentes, modo por defecto de las notas, idioma...) compartidas por todos los dispositivos. Se guardan en `data/prefs.json`; `null` si aún no hay ninguna.

```json
{ "prefs": { "defaultNoteMode": "view", "theme": "light" } }
```

### `POST /api/settings/prefs`

Cambia solo las claves enviadas; `null` borra una clave. Valores de texto (máximo 10 000 caracteres, 100 claves). Responde con todas las preferencias.

```json
{ "defaultNoteMode": "view", "fontText": null }
```

### `GET /api/settings/uploads`

Extensiones que se pueden subir con `folder` (arrastrar al explorador).

```json
{ "extensions": ["md", "png", "jpg"], "defaults": ["md", "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "ico"] }
```

### `POST /api/settings/uploads`

```json
{ "extensions": "md, .pdf *.csv" }
```

`extensions` puede ser un texto separado por espacios, comas o `;`, o un array. Se normaliza (sin punto, en minúsculas, sin repetir; máximo 100). Vacío = volver a las predeterminadas. Responde igual que el `GET`.

### `GET /api/settings/attachments`

Carpeta de los adjuntos nuevos, con el formato de Obsidian (`.obsidian/app.json → attachmentFolderPath`).

```json
{ "attachmentFolderPath": "./adjuntos" }
```

Valores: `/` (raíz del vault), `./` (misma carpeta que la nota), `./subcarpeta` (subcarpeta junto a la nota) o una ruta del vault.

### `POST /api/settings/attachments`

`{ "attachmentFolderPath": "adjuntos" }` → responde con el valor guardado. Rechaza `..`, `.obsidian` y `.git`.

### `GET /api/settings/notes`

Ajustes de notas diarias y plantillas, en los mismos archivos que sus plugins de Obsidian (`.obsidian/daily-notes.json` y `.obsidian/templates.json`). `''` = valor por defecto.

```json
{
  "dailyNotes": { "folder": "Diario", "format": "YYYY-MM-DD", "template": "Plantillas/Diario" },
  "templates": { "folder": "Plantillas", "dateFormat": "YYYY-MM-DD", "timeFormat": "HH:mm" }
}
```

### `POST /api/settings/notes`

Actualización parcial: solo se cambian los campos enviados.

```json
{ "dailyNotes": { "folder": "Diario" }, "templates": { "timeFormat": "HH:mm" } }
```

Las rutas no pueden contener `..`, `.obsidian` ni `.git`; los formatos (moment.js) pueden incluir `/` para crear subcarpetas, sin `..` y con un máximo de 100 caracteres. Responde con la configuración completa.

### `GET /api/settings/download-vault`

Descarga el vault completo como ZIP (`vault-<fecha>.zip`) por streaming. Por defecto se excluyen `.git` y `.trash`; `?git=1` y `?trash=1` los incluyen. Se omiten los enlaces simbólicos.

---

## Sync — `/api/sync`

Requieren sesión. Sincronización del vault con un repositorio de GitHub.

### `GET /api/sync`

Configuración y estado. Nunca devuelve el token, solo `hasToken`.

```json
{
  "provider": "github",
  "interval": 15,
  "github": { "repo": "https://github.com/usuario/notas.git", "branch": "main", "authorName": "Obsidita", "authorEmail": "obsidita@localhost", "hasToken": true },
  "status": { "running": false, "lastSync": "2026-10-19T08:00:00.000Z", "lastAttempt": "2026-10-19T08:00:00.000Z", "lastError": null, "lastMessage": "..." }
}
```

### `POST /api/sync/config`

Actualización parcial. Responde con la configuración resultante (como el `GET`).

| Campo | Descripción |
|-------|-------------|
| `provider` | `none` o `github` |
| `interval` | Minutos entre sincronizaciones automáticas: `0` (desactivada), `5`, `15`, `30`, `60`, `180` o `1440` |
| `github.repo` | Repositorio (`usuario/repo` o URL de GitHub). `''` lo borra |
| `github.branch` | Rama (por defecto `main`) |
| `github.authorName`, `github.authorEmail` | Autor de los commits (máx. 200 caracteres) |
| `github.token` | Token de GitHub. Se cambia solo si llega: `''` = no tocar, `null` = borrar |

### `POST /api/sync/run`

Sincroniza ahora y **espera a que termine**. Si ya hay una en marcha, espera a esa. Responde con la configuración; el resultado está en `status.lastError` / `status.lastMessage`.

### `GET /api/sync/history?path=<nota>`

Commits de git que han tocado la nota (siguiendo los renombrados), del más reciente al más antiguo. Solo con `provider: "github"`.

```json
[{ "hash": "a1b2c3...", "date": 1760000000000, "author": "Obsidita", "message": "Sync", "path": "Proyectos/idea.md" }]
```

`path` es la ruta que tenía la nota en ese commit. Sin repositorio o sin commits → `[]`.

### `GET /api/sync/history/version?path=<nota>&commit=<hash>`

Contenido de la nota en ese commit y el diff que introdujo:

```json
{ "hash": "...", "date": 1760000000000, "author": "...", "message": "...", "path": "...", "content": "...", "diff": "diff --git ..." }
```

`400` si el commit no está en el historial de la nota o si la versión supera `MAX_NOTE_MB`. Si solo el diff es demasiado grande, `diff` llega vacío.

---

## Fonts — `/api/fonts`

Requieren sesión. Fuentes propias copiadas en `FONTS_DIR` (por defecto `web/src/fonts/`).

### `GET /api/fonts`

Familia, peso y estilo se deducen del nombre del archivo (convención de Google Fonts: `Lora-BoldItalic.ttf`, `Lora-VariableFont_wght.ttf`).

```json
[{ "file": "Lora-BoldItalic.ttf", "family": "Lora", "weight": "700", "style": "italic" }]
```

En las fuentes variables `weight` es `"100 900"`.

### `GET /api/fonts/file/:name`

Devuelve el archivo de fuente (`.woff2`, `.woff`, `.ttf`, `.otf`) con `Cache-Control: private, max-age=86400`. `404` si no existe o el nombre no es válido.

---

## Salud — `/healthz`

Pública (sin sesión ni CSRF) y fuera de `/api`, pensada para el proxy inverso, el `HEALTHCHECK` de Docker o un monitor externo. No devuelve rutas ni datos del vault. Responde también a `HEAD` y lleva `Cache-Control: no-store`.

### `GET /healthz`

```json
{ "status": "ok", "configured": true, "vault": true, "version": "0.9.20262019", "uptime": 3600 }
```

- `configured`: si ya se hizo el setup.
- `vault`: si la carpeta del vault existe y se puede leer y escribir (`null` sin configurar). Si el disco no responde en 3 s cuenta como `false`.
- `uptime`: segundos desde que arrancó el proceso.

Código `200` si todo va bien **o aún no está configurado** (así el contenedor no se marca como caído antes del setup); `503` con `"status": "error"` si está configurado pero el vault no es accesible.

```bash
curl -fsS http://localhost:3000/healthz
# Docker: HEALTHCHECK CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
```

---

## Ejemplo con curl

```bash
BASE=http://localhost:3000

# Login: guarda la cookie de sesión en cookies.txt
curl -c cookies.txt -H 'Content-Type: application/json' \
  -d '{"password":"tu-contraseña"}' $BASE/api/auth/login

# Árbol del vault
curl -b cookies.txt $BASE/api/files/tree

# Leer una nota (la ruta va codificada entera, barras incluidas)
curl -b cookies.txt "$BASE/api/files/read/Proyectos%2Fidea.md"

# Guardar una nota
curl -b cookies.txt -H 'Content-Type: application/json' \
  -d '{"content":"# Hola\n"}' "$BASE/api/files/write/Proyectos%2Fidea.md"

# Subir una imagen como adjunto de la nota
curl -b cookies.txt --data-binary @foto.png -H 'Content-Type: image/png' \
  "$BASE/api/files/upload?note=Proyectos%2Fidea.md&name=foto.png"

# Buscar
curl -b cookies.txt "$BASE/api/search?q=proyecto"

# Logout
curl -b cookies.txt -X POST $BASE/api/auth/logout
```
