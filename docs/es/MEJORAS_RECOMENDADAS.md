<div align="center">

# 🛠️ Obsidita — Mejoras recomendadas

**Hoja de ruta de calidad, rendimiento, UX, accesibilidad y seguridad**

Auditoría completa del código (servidor Express + cliente React · ~16 000 líneas)

<sub>67 mejoras · 8 bloques · priorizadas por retorno</sub>

</div>

---

> [!info] Cómo leer este documento
> Cada mejora tiene un **número estable** (`#1` … `#67`) para poder citarla, una **prioridad** y un **esfuerzo** estimado.
> Las rutas de código son relativas a la raíz del repositorio, y el número tras `:` es la línea (`store.ts:324`).
> Este documento **no** incluye las imágenes de estado típicas (badges) a propósito: Obsidita bloquea por defecto las imágenes remotas, así que el documento se ve igual de bien sin conexión.

| Símbolo | Prioridad | Significado |
|:-------:|-----------|-------------|
| 🔴 | **P0** | Hazlo ya. Bug real, pérdida de datos o falsa garantía de seguridad |
| 🟠 | **P1** | Siguiente. Afecta al uso diario, al rendimiento o al mantenimiento |
| 🟡 | **P2** | Cuando haya hueco. Pulido, robustez y deuda técnica |

| Esf. | Estimación |
|:----:|------------|
| **S** | Menos de 1 hora |
| **M** | Alrededor de 1 día |
| **L** | Varios días |

---

## Índice

