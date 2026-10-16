


## Tecnologías

| Capa | Stack |
| :--- | :--- |
| **Backend** | Node.js ≥ 20 (ESM, sin paso de compilación), Express 4, `cookie-parser`, `markdown-it` (exportación a PDF), `crypto.scrypt` |
| **Frontend** | React 18, Vite 6, TypeScript, Zustand |
| **Editor** | CodeMirror 6 + Lezer Markdown, con extensiones propias de vista previa en vivo, tablas y wikilinks |
| **Lectura** | `markdown-it` con reglas propias: wikilinks, incrustaciones, callouts, `==resaltado==` y `#etiquetas`; `highlight.js` (carga diferida) para los bloques de código |
| **Estilos** | CSS propio inspirado en Obsidian (`web/src/styles/obsidian.css`), con variables para los temas |

Todas las dependencias están en el `package.json` de la raíz. El frontend se compila con Vite en el `postinstall`, por eso las dependencias de desarrollo son necesarias también en producción.

---

## Flujos principales

### Arranque y autenticación

1. `server/index.js` crea `data/` (permisos `700`/`600`), carga o genera `data/.secret` para firmar las cookies y monta las rutas.
2. Si no existe `data/config.json`, `routes/setup.js` genera un **token de un solo uso** y lo imprime en la consola.
3. En el navegador, `App.tsx` llama a `/api/setup/status`:
   - Sin configurar → `Setup.tsx` → `POST /api/setup/init` con el token, la ruta del vault y la contraseña. El servidor valida la ruta (`vault.checkVaultPath`) y guarda el hash scrypt en `config.json`.
   - Configurado → intenta `GET /api/files/tree`; si responde `401`, muestra `Login.tsx`.
4. `POST /api/auth/login` verifica la contraseña (`password.js`) y crea una sesión (`sessions.js`): la cookie firmada `token` lleva un valor aleatorio y en `data/sessions.json` solo se guarda su SHA-256.
5. Todo `/api` salvo `setup` y `auth` pasa por el middleware de sesión de `index.js`. `getConfig()` relee `config.json` en cada petición, así que un cambio de vault se aplica al instante.

### Abrir y guardar una nota

```mermaid
sequenceDiagram
    participant E as Editor.tsx
    participant S as Servidor
    E->>S: GET /files/read/:path
    S-->>E: content + version (SHA-1 del contenido)
    Note over E: el usuario escribe (2 s de espera)
    E->>S: POST /files/write/:path {content, baseVersion}
    alt la nota no ha cambiado en el servidor
        S-->>E: nueva version
    else ha cambiado en otro sitio
        S-->>E: 409 + contenido y versión actuales
        Note over E: ConflictDialog: conservar la mía o la del servidor
    end
```

- `MainLayout.tsx` carga la nota al cambiar de pestaña y guarda su versión en `noteVersions` (`Editor.tsx`).
- El autoguardado se lanza a los 2 s sin escribir. `Ctrl+S` (`flushPendingSave`) lo adelanta. Antes de renombrar, mover o borrar se vacían los guardados pendientes.
- `vault.writeFile` solo escribe si la versión del disco coincide con `baseVersion`. Si no coincide, lanza `ConflictError` y la ruta responde `409`; el cliente abre `ConflictDialog`.

### Cambios hechos fuera de esta pestaña

`MainLayout.tsx` vuelve a leer la nota abierta cada 15 s mientras la pestaña está visible, al volver a ella y al recibir el evento `NOTES_CHANGED`. Si la versión ha cambiado y no hay cambios sin guardar, sustituye el contenido; si los hay, no toca nada y será el guardado el que detecte el conflicto.

### Renombrar y mover

`POST /api/files/rename` llama a `links.prepareLinkUpdate` **antes** de mover: resuelve cada enlace del vault con el árbol antiguo. Después de mover reescribe los que ya no llegan a su destino (`[[wikilinks]]`, `![[incrustaciones]]` y `[enlaces](markdown)`) y devuelve las notas modificadas. El cliente lanza `NOTES_CHANGED` para recargar la nota abierta y las incrustaciones.

