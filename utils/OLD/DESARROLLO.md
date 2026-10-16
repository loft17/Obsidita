# 💻 Guía de desarrollo

Todo lo necesario para trabajar en el código de Obsidita. Para entender cómo encaja cada pieza, consulta también [ARQUITECTURA.md](ARQUITECTURA.md).

## Índice

- [Requisitos](#requisitos)
- [Puesta en marcha](#puesta-en-marcha)
- [Scripts](#scripts)
- [Cómo se compila y se sirve](#cómo-se-compila-y-se-sirve)
- [Convenciones](#convenciones)
- [Recetas para cambios habituales](#recetas-para-cambios-habituales)
- [Antes de publicar un cambio](#antes-de-publicar-un-cambio)
- [Versiones y publicación](#versiones-y-publicación)
- [Actualizar dependencias](#actualizar-dependencias)
- [Hoja de ruta](#hoja-de-ruta)

---

## Requisitos

- **Node.js 20 o superior** (20.12+ para que se cargue el `.env`).
- **git 2.31 o superior**, solo si vas a probar la sincronización con GitHub.
- Una carpeta de pruebas que haga de vault, por ejemplo `/tmp/vault-pruebas` o una copia de un vault real. **No uses tu vault de verdad mientras desarrollas.**

---

## Puesta en marcha

```bash
git clone https://github.com/loft17/Obsidian-Web.git
cd Obsidian-Web
npm install        # instala todo y compila el frontend (postinstall)
npm run dev
```

`npm run dev` levanta a la vez:

- **Vite** en `http://localhost:5173`: el frontend, con *hot reload*.
- **Express** en `http://localhost:3000`: la API, con `node --watch` (se reinicia al cambiar `server/`).

> [!IMPORTANT]
> **En desarrollo abre siempre `http://localhost:5173`**, no el 3000. Vite redirige `/api` al backend (`web/vite.config.ts`) y así no hay problemas de CORS ni de cookies. El 3000 sirve el `web/dist` compilado, que no se actualiza hasta que vuelves a compilar.

La primera vez, el token de configuración inicial aparece en la consola de `npm run dev`. Para volver a empezar de cero, borra `data/` y reinicia.

---

## Scripts

Todos se ejecutan desde la raíz del proyecto.

| Script | Qué hace |
| :--- | :--- |
| `npm start` | Arranca el servidor (API y `web/dist`). Es lo que se usa en producción. |
| `npm run dev` | Frontend (Vite) + backend con recarga. |
| `npm run web:build` | Compila el frontend en `web/dist`. Se ejecuta solo con `npm install` (`postinstall`). |
| `npm run web:dev` | Solo el frontend. |
| `npm run server:dev` | Solo la API, con recarga automática. |

---

## Cómo se compila y se sirve

- **Un solo `package.json`**: el de la raíz contiene las dependencias del servidor y del frontend. `web/package.json` es un resto antiguo; no lo uses para instalar nada.
- **El servidor no se compila**: es JavaScript ESM que Node ejecuta tal cual.
- **El frontend se compila con Vite** en el `postinstall`. Por eso las dependencias de desarrollo (Vite, TypeScript…) hacen falta también en producción, y **no se debe instalar con `--omit=dev`**.
- **Vite no comprueba los tipos**: compila aunque haya errores de TypeScript. Compruébalos aparte (ver [Antes de publicar un cambio](#antes-de-publicar-un-cambio)).
- **Los hashes CSP de los `<script>` en línea de `index.html` se calculan al arrancar** el servidor a partir de `web/dist/index.html` (`server/security.js`). Si cambias ese script y recompilas, reinicia el servidor o el navegador lo bloqueará.
- **La versión que se ve en *Preferencias → Acerca de*** sale de `version` del `package.json` de la raíz (`__APP_VERSION__` en `vite.config.ts`).

---

## Convenciones

- **Idioma**: comentarios, mensajes de consola y errores del servidor, en **español**.
- **Textos de la interfaz**: nunca escritos directamente en los componentes; van en los diccionarios de `web/src/i18n/` (ver receta abajo).
- **Estilo**: imita el del código que rodea al cambio (nombres, densidad de comentarios, estructura). No hay linter ni formateador configurado.
- **Servidor en ESM**: `import`/`export`, sin TypeScript ni paso de compilación.
- **Rutas de archivos**: toda ruta que llegue del cliente pasa por `guardPath()` de `server/vault.js`. En `routes/files.js` usa `withVault`.
- **Errores al cliente**: con `publicError()` de `server/security.js`. Nunca devuelvas `err.message` sin filtrar: puede contener rutas del servidor.
- **Límites**: cualquier límite nuevo va en `server/limits.js` (ver receta abajo).
- **Wikilinks duplicados**: la resolución de enlaces existe en `web/src/wikilinks.ts` (cliente) y `server/links.js` (servidor) y deben comportarse igual. Si cambias una, cambia la otra.
- **Sin dependencias innecesarias**: la app presume de ligera. Antes de añadir una librería, comprueba si se puede hacer con lo que ya hay; si es pesada y solo se usa a veces, cárgala con `import()` dinámico, como `web/src/codeHighlight.ts` hace con highlight.js.
- **`.obsidian/` y `.git/` del vault**: no se leen ni escriben desde la web, salvo las claves concretas que ya gestiona `vault.js`. No abras esa puerta: es una vía para ejecutar código en el ordenador del usuario o en el servidor.

---

## Recetas para cambios habituales

### Añadir una ruta a la API

1. Añádela al router que corresponda en `server/routes/` (o crea uno y móntalo en `server/index.js`, después del middleware de sesión si debe exigir login).
2. Valida el cuerpo: tipos, longitudes y rutas (`guardPath`).
3. Responde los errores con `publicError()`.
4. Añade la función en `web/src/api.ts`.
5. Documéntala en la tabla [API de ARQUITECTURA.md](ARQUITECTURA.md#api).

> [!NOTE]
> Las peticiones que no son `GET` pasan la protección CSRF (`csrfGuard`), que exige el mismo origen. `api.ts` ya hace las peticiones de forma compatible; si pruebas con `curl`, no envíes una cabecera `Origin` distinta.

### Añadir un límite configurable

1. Defínelo en `server/limits.js` con `num()` o `int()` y un valor por defecto.
2. Úsalo donde toque.
3. Exponlo en `GET /api/settings/limits` (`routes/settings.js`) para que aparezca en *Preferencias → Variables*.
4. Añádelo, comentado, a `.env.example`.
5. Documéntalo en la tabla de [límites de MANTENIMIENTO.md](MANTENIMIENTO.md#límites).

### Añadir o cambiar un texto de la interfaz

1. Añade la clave en `web/src/i18n/es.ts` (la referencia) y en todos los demás idiomas (`en.ts`...). Si falta en alguno, `tsc` da error.
2. En un componente: `const t = useT();` y `t('clave')`. Fuera de React (alertas, widgets del editor): `import { t } from '../i18n'`.
3. Variables con `{nombre}`: `t('search.line', { n: 3 })`. Si la variable es un elemento (`<code>`, `<strong>`), usa `<Trans k="clave" values={{ nombre: <code>…</code> }} />`.
4. Fechas: pasa `getLang()` a `toLocaleString`.

### Añadir un idioma

Copia `web/src/i18n/en.ts` a `xx.ts`, tradúcelo y regístralo en `MESSAGES`, `LANGUAGES` y el tipo `Lang` de `web/src/i18n/index.tsx`. Aparecerá en *Preferencias → Apariencia → Idioma* y en la pantalla de configuración inicial.

### Añadir una preferencia

- **Si es de interfaz** (por navegador): añádela al store en `web/src/store.ts`, que la guarda en `localStorage`, y a la sección que corresponda de `SettingsModal.tsx`.
- **Si es del servidor**: guárdala en `data/` o, si Obsidian de escritorio la comparte, en la clave correspondiente de `.obsidian/` a través de `vault.js`. Añade la ruta en `routes/settings.js` y documenta el archivo en [ARQUITECTURA.md](ARQUITECTURA.md#archivos-de-datos).
- Actualiza la tabla de *Preferencias* del [README](../README.md#-preferencias).

### Añadir sintaxis al modo lectura

Las reglas propias de `markdown-it` están en `web/src/components/ReadingView.tsx`. Mantén `html: false`: el HTML de las notas no se interpreta, y es lo que impide que una nota ejecute scripts. Si la sintaxis también debe verse en el editor, añade la decoración en `web/src/livePreview.ts`.

### Añadir un atajo de teclado

Los globales están en `MainLayout.tsx`. Añádelo también a la lista de la sección *Atajos* de `SettingsModal.tsx` y a la tabla de [atajos del README](../README.md#-atajos-de-teclado).

### Tocar estilos

Todo está en `web/src/styles/obsidian.css`, con variables CSS para los temas claro y oscuro. Usa las variables existentes en lugar de colores fijos para que el cambio funcione en ambos temas.

---

## Antes de publicar un cambio

No hay tests automáticos, así que la comprobación es manual:

```bash
npx tsc --noEmit -p web     # tipos del frontend (Vite no los comprueba)
npm run web:build           # que el frontend compila
npm start                   # que el servidor arranca sin errores
```

Y prueba en el navegador, sobre un vault de pruebas, lo que hayas tocado y lo que lo rodea:

- [ ] Crear, editar, renombrar (los enlaces se actualizan), mover, borrar y restaurar desde la papelera.
- [ ] Autoguardado y `Ctrl+S`; el diálogo de conflicto editando la misma nota en dos pestañas.
- [ ] Modo lectura y vista previa en vivo, en tema claro y oscuro.
- [ ] Búsqueda de texto y `tag:`.
- [ ] Sin errores en la consola del navegador (incluidos los de CSP) ni en la del servidor.
- [ ] Si cambias algo de seguridad, revisa la tabla de [Seguridad en el código](ARQUITECTURA.md#seguridad-en-el-código).
- [ ] Si cambias algo que ve el usuario, actualiza el [README](../README.md); si cambias algo interno, la doc de esta carpeta.

---

## Versiones y publicación

1. Sube `version` en el `package.json` de la raíz ([SemVer](https://semver.org/lang/es/): parche para arreglos, menor para funciones nuevas).
2. Haz commit y publica en `main`.
3. Quien tenga la app instalada actualiza siguiendo [MANTENIMIENTO.md → Actualizar](MANTENIMIENTO.md#actualizar).

Si un cambio obliga a hacer algo al actualizar (una variable de entorno nueva, un cambio en la configuración de nginx…), indícalo claramente en el mensaje del commit o de la versión.

---

## Actualizar dependencias

```bash
npm outdated                  # qué hay nuevo
npm update                    # dentro de los rangos de package.json
npm install paquete@latest    # para saltar de versión mayor, una a una
```

`package-lock.json` está en `.gitignore`, así que cada instalación resuelve las versiones dentro de los rangos de `package.json`. Tras actualizar, haz todas las comprobaciones de [Antes de publicar un cambio](#antes-de-publicar-un-cambio). Con saltos de versión mayor (React, Vite, Express, CodeMirror) lee antes sus notas de migración. Revisa también los avisos de seguridad con `npm audit`.

---

## Hoja de ruta

Ideas pendientes, por si quieres contribuir:

- **Fórmulas LaTeX** en el modo lectura. Ahora mismo no se renderizan. Si se añaden, conviene cargarlas con `import()` dinámico como `codeHighlight.ts` o `mermaidDiagrams.ts`.
- **Diagramas Mermaid en la vista previa en vivo** y en la exportación a PDF: ahora solo se dibujan en el modo lectura.
- **Rendimiento con vaults muy grandes**: el explorador pinta todo el árbol. La búsqueda ya usa un índice en memoria, pero sigue recorriendo el árbol (`stat` de cada archivo) en cada consulta; vigilar la carpeta con `fs.watch` evitaría ese recorrido.
- **Traducir los errores del servidor**: la interfaz está en español e inglés (`web/src/i18n/`), pero los errores que devuelve el backend ("Contraseña incorrecta", "Ya existe un archivo con ese nombre"...) y los mensajes de estado de la sincronización siguen saliendo siempre en español. La idea es que el servidor devuelva un código (`{ error, code: 'WRONG_PASSWORD', params }`) y el cliente lo traduzca con sus diccionarios, dejando `error` en español como respaldo.
- **Tests automáticos**, al menos para `guardPath()`, la resolución de wikilinks y la reescritura de enlaces al renombrar.