| Sección | Mejoras | 🔴 | 🟠 | 🟡 |
|---------|:-------:|:--:|:--:|:--:|
| [1. Seguridad y configuración](#1-seguridad-y-configuración) | 9 | — | 3 | 3 |
| [2. Rendimiento y memoria](#2-rendimiento-y-memoria) | 11 | 1 | 4 | 2 |
| [3. Experiencia de usuario](#3-experiencia-de-usuario) | 11 | 2 | 4 | 5 |
| [4. Accesibilidad](#4-accesibilidad) | 8 | — | 3 | 5 |
| [5. Calidad de código y arquitectura](#5-calidad-de-código-y-arquitectura) | 12 | 2 | 5 | 5 |
| [6. Pruebas, lint y CI](#6-pruebas-lint-y-ci) | 6 | 2 | 3 | 1 |
| [7. Operación y documentación](#7-operación-y-documentación) | 10 | 1 | 5 | 4 |
| [8. Por dónde empezar](#8-por-dónde-empezar) | — | — | — | — |
| [Lo que ya está corregido](#lo-que-ya-está-corregido) | 16 | — | — | — |
| **Total** | **67** | **8** | **27** | **25** |

---

## 1. Seguridad y configuración

| # | Prio | Esf. | Hallazgo | Cómo aplicarla |
|:--:|:----:|:----:|----------|----------------|
| 1 | ✅ | S | **`COOKIE_SECRET` está documentado en `.env.example:5` y el código no lo lee en ningún sitio.** Solo se usaba `data/.secret`, así que quien defina esa variable creerá que ha fijado el secreto de firma de cookies y no será cierto | **Corregido:** `server/cookieSecret.js` lee `COOKIE_SECRET` con prioridad sobre `data/.secret`; si la variable no es válida se avisa y se usa el archivo |
| 2 | ✅ | S | **`data/.secret` vacío o truncado se acepta tal cual.** Un secreto vacío permite a cualquiera calcular la firma de una cookie (`token=s%3A…`) y falsificarla | **Corregido:** se valida el formato (64 hex) y, si no cuadra, se regenera y se avisa por consola. Matiz: un secreto **vacío** no permite falsificar la firma, sino que rompe el login (`cookie-parser` lo interpreta como «sin secreto» y `res.cookie(..., { signed: true })` lanza excepción); el caso realmente explotable es el **truncado/débil**, cuya firma sí es adivinable por fuerza bruta |
| 3 | 🟠 | S | `.git` y `.obsidian` se bloquean solo en el **primer** segmento de la ruta (`vault.js:32`), así que `notas/.git/config` es escribible desde la web | Rechazar esos nombres en cualquier segmento: un `.git` anidado también admite `config`, hooks y filtros |
| 4 | 🟠 | S | La lista blanca de extensiones solo se aplica si la subida trae `folder` (`files.js:33`, `files.js:118`), y `create-note` no valida extensión | Decidir la política y aplicarla en un único sitio. Ojo: Obsidian admite adjuntos de cualquier tipo, así que lo probable es documentar «todo vale» en vez de «solo imágenes» |
| 5 | 🟠 | M | El limitador de login bloquea **globalmente** tras 50 fallos (`sessions.js:98`) y, sin `TRUST_PROXY`, todas las IP comparten contador: un atacante puede dejar fuera a todos los usuarios legítimos | Separar el cubo global del de IP (o hacerlo configurable) y documentar `TRUST_PROXY=1` como obligatorio detrás de un proxy |
| 6 | 🟡 | S | `UPDATE_CHECK` está activo por defecto, así que el servidor llama a `raw.githubusercontent.com` al arrancar (`updates.js:11-18`) | Hacerlo opt-in explícito o avisar en la primera ejecución |
| 7 | ✅ | S | `parseFontFile` no filtra caracteres de control del nombre del archivo y acaban en el `@font-face` generado (`fonts.js:55`) | **Corregido:** `sanitizeFamily` en `server/routes/fonts.js` elimina controles C0/C1/DEL además de `" \ ; { }`, y el fallback (`\|\| file`) también se limpia para que no se cuelen por esa vía |
| 8 | 🟡 | S | Si falta `TRUST_PROXY` detrás de HTTPS, la cookie de sesión se emite sin `Secure` | Advertir al arrancar cuando `HOST` no sea `127.0.0.1` y no haya `TRUST_PROXY` |
| 9 | 🟡 | L | El token de GitHub (`data/sync.json`) y las notas están en claro en disco | Documentar el modelo de amenaza y valorar el cifrado del token en reposo |

> [!tip] Contexto
> Los puntos 1 y 2 están **corregidos** (`server/cookieSecret.js`) y cerraban dos **falsas garantías** de seguridad: el resto de la superficie ya resistió la auditoría (path traversal, inyección de argumentos en git, XSS, CSRF, scrypt, permisos `0600`/`0700`).

---

## 2. Rendimiento y memoria

| # | Prio | Esf. | Hallazgo | Cómo aplicarla |
|:--:|:----:|:----:|----------|----------------|
| 10 | 🔴 | M | **El índice de búsqueda guarda `content` y `lower` de cada nota** (`searchIndex.js:24-33`): con los valores por defecto son hasta **~400 MB de RSS** | Guardar solo `lower` para buscar y releer del disco únicamente las notas con coincidencias (para el fragmento). Alternativa rápida: bajar `SEARCH_MAX_SCANNED_MB` de 200 a ~50 en `.env.example` |
| 11 | ✅ | S | `setTabDirty` crea un array nuevo de `tabs` en **cada pulsación** (`store.ts:324`, invocado en `Editor.tsx:277`), lo que re-renderiza `Tabs` tecla a tecla | **Corregido:** `setTabDirty` sale antes si `isDirty` no cambia y `commit` no llama si la pestaña ya está sucia. Medido con zustand 4.5.7: **200 → 1** re-render de `Tabs` al escribir 200 teclas |
| 12 | 🟠 | M | El editor re-parsea y recompone el frontmatter completo en cada tecla (`Editor.tsx:158`, `Editor.tsx:232`) | Memoizar por contenido y separar cuerpo y frontmatter en el estado |
| 13 | ✅ | M | En el explorador, `buildTree` y las expresiones regulares de carpetas ocultas se recalculan en **cada render** (`FileExplorer.tsx:373-377`), y `useIsMobile()` se instancia **por nodo** (`FileExplorer.tsx:80` → un `matchMedia` con su listener por cada fila) | **Corregido:** `useMemo` sobre `tree` + `hiddenFolders` (medido: ~3 ms por render con 3000 notas, 18 % de un frame). `useIsMobile` pasa a un store compartido con `useSyncExternalStore`: **un solo `matchMedia` y un solo listener** para toda la app en lugar de uno por fila. Nota: `React.memo` en `FileTreeNode` no se aplicó porque sus props (`drag`, `onContextMenu`, `onSelect`) son nuevos en cada render, así que no evitaría nada sin estabilizarlos antes |
| 14 | 🟠 | L | No hay virtualización del árbol: con miles de notas y carpetas expandidas se renderiza todo | Virtualizar la lista (ventana deslizante) o paginar por carpeta |
| 15 | 🟠 | M | El widget de tablas reescribe **toda** la tabla en cada `input` y añade una entrada de deshacer por tecla (`liveTables.ts:210`) | Debounce de 150-300 ms o reescribir solo la celda modificada |
| 16 | 🟠 | M | Al borrar una nota, `noteImageUsage` lanza O(imágenes × candidatas) peticiones **en serie** y bloquea el botón de confirmar (`attachments.ts:94-128`) | **Riesgo de borrado corregido** (el rendimiento queda pendiente). Antes, un fallo de `/api/search` (el servidor limita a `SEARCH_RATE_MAX`: 60/min por IP, que se agota con más de ~30 imágenes) o una nota candidata ilegible hacían que la imagen se clasificara como **exclusiva** y se ofreciera borrar aunque otra nota la usara. Ahora, ante cualquier incertidumbre, cuenta como compartida y no se ofrece borrar; el diálogo avisa con `delete.usageIncomplete`. Pendiente: endpoint en el servidor (elimina el 429 de raíz) y atajo con la carpeta de adjuntos |
| 17 | ✅ | M | El sondeo de cambios externos lee la nota **entera** cada 15 s (`MainLayout.tsx`) y el de sincronización consulta cada 30 s / 3 s (`syncNotify.ts:13-14`) | **Corregido (el sondeo de cambios):** `/api/files/read` acepta `?version=<hash>` y responde **304 sin cuerpo** si coincide, así que ya no se descarga la nota cada 15 s; lo que queda pendiente es solo revisar el intervalo del sondeo de sincronización |
| 18 | 🟡 | S | El menú de nota reordena la lista de carpetas en cada render y pide `syncApi.get()` cada vez que se abre | `useMemo` para la lista y cachear el estado de sincronización en el store |
| 19 | 🟡 | M | Chunks por encima de 500 kB: `MainLayout` 561 kB, mermaid 697 kB, cytoscape 444 kB, katex 261 kB | **Parcialmente corregido:** el `MainLayout` de 561 kB era sobre todo CodeMirror y `markdown-it`. Se separó `markdown-it` en su propio trozo con un `manualChunks` mínimo (`web/vite.config.ts`, 465 kB → 466 kB con 100 kB aparte) y la lista de lenguajes del editor pasó a `web/src/editorLanguages.ts`, que solo carga con el editor. Queda sin tocar cytoscape/katex (los carga mermaid dentro de su propia descarga) y los 674 kB de gramática Langium: el *chunk* sigue existiendo en `dist`, pero **ya no se descarga** al abrir un diagrama, porque `web/src/mermaidDiagrams.ts` registra solo los tipos habituales |
| 20 | ✅ | M | 21 familias de `@fontsource` entran en el build | **Corregido (carga bajo demanda):** `web/src/fonts.ts` ya no importa las 78 variantes en el arranque; cada familia se carga con un `import()` dinámico desde `loadBundledFont()` (al arrancar, al cambiar de fuente, y todas al abrir Ajustes para la vista previa). Resultado: el CSS principal pasa de 78 `@font-face` a **0** (56 kB → 44 kB) y las 78 variantes quedan en 78 trozos sueltos de 151 B cada uno. Las 21 familias siguen disponibles: no se quita funcionalidad. Nota: el woff2 no se reduce (1,8 MB), porque el navegador ya descargaba solo la fuente elegida; lo que se evita es declararlas todas de golpe |

> [!note] Por qué importa el punto 10
> Obsidita está pensada para VPS pequeños (`docs/es/OPTIMIZACION_RECURSOS_LIMITADOS.md` habla de 512 MB - 2 GB). Un índice que puede llegar a 400 MB contradice ese objetivo.

---

## 3. Experiencia de usuario

| # | Prio | Esf. | Hallazgo | Cómo aplicarla |
|:--:|:----:|:----:|----------|----------------|
| 21 | 🔴 | S | **En el diálogo de mover, pulsar Intro mueve el archivo al primer destino de la lista** (`FileDialogs.tsx:161`): con el filtro vacío, ese destino es la raíz del vault | Exigir selección explícita con flechas y resaltado, como hace el buscador rápido |
| 22 | 🔴 | M | **Al recibir un 429 la búsqueda vacía los resultados** (`SearchPanel.tsx:44-58`) y las etiquetas tapan el árbol ya cargado (`TagsPanel.tsx:177`). Con el límite de 60/min es fácil de provocar escribiendo seguido | Conservar los resultados anteriores ante error, respetar `Retry-After` con backoff y subir `SEARCH_RATE_MAX` |
| 23 | 🟠 | M | Al subir una imagen, la posición de inserción se captura **antes** del `await` y, al pegar, se borra la selección antes de saber si la subida funcionará (`imageUpload.ts:36`) | Mapear la posición con `ChangeDesc` o insertar contra la selección viva; borrar la selección solo tras el éxito |
| 24 | 🟠 | M | Cerrar una pestaña con cambios sin guardar no avisa (el autoguardado salta, pero se pierde el contexto y el historial) | Flush al cerrar la pestaña y confirmación si está sucia |
| 25 | 🟠 | S | El botón «+» de nueva pestaña no hace nada (`Tabs.tsx:44`) | Conectarlo al buscador rápido (requiere subir ese estado al store) o eliminarlo |
| 26 | 🟠 | S | Al hacer clic en un resultado de búsqueda no se salta a la línea, aunque el servidor la devuelve | Abrir la nota y desplazarse a `m.line` |
| 27 | 🟡 | S | Se mezclan `alert()`/`confirm()` nativos con el sistema de toasts (`templates.ts:124`, `Ribbon.tsx:17-47`, `FileExplorer.tsx`) | Unificar todo en los toasts |
| 28 | 🟡 | S | `Setup.onComplete` nunca se llama: `handleSetupComplete` es código muerto y el paso a la app depende de un `setTimeout(500)` + recarga | Emitir `onComplete` de verdad y eliminar el temporizador |
| 29 | 🟡 | M | Los archivos que no son `.md` (txt, json, canvas) ahora solo se pueden descargar | Añadir vista de solo lectura para texto plano, sin autoguardado |
| 30 | 🟡 | S | El ancho del input de etiquetas se calcula a mano con `size={draft.length}` (`Properties.tsx:158`) | Resolverlo con CSS |
| 31 | ✅ | M | No hay atajos para renombrar, mover o borrar, ni paleta de comandos | **Atajos añadidos** sobre el manejador de `MainLayout.tsx`: `F2` renombra, `Ctrl/Cmd+Shift+M` mueve y `Ctrl/Cmd+Shift+Backspace` borra la nota abierta (con los mismos diálogos que el menú; lista para `Ctrl+Shift+N`). La lógica de teclas y guardas está en `fileShortcuts.ts` (no dispara al escribir en un campo, ni en el editor para `F2`, ni con diálogos/menús abiertos) y las operaciones de archivo se comparten con el explorador en `fileActions.ts`/`filePaths.ts`. Documentados en Ajustes → Atajos. Pendiente: la paleta de comandos |

---

## 4. Accesibilidad

| # | Prio | Esf. | Hallazgo | Cómo aplicarla |
|:--:|:----:|:----:|----------|----------------|
| 32 | 🟠 | M | Los menús contextuales (explorador, cinta, pestañas) son `div` con `onClick`, sin `role`, `tabIndex` ni teclado (`FileExplorer.tsx:407-443`, `Tabs.tsx:24-42`) | `role="menu"`/`menuitem`, navegación con flechas, Escape y foco visible. Sin teclado, renombrar/mover/borrar son inalcanzables |
| 33 | 🟠 | M | Los diálogos no tienen `role="dialog"`, `aria-modal`, trampa de foco ni restauración del foco (`FileDialogs.tsx:29-38`) | Añadirlo: hoy el foco se escapa al fondo durante un diálogo modal |
| 34 | 🟠 | S | El desplegable de la barra de herramientas tiene `aria-expanded` pero le faltan `role="menu"`/`menuitem`, Escape y flechas (`EditorToolbar.tsx:227-283`) | Completar el patrón de menú |
| 35 | 🟡 | S | Los `<label>` de la pantalla de configuración no están asociados a sus campos (`Setup.tsx:81-141`) | Añadir `htmlFor`/`id`: hoy pulsar la etiqueta no enfoca el campo |
| 36 | 🟡 | S | El título en línea (`contentEditable`) y el `<textarea>` del modo crudo no tienen nombre accesible (`InlineTitle.tsx:59`) | `role` y `aria-label` |
| 37 | 🟡 | S | Los chevrons y las filas de resultados de búsqueda solo responden al clic (`SearchPanel.tsx:117-132`), igual que los chips de etiquetas (`Properties.tsx:127-132`) | Usar botones reales o `role="button"` con teclado |
| 38 | 🟡 | S | El separador de la barra lateral tiene `role="separator"` pero no es enfocable (`MainLayout.tsx:56-63`) | Añadir `tabIndex` y control con flechas |
| 39 | 🟡 | M | No hay auditoría automática de contraste ni de etiquetas | Integrar `axe-core` en CI (ver bloque 6) |

---

## 5. Calidad de código y arquitectura

| # | Prio | Esf. | Hallazgo | Cómo aplicarla |
|:--:|:----:|:----:|----------|----------------|
| 40 | 🔴 | M | `api.ts` repite **29 veces** el mismo `if (!res.ok) throw new Error((await res.json()).error)` y no expone el código HTTP | Helper `request<T>()` central y una clase `ApiError` con `status`, para poder reaccionar a 401/409/429 |
| 41 | 🔴 | M | Hay **dos** implementaciones del resolutor de wikilinks que deben coincidir: `web/src/wikilinks.ts:30-51` y `server/links.js:18-55` | Un único módulo compartido, o tests de paridad. Si divergen, renombrar un archivo corrompe enlaces |
| 42 | 🟠 | L | `store.ts` es monolítico: 457 líneas y ~45 campos que mezclan UI, preferencias y documentos | Dividir en slices (`ui`, `prefs`, `docs`) o en stores separados con persistencia común |
| 43 | 🟠 | S | `TreeItem` está definido dos veces (`store.ts:4` y `FileExplorer.tsx:12`), y `TrashItem`/`SearchResult` viven sueltos en `api.ts` | Fuente única en `web/src/types.ts` |
| 44 | 🟠 | M | Utilidades duplicadas (`fileName`, `parentFolder`, `isUnder`) y el bucle de borrado de imágenes copiado (`FileExplorer.tsx:250-260` y `NoteMenu.tsx:95-105`) | Extraer a `web/src/paths.ts` y a una función `deleteNoteWithImages` |
| 45 | 🟠 | M | No hay ESLint ni Prettier, y se cuelan `useEffect` sin array de dependencias (`NoteMenu.tsx:361`, `SearchBar`), refs en línea y `any` sueltos | `eslint` + `@typescript-eslint` + `react-hooks` + `prettier`, y corregir los avisos |
| 46 | 🟠 | S | Los 42 `console.*` son la única observabilidad, sin niveles ni contexto | Logger mínimo con niveles y `LOG_LEVEL`; en producción, solo `warn`/`error` |
| 47 | 🟡 | S | Código muerto: prop `depth` sin usar (`FileExplorer.tsx:69-78`), comentario huérfano (`livePreview.ts:373`), `Setup.onComplete`, `f.name \|\| pastedName(f)` (`imageUpload.ts:61`) | Eliminarlo |
| 48 | 🟡 | S | `noteVersions` no se poda: crece con cada ruta abierta y nunca se limpia al cerrar pestaña | Purgar en `removeTab` |
| 49 | 🟡 | S | `pendingInsert` es un singleton sin ruta objetivo: si cambias de pestaña entre la plantilla y el montaje, se inserta en la nota equivocada (`Editor.tsx:106-113`) | Guardar también la ruta y descartar si no coincide |
| 50 | 🟡 | S | `liveTables.ts:260` usa límites estrictos para decidir si muestra el Markdown: con el cursor justo al inicio de la tabla, oculta el texto | Usar límites inclusivos o un test de solape |
| 51 | 🟡 | M | `MainLayout` hace de orquestador, layout y lógica de guardado a la vez (384 líneas) | Extraer `useNoteLoader`, `useExternalCheck` y `useGlobalShortcuts` |

---

## 6. Pruebas, lint y CI

| # | Prio | Esf. | Hallazgo | Cómo aplicarla |
|:--:|:----:|:----:|----------|----------------|
| 52 | 🔴 | L | **Cero tests** en todo el proyecto | Empezar por lo puro y crítico: `frontmatter.ts` (ida y vuelta), `server/links.js` (reescritura al renombrar), `server/vault.js` (`guardPath`/`checkVaultPath`), `server/sessions.js` (limitador) y `templates.ts` (formatos de fecha). `vitest` sirve para los dos lados |
| 53 | 🔴 | S | No hay CI: los únicos scripts son `dev`, `build`, `start` y `postinstall` (`package.json:7-14`), sin `test` ni `typecheck` | Añadir `npm run typecheck` (`tsc --noEmit`), `npm run test` y `npm run lint`, más un workflow de GitHub Actions en cada push |
| 54 | 🟠 | M | No hay tests de integración de la API | `supertest` sobre `server/index.js` con un vault temporal: 401 sin sesión, path traversal, papelera, renombrado con reescritura de enlaces y límite de subida |
| 55 | 🟠 | S | No se comprueban dependencias ni formato | `npm audit` y `prettier --check` en CI |
| 56 | 🟠 | L | No hay tests de interfaz | `@testing-library/react` para los flujos con más riesgo: conflicto de nota, borrado con imágenes y configuración inicial |
| 57 | 🟡 | S | No se vigila el tamaño del bundle | `rollup-plugin-visualizer` con un presupuesto de tamaño en CI |

> [!warning] Lo más rentable de todo el documento
> Con **52** y **53** en marcha, el resto de mejoras deja de ser arriesgado: es lo que más barato protege lo que ya funciona.

---

## 7. Operación y documentación

| # | Prio | Esf. | Hallazgo | Cómo aplicarla |
|:--:|:----:|:----:|----------|----------------|
| 58 | 🔴 | S | **`README.md` está roto**: todas las secciones (Índice, Características, Instalación, Variables de entorno…) están vacías desde el commit `c7fc659`. El contenido real vive en `README.md_` y en `docs/` | Restaurar el contenido (o enlazar a `docs/`) y borrar `README.md_`, que es una copia de seguridad dentro de git |
| 59 | 🟠 | M | No hay `Dockerfile` ni `docker-compose` ni unidad systemd versionada (solo scripts sueltos en `docs/`) | Dockerfile multi-stage (build de Vite + runtime Node) y un `.service` de ejemplo |
| 60 | ✅ | S | No hay endpoint de salud ni métricas | **Corregido:** `GET /healthz` (`server/routes/health.js`), público y sin datos sensibles: devuelve `configured`, `vault` (existe y es legible/escribible, con límite de 3 s), `version` y `uptime`. `200` si va bien o aún falta el setup; `503` si el vault no es accesible. Documentado en `docs/*/API.md` |
| 61 | 🟠 | S | Si `MAX_NOTE_MB`/`MAX_UPLOAD_MB` superan `client_max_body_size` en nginx, aparecen 413 confusos | Advertir al arrancar si `MAX_*` pasa de un umbral y decirlo en el propio mensaje de error |
| 62 | 🟠 | M | `sessions.json` se reescribe entero en cada login o actividad, y no hay copia de seguridad | Escritura atómica (temporal + `rename`) y backup de `data/` antes de operaciones destructivas |
| 63 | 🟠 | S | No hay rotación de logs ni opción de escribir a fichero | Variable `LOG_FILE` o documentar `journalctl` con systemd |
| 64 | 🟡 | M | La API no está documentada | Un `docs/es/API.md` con la lista de endpoints, o generar OpenAPI |
| 65 | 🟡 | M | La documentación está duplicada en `docs/es` y `docs/en` (doble mantenimiento) | Elegir un idioma canónico y traducir solo lo esencial |
| 66 | 🟡 | S | Restos en el repositorio: `README.md_` versionado y el fichero `notas` suelto en la raíz | Limpiarlos |
| 67 | ✅ | S | No hay guía de contribución ni despliegue reproducible | **Corregido:** `CONTRIBUTING.md` en la raíz con cómo levantar (dev y producción en local), cómo comprobar un cambio mientras no haya tests (`tsc --noEmit`, `node --check`, build, `/healthz` y una lista de pruebas manuales), convenciones y despliegue paso a paso (versión fijada con `git checkout`, systemd, proxy, verificación con `/healthz`, actualización y vuelta atrás). Pendiente para que sea del todo reproducible: versionar `package-lock.json` (hoy está en `.gitignore`) y usar `npm ci` |

---

## 8. Por dónde empezar

Si solo se hace una cosa, que sea esta:

1. **Tests + CI (`#52`, `#53`).** Con `vitest`, `tsc --noEmit` y un workflow de GitHub Actions, el resto de cambios deja de dar miedo. Es lo que más protege por lo que cuesta.
2. **`COOKIE_SECRET` y la validación de `data/.secret` (`#1`, `#2`).** ✅ Ya corregido en `server/cookieSecret.js`.
3. **Rendimiento por pulsación (`#11`) y memoria del índice (`#10`).** Cambios pequeños, se notan a diario y son los que más acercan Obsidita al objetivo de VPS pequeño.
4. **Los dos P0 de uso diario (`#21`, `#22`).** Mover un archivo sin querer y quedarte sin resultados de búsqueda son las dos cosas que más molestan.
5. **El README (`#58`).** Es lo primero que ve cualquiera que llegue al repositorio.

Después, el orden natural es el bloque **6 → 5 → 2 → 1 → 3 → 4 → 7**: primero asegurar, luego ordenar, luego acelerar, luego endurecer y por último pulir.

---

## Lo que ya está corregido

Estas 16 correcciones ya están aplicadas en el código (se listan para no volver a proponerlas):

<details>
<summary><strong>Seguridad y pérdida de datos</strong></summary>

| Corrección | Detalle |
|------------|---------|
| Carrera al cargar una nota | Al cambiar de pestaña, la respuesta tardía de la nota anterior podía pisar la nueva y guardar el texto de A dentro de `B.md`. Ahora se cancela y se comprueba `activeTab`, con `key` por ruta |
| Corrupción de archivos no `.md` | Un PDF o un ZIP se leían en UTF-8 y el autoguardado los reescribía corrompidos (reproducido: 25 → 31 bytes). Ahora solo las notas son editables |
| `flushPendingSave` incompleto | Solo se esperaba al último guardado por ruta; uno rezagado podía resucitar un archivo renombrado o borrado |
| Autoguardado que revertía cambios | `saveNote` directo (casillas de tarea, «conservar lo mío») no cancelaba el guardado en cola |
| Frontmatter con claves reservadas | Una propiedad llamada `#tag` se guardaba como comentario y desaparecía; `-x` o `a: b` rompían el parseo. Ahora las claves inseguras se entrecomillan |
| `/api` devolvía HTML | Un endpoint desconocido caía en el fallback del SPA y respondía `index.html` con 200, rompiendo el manejo de errores del cliente |
| Subida con `Content-Type: application/json` | El parser JSON consumía el cuerpo antes que la ruta de subida |

</details>

<details>
<summary><strong>Robustez y rendimiento</strong></summary>

| Corrección | Detalle |
|------------|---------|
| Sin volcado al cerrar u ocultar la pestaña | Hasta 2 s de escritura se perdían: ahora se vuelca en `pagehide` y `visibilitychange` |
| Borrar una carpeta descartaba autoguardados | Se cancelaban en vez de escribirse antes de mover a la papelera |
| Drop externo sin `catch` | Provocaba un rechazo no gestionado y un aviso de «subiendo» permanente |
| `RangeError` al resaltar la búsqueda | `new Highlight(...ranges)` desbordaba la pila en notas grandes; ahora se añaden una a una |
| Setup con falso éxito | `result.success \|\| result.error === undefined` y la falta de comprobación de `res.ok` hacían recargar la página ante un fallo |
| Errores de arranque invisibles | Se guardaban en un estado que solo se pintaba durante la carga |
| `StatusBar` en cada pulsación | Partía en palabras la nota entera tecla a tecla |
| `Accept-Encoding: q=0` | Se enviaba brotli a quien lo rechazaba explícitamente |
| `chmod` de `data/` | Quitaba el bit de directorio a cualquier subcarpeta; un secreto de cookies vacío habría sido aceptado |

</details>

---

<div align="center">

<sub>Auditoría realizada sobre <strong>Obsidita 0.9.11</strong> · 20 archivos modificados · <code>tsc --noEmit</code> limpio y build de producción verificado</sub>

</div>
