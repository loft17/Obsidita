# 📝 Guía de uso

Todo lo que puedes hacer en Obsidita una vez instalada. Para instalarla y configurarla, consulta el [README principal](../README.md).

## 📑 Índice

- [🧭 La interfaz](#-la-interfaz)
- [📱 En el móvil](#-en-el-móvil)
- [🔤 Fuentes](#-fuentes)
- [📂 Explorador y pestañas](#-explorador-y-pestañas)
- [✍️ Editar notas](#️-editar-notas)
- [👁️ Modo lectura](#️-modo-lectura)
- [🔗 Wikilinks e incrustaciones](#-wikilinks-e-incrustaciones)
- [🏷️ Propiedades](#️-propiedades)
- [🔍 Búsqueda y etiquetas](#-búsqueda-y-etiquetas)
- [🖼️ Adjuntos e imágenes](#️-adjuntos-e-imágenes)
- [📅 Notas diarias y plantillas](#-notas-diarias-y-plantillas)
- [🗑️ Papelera](#️-papelera)
- [⋯ Menú de la nota](#-menú-de-la-nota)
- [🔀 Cambios desde otro dispositivo](#-cambios-desde-otro-dispositivo)
- [💾 Descargar el vault](#-descargar-el-vault)

---

## 🧭 La interfaz

| Zona | Qué contiene |
| :--- | :--- |
| **Cinta** (barra vertical izquierda) | Archivos, búsqueda, etiquetas, papelera, nota diaria, insertar plantilla y ⚙️ Preferencias. Si la ocultas en *Preferencias → Apariencia*, sus botones pasan al pie de la barra lateral. |
| **Barra lateral** | El panel elegido en la cinta. Se muestra u oculta con <kbd>Ctrl</kbd>+<kbd>B</kbd>. Arrastra su borde derecho para cambiar el ancho (doble clic en el borde para volver al ancho por defecto). |
| **Pestañas** | Una por nota abierta. |
| **Nota** | Título en línea, propiedades, barra de formato y contenido. |
| **Barra de estado** | Recuento de palabras y caracteres de la nota abierta. |

Los avisos (guardado, errores, sincronización, versión nueva disponible) aparecen como notificaciones breves en una esquina.

---

## 📱 En el móvil

En pantallas de 768 px de ancho o menos (móviles y tablets en vertical) la interfaz cambia sola:

- **Cabecera**: ☰ abre la barra lateral; 🔍 abre el buscador rápido de notas; luego el botón de lectura/edición y el menú ⋯ de la nota.
- **Barra lateral**: se despliega sobre la nota y se cierra al abrir una nota o al tocar fuera. Los botones de la cinta están en su pie.
- **Menú contextual** de archivos y carpetas: mantén pulsado el elemento.
- **Pestañas**: solo aparecen si hay más de una abierta (con *Abrir en nueva pestaña*).
- **Barra de formato**: en una sola fila que se desliza en horizontal. El botón 🖼️ sube imágenes de la galería o de la cámara.
- **Preferencias**: a pantalla completa; primero la lista de secciones y luego la elegida.

Se puede instalar como app con *Añadir a pantalla de inicio* (Safari en iOS, Chrome en Android): se abre a pantalla completa, sin la barra del navegador.

No están en el móvil: arrastrar y soltar archivos en el explorador (usa *Mover a…* en el menú), los atajos de teclado salvo con teclado físico, la barra de estado, la cinta (la opción *Mostrar menú de cinta* no se aplica) y el ajuste de fuente con <kbd>Ctrl</kbd>+rueda (usa *Preferencias → Apariencia*).

---

## 🏷️ Título de la web

En *Preferencias → Apariencia → Web* puedes cambiar el **título de la web**, el nombre que aparece en la pestaña del navegador y en la pantalla de inicio de sesión. Se guarda en el servidor, así que se ve igual en todos los dispositivos. Si lo dejas vacío (o pulsas el botón de restablecer) se usa **Obsidita**.

---

## 🔤 Fuentes

En *Preferencias → Apariencia → Fuente* eliges tres fuentes por separado:

| Ajuste | Dónde se usa |
| :--- | :--- |
| **Fuente de la interfaz** | Toda la aplicación: menús, explorador, pestañas, preferencias. |
| **Fuente del texto** | El editor, el modo lectura y el título de la nota. Si no eliges ninguna, usa la de la interfaz. |
| **Fuente monoespaciada** | Código en línea, bloques de código y edición como texto plano. |

Cada desplegable ofrece cuatro tipos de fuente:

- **Carpeta fonts del servidor**: las que hayas añadido tú (ver abajo).
- **Incluidas en Obsidita**: una selección de fuentes libres de Google Fonts (Inter, Lora, Merriweather, Literata, JetBrains Mono, Fira Code…). Se sirven desde tu servidor: no se pide nada a Google y funcionan sin internet.
- **Otra fuente instalada…**: escribe el nombre de una fuente instalada **en el dispositivo desde el que abres la web**.
- **Predeterminada**: la de siempre. El botón ↺ también vuelve a ella.

La elección se guarda en el navegador, así que cada dispositivo puede tener la suya.

### Añadir tus propias fuentes

1. Descarga la fuente, por ejemplo de [Google Fonts](https://fonts.google.com) (botón *Get font → Download*) o de cualquier otra web de fuentes libres, y descomprime el ZIP.
2. Copia los archivos **`.woff2`, `.woff`, `.ttf` u `.otf`** en la carpeta **`web/src/fonts/`** de la app (se crea al arrancar el servidor):

   ```bash
   cp ~/Descargas/Lora/static/*.ttf /ruta/a/Obsidita/web/src/fonts/
   ```

3. Abre *Preferencias → Apariencia*: la fuente aparece en el grupo **Carpeta fonts del servidor**. No hace falta reiniciar ni recompilar; la carpeta se relee cada vez que abres las preferencias.

El nombre de la fuente sale del nombre del archivo, con la convención de Google Fonts: todos estos archivos forman **una sola fuente "Lora"** con su negrita y su cursiva:

```text
Lora-Regular.ttf        Lora-Italic.ttf
Lora-Bold.ttf           Lora-BoldItalic.ttf
Lora-VariableFont_wght.ttf          (fuente variable: todos los pesos en un archivo)
Lora-Italic-VariableFont_wght.ttf
```

Se reconocen los sufijos `Thin`, `ExtraLight`, `Light`, `Regular`, `Medium`, `SemiBold`, `Bold`, `ExtraBold` y `Black`, solos o seguidos de `Italic`. Un archivo sin sufijo (`MiFuente.otf`) aparece con su nombre tal cual; los `_` se muestran como espacios.

> [!NOTE]
> - Para usar **otra carpeta**, defínela con [`FONTS_DIR`](../README.md#-variables-de-entorno) en el `.env` (ruta absoluta) y reinicia el servidor. Puede estar, por ejemplo, dentro del vault para que se sincronice con tus notas.
> - El usuario que ejecuta Obsidita debe poder **leer** la carpeta.
> - Una fuente instalada en el **sistema** del servidor (`/usr/share/fonts`…) no sirve: el navegador solo ve las fuentes de su propio equipo o las que le envía la web.
> - `web/src/fonts/` está en `.gitignore`: tus fuentes no se suben al repositorio (revisa su licencia antes de redistribuirlas).

---

## 📂 Explorador y pestañas

| Acción | Resultado |
| :--- | :--- |
| **Clic** en una nota | La abre en la pestaña activa. |
| **`Ctrl`/`Cmd` + clic**, **botón central** o **clic derecho → Abrir en pestaña nueva** | La abre en otra pestaña. |
| **Clic derecho** sobre archivos o carpetas | Nueva nota, nueva carpeta, hacer una copia, mover a…, renombrar, borrar. |
| Botones de la cabecera del explorador | Crear nota, crear carpeta, contraer todo. |
| **Arrastrar** archivos o carpetas **desde tu ordenador** al explorador | Los sube a la carpeta donde los sueltas (sobre una nota: a su carpeta; en el hueco libre: a la raíz). |

- **Mover a…** abre un buscador de carpetas: escribe parte del nombre y elige el destino (o `/` para la raíz).
- **Renombrar o mover** una nota **actualiza los enlaces** que apuntan a ella en el resto del vault.
- Los nombres no pueden contener `\ / : * ? " < > |`.
- **Subir desde el ordenador**: solo se suben las notas (`.md`) y las imágenes; el resto de archivos y los ocultos (`.git`, `.DS_Store`…) se ignoran. Una carpeta soltada se recrea con sus subcarpetas: si sueltas `_recursos` sobre `Notas`, sus imágenes quedan en `Notas/_recursos/`. Las carpetas sin notas ni imágenes no se crean. Si ya existe un archivo con el mismo nombre no se sobrescribe: se guarda como `foto 1.png`. Cada archivo puede ocupar como máximo `MAX_UPLOAD_MB` (50 MB por defecto).
- **Ocultar carpetas**: en *Preferencias → Archivos → Explorador de archivos* escribe un patrón por línea (`*` como comodín, por ejemplo `_recursos` o `Archivo*`). Esas carpetas y su contenido desaparecen del árbol, de la búsqueda y del panel de etiquetas. Se guarda en el navegador, así que es por dispositivo.
- Las imágenes del vault se abren en un **visor**: ajustadas a la ventana; clic para verlas a tamaño real.

---

## ✍️ Editar notas

Las notas se abren en **modo visor** o **modo edición** según *Preferencias → Editor → Modo por defecto*. Cambia entre ambos con el botón de la cabecera o <kbd>Ctrl</kbd>+<kbd>E</kbd>.

### Modos del editor

| Modo | Cómo se ve |
| :--- | :--- |
| **Vista previa en vivo** | El Markdown se ve con formato y los marcadores (`#`, `**`, `>`, `[](url)`…) solo aparecen en la línea donde está el cursor. |
| **Texto sin formato** | El archivo completo como en un bloc de notas, frontmatter incluido (ver [Menú de la nota](#-menú-de-la-nota)). |

Al editar siempre se usa la vista previa en vivo; el Markdown tal cual solo se ve en *Texto sin formato*.

### En la vista previa en vivo

- **Tareas**: `- [ ]` se muestra como casilla; haz clic para marcarla o desmarcarla.
- **Tablas**: se editan como una tabla, celda a celda. Botones para **añadir una fila** debajo o **añadir una columna**; el Markdown se reescribe alineado.
- **Imágenes** incrustadas se muestran en su sitio.
- `==resaltado==`, bloques de código con colores y guías de sangría como en Obsidian.

### Barra de formato

Encima del editor: deshacer / rehacer, limpiar formato, encabezados (H1–H6), negrita, cursiva, tachado, resaltado, código, bloque de código, cita, listas (viñetas, numerada, de tareas), enlace, enlace interno `[[ ]]` e insertar tabla. Si no hay nada seleccionado, inserta un texto de ejemplo listo para sustituir.

### Título en línea

El nombre del archivo aparece como título encima de la nota. **Edítalo para renombrar la nota** (los enlaces se actualizan) y pulsa <kbd>Enter</kbd> para saltar al contenido. Se activa o desactiva en *Preferencias → Editor*.

### Guardado

Los cambios se **guardan solos** mientras escribes. <kbd>Ctrl</kbd>+<kbd>S</kbd> fuerza el guardado inmediato.

### Buscar en la nota

<kbd>Ctrl</kbd>+<kbd>F</kbd> abre la búsqueda dentro de la nota: <kbd>Enter</kbd> o <kbd>F3</kbd> para el siguiente resultado, con <kbd>Shift</kbd> para el anterior, <kbd>Esc</kbd> para cerrar.

---

## 👁️ Modo lectura

Muestra la nota renderizada, como en Obsidian:

- **Wikilinks**, **etiquetas** `#etiqueta` (también anidadas, `#proyecto/web`) y `==resaltado==`.
- **Callouts**: `> [!tipo] Título`. Tipos: `note`, `abstract`, `info`, `todo`, `tip`, `success`, `question`, `warning`, `failure`, `danger`, `bug`, `example`, `quote`, y sus alias habituales (`tldr`, `hint`, `important`, `check`, `done`, `faq`, `caution`, `error`, `cite`…).

  ```markdown
  > [!tip] Un consejo
  > El contenido del callout.
  ```

- **Bloques de código** con resaltado de sintaxis, etiqueta del lenguaje y botón **Copiar**.
- **Diagramas Mermaid** en bloques ` ```mermaid `, con los colores del tema.
- **Notas e imágenes incrustadas** (ver abajo).

---

## 🔗 Wikilinks e incrustaciones

| Sintaxis | Resultado |
| :--- | :--- |
| `[[Nota]]` | Enlace a `Nota.md`. |
| `[[Nota\|Texto]]` | Enlace con texto alternativo. |
| `[[Nota#Encabezado]]` | Enlace a una sección. |
| `[[#Encabezado]]` | Enlace a una sección de la propia nota. |
| `![[Nota]]` | Incrusta el contenido de otra nota (en su propio párrafo). |
| `![[Nota#Encabezado]]` | Incrusta solo esa sección. |
| `![[imagen.png]]` | Incrusta una imagen. |
| `![[imagen.png\|300]]` | Imagen con 300 px de ancho. |

- **Autocompletado**: al escribir `[[` (o `![[`) se sugieren las notas del vault, con su carpeta. Como en Obsidian, se inserta solo el nombre si es único, o la ruta completa si hay varias notas con el mismo nombre. Con `![[` también se sugieren adjuntos.
- Un enlace a una nota que **no existe** se ve atenuado y, al pulsarlo, **crea la nota**.
- En el editor, `Ctrl`/`Cmd` + clic o el botón central abren el enlace en otra pestaña.
- Las incrustaciones de otros archivos (PDF, audio…) se muestran como enlace.

---

## 🏷️ Propiedades

El bloque de **Propiedades** edita el frontmatter YAML de la nota sin tocar el texto:

- **Añadir propiedad**: se sugieren `tags`, `aliases` y `cssclasses`. Variantes habituales como `tag`, `etiquetas` o `alias` se guardan con el nombre que reconoce Obsidian.
- Cada propiedad tiene un tipo según su valor: **texto**, **lista**, **número**, **casilla**, **fecha** o **etiquetas**.
- Puedes **reordenarlas** (subir / bajar) y **eliminarlas**.
- En listas y etiquetas: <kbd>Enter</kbd> o <kbd>,</kbd> añaden un valor; <kbd>Retroceso</kbd> con el campo vacío borra el último; <kbd>Esc</kbd> cancela una propiedad nueva.
- Pulsar una etiqueta busca las notas que la tienen.

---

## 🔍 Búsqueda y etiquetas

### Buscador rápido

<kbd>Ctrl</kbd>+<kbd>P</kbd> abre un buscador de notas por nombre. Muévete con <kbd>↑</kbd> <kbd>↓</kbd> y abre con <kbd>Enter</kbd>.

### Búsqueda global

<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> o el icono de lupa:

- **Texto libre**: busca, sin distinguir mayúsculas, en nombres de archivo y en el contenido. Primero salen las coincidencias por nombre y después las notas con más apariciones, con la línea y su contexto.
- **`tag:proyecto`** o **`tag:#proyecto`**: notas con esa etiqueta, en el frontmatter (`tags:`) o en el texto (`#proyecto`).

### Panel de etiquetas

Lista todas las etiquetas del vault con el número de notas de cada una:

- Las **etiquetas anidadas** (`proyecto/web/front`) se muestran como árbol plegable.
- **Ordena** por nombre o por número de notas, y **filtra** escribiendo parte del nombre.
- Haz clic en una etiqueta para buscar sus notas.

---

## 🖼️ Adjuntos e imágenes

Arrastra o pega una imagen en el editor, o usa el botón 🖼️ de la barra de formato: se sube y se inserta el enlace en la nota.

La ubicación se elige en *Preferencias → Archivos → Archivos adjuntos*, con las mismas opciones que Obsidian de escritorio:

| Opción | Dónde se guarda |
| :--- | :--- |
| Carpeta de la bóveda | En la raíz del vault. |
| Misma carpeta donde está el archivo | Junto a la nota. |
| En la subcarpeta de la carpeta actual | En una subcarpeta (por ejemplo `adjuntos/`) junto a la nota. |
| En la carpeta especificada | En una carpeta fija del vault. |

Se guarda en `.obsidian/app.json` como `attachmentFolderPath`, así que Obsidian de escritorio usa la misma configuración.

> [!NOTE]
> Por seguridad, las imágenes de otras webs (`https://…`) no se cargan salvo que el servidor tenga `REMOTE_IMAGES=1`. Ver [Seguridad](../README.md#-seguridad).

---

## 📅 Notas diarias y plantillas

Funcionan como los plugins del mismo nombre de Obsidian de escritorio y comparten su configuración, que se cambia en *Preferencias → Archivos* y se guarda en `.obsidian/daily-notes.json` y `.obsidian/templates.json`.

- **Nota diaria** (icono de calendario en la cinta): abre la nota de hoy y, si no existe, la crea en la carpeta configurada con la plantilla elegida. El nombre sale del formato de fecha (sintaxis de moment.js, por defecto `YYYY-MM-DD`); una `/` en el formato crea subcarpetas, por ejemplo `YYYY/MM/YYYY-MM-DD`. Si la plantilla no existe, la nota se crea vacía y se avisa.
- **Insertar plantilla** (icono de documentos): elige una nota de la carpeta de plantillas y se inserta en el cursor de la nota abierta. Si la plantilla tiene propiedades, se añaden a las de la nota sin cambiar las que ya tenía.

### Variables

| Variable | Se sustituye por |
| :--- | :--- |
| `{{title}}` | Nombre de la nota. |
| `{{date}}` | Fecha con el formato configurado. |
| `{{time}}` | Hora con el formato configurado. |
| `{{date:FORMATO}}` | Fecha con un formato propio, p. ej. `{{date:dddd, D [de] MMMM}}`. |
| `{{time:FORMATO}}` | Hora con un formato propio, p. ej. `{{time:HH:mm}}`. |

La lista también está en *Preferencias → Variables*.

---

## 🗑️ Papelera

Borrar una nota o carpeta la **mueve a la papelera** (`.trash/` dentro del vault), igual que Obsidian de escritorio.

- Al borrar una nota, se ofrece **borrar también sus imágenes**. Las que usan otras notas se conservan siempre.
- En el panel **Papelera** de la cinta puedes **filtrar**, ver la fecha de borrado, **restaurar** un elemento a su ruta original, **borrarlo definitivamente** o **vaciar la papelera**.
- La papelera no se sube a GitHub al sincronizar.

---

## ⋯ Menú de la nota

El botón ⋯ de la cabecera de la nota ofrece:

| Opción | Qué hace |
| :--- | :--- |
| **Buscar** | Búsqueda dentro de la nota (<kbd>Ctrl</kbd>+<kbd>F</kbd>). |
| **Ver texto sin formato** | Muestra el `.md` como texto plano, frontmatter `---` incluido. Puedes escribir, copiar y pegar; se guarda con el autoguardado. Para salir, *Volver al editor* o pasa a modo lectura. |
| **Historial de versiones** | Con la [sincronización con GitHub](../README.md#-sincronización-con-github) activa: cada versión guardada en git, sus cambios y su contenido, con la opción de **restaurarla**. Solo incluye lo ya sincronizado. |
| **Descargar .md** | Descarga el archivo de la nota. |
| **Exportar a PDF** | Abre una versión limpia de la nota (sin frontmatter) y el diálogo de impresión del navegador → *Guardar como PDF*. Si no se abre, permite las ventanas emergentes para la web. |

---

## 🔀 Cambios desde otro dispositivo

La web comprueba cada poco si la nota abierta ha cambiado en el servidor (otro dispositivo, otra pestaña, la sincronización…):

- Si **no tenías cambios sin guardar**, la nota se recarga sola.
- Si **sí los tenías**, aparece un diálogo con las dos versiones: **conserva la tuya** o **usa la del servidor**. La otra se descarta.

---

## 💾 Descargar el vault

En *Preferencias → Archivos → Bóveda → Descargar copia* obtienes el vault completo en un **ZIP**: notas, adjuntos y la carpeta `.obsidian`. Opcionalmente puedes incluir:

- La carpeta **`.git`** (historial de la sincronización; puede ocupar mucho).
- La **papelera** `.trash`.

Es una forma rápida de hacer una copia de seguridad. Para copias automáticas en el servidor, consulta [MANTENIMIENTO.md](MANTENIMIENTO.md).

---

Ver también: [⚡ Atajos de teclado](../README.md#-atajos-de-teclado) · [🎨 Preferencias](../README.md#-preferencias) · [🩺 Solución de problemas](TROUBLESHOOTING.md)