> [!IMPORTANT]
> La resolución de wikilinks está **duplicada** en `web/src/wikilinks.ts` (cliente) y `server/links.js` (servidor), y deben comportarse igual: ruta exacta desde la raíz, relativa a la nota y, por último, por nombre en cualquier carpeta (la más cercana a la nota). Si cambias una, cambia la otra.

### Modo lectura e incrustaciones

`ReadingView.tsx` configura una instancia de `markdown-it` (`html: false`) con reglas propias: `[[wikilinks]]` (atenuados si no existen), `![[imagen]]` con tamaño, `![[nota]]` / `![[nota#encabezado]]`, callouts `> [!tipo]`, `==resaltado==`, `#etiquetas` y bloques de código con botón de copiar y resaltado de sintaxis (`codeHighlight.ts`, que descarga highlight.js solo cuando una nota tiene código). Los bloques ` ```mermaid ` se convierten en diagramas con `mermaidDiagrams.ts`, que también descarga Mermaid bajo demanda, lo usa con `securityLevel: 'strict'` (etiquetas saneadas, sin clics con JavaScript) y guarda los SVG en caché por tema. Mermaid mete `<style>` en cada SVG, lo que la CSP ya permite con `style-src 'unsafe-inline'`; no usa `eval`, así que `script-src` no cambia.

El render es síncrono, así que las notas incrustadas se piden en segundo plano a `noteEmbeds.ts`. Al llegar, avisa (`useSyncExternalStore`) y la vista se vuelve a pintar. La profundidad máxima de incrustación es 4, y una nota no puede incrustarse a sí misma en bucle.

### Búsqueda y etiquetas

`routes/search.js` busca sobre el índice en memoria de `searchIndex.js`. En cada consulta se recorre el árbol del vault (solo `stat`) y se vuelven a leer únicamente las notas cuya fecha de modificación o tamaño han cambiado; así el índice recoge lo guardado desde la web, la sincronización con GitHub y los cambios hechos fuera de la app, sin vigilar la carpeta. Se construye en la primera búsqueda. Los límites de `limits.js` siguen aplicándose: tamaño por archivo, total indexado, resultados, coincidencias y peticiones por minuto. `tag:` busca en la propiedad `tags` del frontmatter y en las `#etiquetas` del cuerpo, fuera de bloques de código. `GET /api/search/tags` usa el mismo índice para el panel de etiquetas; las etiquetas de cada nota se calculan una vez por versión.

### Papelera

`vault.deleteFile` mueve el elemento a `.trash/` como `nombre.ext.<timestamp>.deleted` y apunta su ruta original en `.trash/.index.json`. `TrashPanel.tsx` permite restaurarlo a esa ruta, borrarlo definitivamente o vaciar la papelera.

### Sincronización con GitHub

`server/sync.js` ejecuta `git` con `spawn` y sin shell: commit de los cambios locales → `fetch` → `rebase -X theirs` sobre la rama remota (en un conflicto gana la versión del servidor; si aun así falla, `rebase --abort`) → `push`. Toda la configuración de git va en variables `GIT_CONFIG_*` del proceso; el token viaja como cabecera `extraHeader` en ellas, nunca en la URL ni en `.git/config`, y se elimina de los mensajes de error. Un temporizador comprueba cada minuto si toca la sincronización periódica según `interval`.

**Historial de versiones.** Con la sincronización activa, `noteHistory` saca de `git log --follow` los commits que tocaron una nota (siguiendo los renombrados, hasta 200) y `noteAtCommit` devuelve su contenido en uno de ellos (`git cat-file`) y el diff de ese commit (`git show`, sin `textconv` ni diff externos). Las rutas se pasan con `GIT_LITERAL_PATHSPECS=1` y el commit pedido tiene que estar en el historial de la nota. `HistoryDialog` (en `FileDialogs.tsx`, desde el menú de la nota) lo muestra; restaurar es un guardado normal con la versión conocida, así que no pisa cambios hechos en otro sitio.

---

