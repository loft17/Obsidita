# 🎨 Temas

Obsidita trae dos estilos visuales, **Obsidian** y **Gemini**, cada uno en versión clara y oscura. Puedes instalar los tuyos: cada tema es un archivo `.css` que la app detecta sola al compilar la web.

- Se eligen en **⚙️ Ajustes → Apariencia → Tema**: *Obsidian claro*, *Obsidian oscuro*, *Gemini claro*, *Gemini oscuro*... y cada uno también *según el sistema*.
- La elección se guarda en el servidor y se aplica en todos tus dispositivos.
- El navegador solo descarga el tema elegido, así que tener muchos instalados no hace la app más lenta.

---

## 📋 Índice

1. [Instalar un tema](#-instalar-un-tema)
2. [Crear tu propio tema](#️-crear-tu-propio-tema)
3. [Variables de color](#-variables-de-color)
4. [Desinstalar un tema](#️-desinstalar-un-tema)
5. [Problemas frecuentes](#-problemas-frecuentes)

---

## 📥 Instalar un tema

1. Copia el archivo `.css` en la carpeta de temas:

   ```
   web/src/styles/themes/
   ```

2. Vuelve a compilar la web y reinicia el servicio:

   ```bash
   cd /opt/obsidita
   sudo -u obsidita npm run web:build
   sudo systemctl restart obsidita
   ```

3. Recarga la página en el navegador y elige el tema en **⚙️ Ajustes → Apariencia → Tema**.

El nombre que aparece en el selector sale del nombre del archivo:

| Archivo | En el selector |
|---|---|
| `gemini.css` | Gemini claro / Gemini oscuro |
| `nord.css` | Nord claro / Nord oscuro |
| `mi-tema_azul.css` | Mi Tema Azul claro / Mi Tema Azul oscuro |

> [!NOTE]
> Solo se detectan los `.css` de `web/src/styles/themes/`. Los de `web/src/styles/` (como `ai.css`) no son temas: son estilos de partes concretas de la app.

---

## 🖌️ Crear tu propio tema

Un tema es una hoja de estilos **completa** de la app, no solo una paleta de colores. Lo más sencillo es partir de uno existente:

1. Copia `obsidian.css` (o `gemini.css`) con otro nombre:

   ```bash
   cp web/src/styles/themes/obsidian.css web/src/styles/themes/mi-tema.css
   ```

2. Cambia los colores en los dos bloques del principio:

   ```css
   /* Variante oscura */
   :root {
     --background-primary: #1a1a1a;
     --text-normal: #dcddde;
     --interactive-accent: #8b7fd8;
     /* ... */
     color-scheme: dark;
   }

   /* Variante clara */
   :root[data-theme="light"] {
     --background-primary: #ffffff;
     --text-normal: #222222;
     --interactive-accent: #7b6cd9;
     /* ... */
     color-scheme: light;
   }
   ```

3. Si quieres, retoca el resto del archivo (bordes, radios, espaciados, sombras...).
4. Compila y elige el tema como en [Instalar un tema](#-instalar-un-tema).

Para probarlo mientras lo editas, arranca la web en modo desarrollo (`npm run dev` dentro de `web/`): los cambios se ven al momento, sin compilar.

### Reglas que debe cumplir

- **Las dos variantes**: los colores oscuros en `:root` y los claros en `:root[data-theme="light"]`. La app cambia entre ellas con el atributo `data-theme` de `<html>`.
- **Todas las variables**: si falta alguna, las partes que la usan se verán sin color. Copia la lista completa de un tema existente.
- **No toques las variables de fuente** (`--font-interface`, `--font-text`, `--font-monospace`, `--font-text-size`, `--line-width`): las ajusta la app según las preferencias del usuario. Sí puedes cambiar las fuentes por defecto (`--font-interface-default` y `--font-monospace-default`).
- Puedes cargar fuentes externas con `@import url(...)` al principio del archivo, como hace `gemini.css` con Google Fonts.

---

## 🎨 Variables de color

| Variable | Para qué se usa |
|---|---|
| `--background-primary` | Fondo de la nota |
| `--background-secondary` | Barras laterales, cabecera y menús. También da color a la barra del navegador en el móvil |
| `--background-secondary-alt` | Bloques de código, citas y menús desplegables |
| `--background-tertiary` | Elementos al pasar el ratón o seleccionados, campos de los ajustes |
| `--background-modifier-border` | Bordes y separadores |
| `--background-modifier-hover` | Fondo al pasar el ratón (opcional) |
| `--background-modifier-active-hover` | Fondo de un elemento activo al pasar el ratón (opcional) |
| `--text-normal` | Texto principal |
| `--text-muted` | Texto secundario |
| `--text-faint` | Texto apagado (iconos, pistas, contadores) |
| `--text-accent` | Enlaces y texto destacado |
| `--interactive-normal` | Fondo de campos y botones de búsqueda y propiedades |
| `--interactive-hover` | Botones al pasar el ratón |
| `--interactive-accent` | Color de acento (botones principales, selección, interruptores) |
| `--interactive-accent-rgb` | El acento en formato `R, G, B`, para transparencias. **Debe coincidir** con `--interactive-accent` |
| `--interactive-accent-hover` | Acento al pasar el ratón |
| `--interactive-accent-active` | Acento al pulsar |
| `--color-red` / `--color-orange` / `--color-green` / `--color-blue` | Errores, avisos, éxito e información; también los callouts |
| `--scrollbar-bg` / `--scrollbar-thumb` | Barra de desplazamiento |

`color-scheme` (`dark` o `light`) hace que los controles nativos del navegador (casillas, desplegables, barras de desplazamiento) usen la variante correcta.

---

## 🗑️ Desinstalar un tema

Borra su `.css` de `web/src/styles/themes/`, compila y reinicia. Quien lo tuviera elegido pasa automáticamente a **Obsidian**, conservando la variante clara u oscura.

> [!WARNING]
> No borres `obsidian.css`: es el tema por defecto.

---

## 🩺 Problemas frecuentes

**El tema nuevo no aparece en el selector**
- Comprueba que está en `web/src/styles/themes/` y que termina en `.css`.
- Hay que volver a compilar (`npm run web:build`) y recargar la página. Si sigue sin salir, fuerza la recarga con `Ctrl+Shift+R`.

**Algunas zonas salen sin color o transparentes**
- Falta alguna variable en `:root` o en `:root[data-theme="light"]`. Compara con [la lista de variables](#-variables-de-color).

**La variante clara se ve igual que la oscura**
- Falta el bloque `:root[data-theme="light"]`, o tiene otro selector.

**Las transparencias del acento tienen otro color**
- `--interactive-accent-rgb` no coincide con `--interactive-accent`.
