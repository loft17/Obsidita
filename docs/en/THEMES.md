# 🎨 Themes

Obsidita ships with two visual styles, **Obsidian** and **Gemini**, each in a light and a dark version. You can install your own: every theme is a `.css` file that the app picks up automatically when the web app is built.

- Choose one in **⚙️ Settings → Appearance → Theme**: *Obsidian light*, *Obsidian dark*, *Gemini light*, *Gemini dark*... and each one also *follow system*.
- Your choice is saved on the server and applied on all your devices.
- The browser only downloads the selected theme, so having many installed doesn't slow the app down.

---

## 📋 Contents

1. [Install a theme](#-install-a-theme)
2. [Create your own theme](#️-create-your-own-theme)
3. [Color variables](#-color-variables)
4. [Uninstall a theme](#️-uninstall-a-theme)
5. [Troubleshooting](#-troubleshooting)

---

## 📥 Install a theme

1. Copy the `.css` file into the themes folder:

   ```
   web/src/styles/themes/
   ```

2. Rebuild the web app and restart the service:

   ```bash
   cd /opt/obsidita
   sudo -u obsidita npm run web:build
   sudo systemctl restart obsidita
   ```

3. Reload the page in the browser and choose the theme in **⚙️ Settings → Appearance → Theme**.

The name shown in the selector comes from the file name:

| File | In the selector |
|---|---|
| `gemini.css` | Gemini light / Gemini dark |
| `nord.css` | Nord light / Nord dark |
| `my-theme_blue.css` | My Theme Blue light / My Theme Blue dark |

> [!NOTE]
> Only `.css` files in `web/src/styles/themes/` are detected. The ones in `web/src/styles/` (such as `ai.css`) aren't themes: they style specific parts of the app.

---

## 🖌️ Create your own theme

A theme is a **complete** stylesheet for the app, not just a color palette. The easiest way is to start from an existing one:

1. Copy `obsidian.css` (or `gemini.css`) under a new name:

   ```bash
   cp web/src/styles/themes/obsidian.css web/src/styles/themes/my-theme.css
   ```

2. Change the colors in the two blocks at the top:

   ```css
   /* Dark variant */
   :root {
     --background-primary: #1a1a1a;
     --text-normal: #dcddde;
     --interactive-accent: #8b7fd8;
     /* ... */
     color-scheme: dark;
   }

   /* Light variant */
   :root[data-theme="light"] {
     --background-primary: #ffffff;
     --text-normal: #222222;
     --interactive-accent: #7b6cd9;
     /* ... */
     color-scheme: light;
   }
   ```

3. Optionally, tweak the rest of the file (borders, radii, spacing, shadows...).
4. Build and choose the theme as in [Install a theme](#-install-a-theme).

To try it while you edit, run the web app in development mode (`npm run dev` inside `web/`): changes show up instantly, without building.

### Rules it must follow

- **Both variants**: dark colors in `:root` and light colors in `:root[data-theme="light"]`. The app switches between them with the `data-theme` attribute on `<html>`.
- **Every variable**: if one is missing, the parts that use it will show up without color. Copy the full list from an existing theme.
- **Don't touch the font variables** (`--font-interface`, `--font-text`, `--font-monospace`, `--font-text-size`, `--line-width`): the app sets them from the user's preferences. You can change the default fonts (`--font-interface-default` and `--font-monospace-default`).
- You can load external fonts with `@import url(...)` at the top of the file, as `gemini.css` does with Google Fonts.

---

## 🎨 Color variables

| Variable | Used for |
|---|---|
| `--background-primary` | Note background |
| `--background-secondary` | Sidebars, header and menus. Also colors the browser bar on mobile |
| `--background-secondary-alt` | Code blocks, quotes and dropdown menus |
| `--background-tertiary` | Hovered or selected items, settings fields |
| `--background-modifier-border` | Borders and separators |
| `--background-modifier-hover` | Hover background (optional) |
| `--background-modifier-active-hover` | Hover background of an active item (optional) |
| `--text-normal` | Main text |
| `--text-muted` | Secondary text |
| `--text-faint` | Faded text (icons, hints, counters) |
| `--text-accent` | Links and highlighted text |
| `--interactive-normal` | Background of search and property fields and buttons |
| `--interactive-hover` | Buttons on hover |
| `--interactive-accent` | Accent color (primary buttons, selection, toggles) |
| `--interactive-accent-rgb` | The accent as `R, G, B`, for transparency. **Must match** `--interactive-accent` |
| `--interactive-accent-hover` | Accent on hover |
| `--interactive-accent-active` | Accent when pressed |
| `--color-red` / `--color-orange` / `--color-green` / `--color-blue` | Errors, warnings, success and info; also callouts |
| `--scrollbar-bg` / `--scrollbar-thumb` | Scrollbar |

`color-scheme` (`dark` or `light`) makes the browser's native controls (checkboxes, dropdowns, scrollbars) use the right variant.

---

## 🗑️ Uninstall a theme

Delete its `.css` from `web/src/styles/themes/`, build and restart. Anyone who had it selected automatically switches to **Obsidian**, keeping the light or dark variant.

> [!WARNING]
> Don't delete `obsidian.css`: it's the default theme.

---

## 🩺 Troubleshooting

**The new theme doesn't show up in the selector**
- Check that it's in `web/src/styles/themes/` and ends in `.css`.
- You need to rebuild (`npm run web:build`) and reload the page. If it still doesn't show up, force a reload with `Ctrl+Shift+R`.

**Some areas show up without color or transparent**
- A variable is missing in `:root` or `:root[data-theme="light"]`. Compare against [the variable list](#-color-variables).

**The light variant looks the same as the dark one**
- The `:root[data-theme="light"]` block is missing or uses a different selector.

**Accent transparency has a different color**
- `--interactive-accent-rgb` doesn't match `--interactive-accent`.