## Seguridad en el código

Qué hace cada medida está en el README ([Seguridad](../README.md#-seguridad)). Aquí, dónde está cada una. Si tocas alguno de estos archivos, revisa que la medida sigue en pie:

| Medida | Dónde |
| :--- | :--- |
| Rutas dentro del vault, sin `../`, sin symlinks hacia fuera, `.obsidian/` y `.git/` protegidas | `vault.js` → `guardPath()`. **Toda** ruta que llega del cliente debe pasar por aquí. |
| Rutas válidas para un vault (sin carpetas del sistema ni de la app, `VAULTS_ROOT`) | `vault.js` → `checkVaultPath()` |
| CSP, HSTS y demás cabeceras; hashes CSP de los scripts en línea de `index.html` | `security.js` → `securityHeaders()` |
| CSRF (`Sec-Fetch-Site` y `Origin`) | `security.js` → `csrfGuard` |
| Errores sin rutas internas ni trazas | `security.js` → `publicError()` y el manejador de errores de `index.js` |
| Sesiones revocables y límite de intentos | `sessions.js` |
| Contraseñas (scrypt, comparación en tiempo constante) | `password.js` |
| `git` sin hooks ni `core.fsmonitor`, solo `https://github.com/` | `sync.js` |
| Archivos del vault servidos con CSP *sandbox* (SVG) | `routes/files.js` → `/raw` |

---

## Archivos de datos

La carpeta `data/` se crea sola, está en `.gitignore` y el servidor ajusta sus permisos al arrancar (`700` la carpeta, `600` los archivos).

| Archivo | Contenido |
| :--- | :--- |
| `config.json` | `vaultPath`, `passwordHash` (scrypt: 16 bytes de sal + 32 de hash, en hexadecimal), `port` y `createdAt`. Se relee en cada petición. |
| `.secret` | Secreto aleatorio que firma las cookies. Si se borra, se genera otro y todas las sesiones dejan de valer. |
| `sessions.json` | Hashes SHA-256 de las sesiones activas, con su caducidad y última actividad (nunca los tokens en claro). La actividad se guarda en disco como mucho una vez por hora. |
| `sync.json` | Configuración de la sincronización con GitHub, su último estado y el token (si lo hay). |

Dentro del vault, la app solo usa:

| Ruta | Uso |
| :--- | :--- |
| `.trash/` | Papelera: `nombre.ext.<timestamp>.deleted`, con las rutas originales en `.trash/.index.json`. |
| `.obsidian/app.json` | Solo la clave `attachmentFolderPath` (carpeta de adjuntos). |
| `.obsidian/daily-notes.json` | Claves `folder`, `format` y `template` (notas diarias). |
| `.obsidian/templates.json` | Claves `folder`, `dateFormat` y `timeFormat` (plantillas). |
| `.git/` | Solo con la sincronización con GitHub: el repositorio local (se crea si no existe). |

---



> [!NOTE]
> Las acciones de la papelera van por `POST` y no por `DELETE` para no chocar con `DELETE /api/files/:filePath` cuando una nota se llama `trash`.

---

## Estado del frontend

`web/src/store.ts` (Zustand) guarda:

- **Vault y navegación**: `tree` (lista plana del vault), `tabs` (`{ path, name, isDirty }`), `activeTab`, `expandedFolders`, `sidebarView` (`files`, `search`, `tags` o `trash`) y `searchQuery`.
- **Edición**: `editMode` (edición o lectura) y `conflicts` (conflictos de guardado pendientes, se muestran de uno en uno).
- **Preferencias de interfaz**: tema, tamaño de fuente, modo del editor (`preview` / `source`), título en línea, números de línea, longitud de línea legible, cinta, cabecera de pestaña y carpetas ocultas. Se guardan en `localStorage`, así que son **por navegador**.

Fuera del store, en `Editor.tsx`, viven `noteVersions` (versión conocida de cada nota) y los guardados pendientes y en curso.

---

Las convenciones de código y las recetas para cambios habituales están en [DESARROLLO.md](DESARROLLO.md).
