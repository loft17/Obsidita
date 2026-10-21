<a id="top"></a>

<p align="center">
  <b>🇬🇧 English</b> · <a href="README.es.md">🇪🇸 Español</a>
</p>

<p align="center">
  <img src="docs/images/logo_readme.webp" alt="Obsidita" width="720">
</p>

<p align="center">
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-%E2%89%A520-5FA04E?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React"></a>
  <a href="https://expressjs.com/"><img src="https://img.shields.io/badge/Express-4-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-F7DF1E?style=for-the-badge" alt="MIT License"></a>
  <a href="https://claude.com/claude-code"><img src="https://img.shields.io/badge/Built_with-Claude-D97757?style=for-the-badge&logo=claude&logoColor=white" alt="Built with Claude"></a>
</p>

---

## 💎 Your Obsidian vault, in any browser

<div align="justify">

**Obsidita** is an **ultra-lightweight**, **self-hosted** web viewer and editor for your Markdown notes. Install it on your VPS and reach your vault from any device, through an interface that stays true to Obsidian.

Obsidita works directly on your vault folder: your notes remain plain `.md` files, with no database and no proprietary format, so you can keep opening them with Obsidian on your desktop. From a work laptop, a tablet or your phone you can write with live preview, follow your wikilinks, search the whole vault, edit properties and paste images, and your changes are saved automatically.

Your notes stay on your server, protected by a password, revocable sessions and secure-by-default settings. And if you want them on other devices too, you can sync them with GitHub right from the web interface.

</div>

<p align="center">
  <img src="docs/images/screen_001.webp" alt="Obsidita showing a note in reading mode, with its properties and the file explorer" width="100%">
</p>

> [!TIP]
> **In a hurry?** `git clone` → `npm install` → `npm start` → open `http://localhost:3000` and paste the token printed in the console. [See installation ↓](#-installation)

---

## 📑 Contents

<table>
<tr>
<td valign="top" width="33%">

**Get started**
- [✨ Features](#-features)
- [🚀 Installation](#-installation)
- [🔧 Initial setup](#-initial-setup)
- [🧩 Environment variables](#-environment-variables)

</td>
<td valign="top" width="33%">

**Use**
- [⌨️ Keyboard shortcuts](#️-keyboard-shortcuts)
- [🔄 GitHub sync](#-github-sync)
- [⚠️ Important](#️-important)

</td>
<td valign="top" width="33%">

**Reference**
- [📚 Documentation](#-documentation)
- [🤖 Built with AI](#-built-with-ai)
- [📄 License](#-license)

</td>
</tr>
</table>

---

## ✨ Features

<table>
<tr>
<td width="50%" valign="top">

### ✍️ Write like in Obsidian
- **CodeMirror 6** editor with **live preview** (tables included) or **source mode**.
- **Reading mode** with syntax highlighting and **Mermaid diagrams**.
- **Autosave** as you type, plus `Ctrl+S` to force it.
- If a note changes on another device, it reloads by itself; if you had unsaved changes, you choose which version to keep.
- Editable **properties** (YAML frontmatter), with `tags` and `aliases` as lists.

</td>
<td width="50%" valign="top">

### 🔗 Connect your ideas
- **Wikilinks**: `[[note]]`, `[[note|alias]]` and `[[note#heading]]`.
- Links to missing notes are dimmed and **create the note** when clicked.
- **Global search** across names and content, with context.
- Filter by tag with `tag:project`.
- In-note search with `Ctrl+F`.

</td>
</tr>
<tr>
<td valign="top">

### 📂 Organize your vault
- **File explorer** with collapsible folders and a context menu.
- **Tabs**: `Ctrl`/`Cmd` + click or middle click.
- Move and rename: **links update** automatically.
- `.trash` folder you can restore from.
- **Attachments**: drag or paste images; they're stored where Obsidian desktop puts them.
- **Daily notes and templates** using the same settings as Obsidian.

</td>
<td valign="top">

### ☁️ Built for your server
- **GitHub sync**, manual or scheduled.
- Optional **AI editing** (`Ctrl+K`): DeepSeek, Gemini, OpenAI, Ollama...
- **PDF export** from the browser.
- **Word** and character **count**.
- **Dark, light or system** theme, and a choice of fonts (your own too).
- Interface in **English, Spanish or Catalan**.

</td>
</tr>
</table>

> [!NOTE]
> 🔒 **Secure by default:** `scrypt` password hashing · revocable sessions · login rate limiting · CSRF protection · strict CSP · isolated vault.

---

## 🚀 Installation

| You need | Details |
| :--- | :--- |
| 🟢 **Node.js** | **20 or later** (20.12+ to load the `.env` file) and the `npm` that ships with it. |
| 🐙 **git** | **2.31 or later**, only if you're going to use GitHub sync. |
| 📁 **A vault** | A folder on the server: an existing vault or an empty folder. |
| 🔐 **In production** | A domain and a reverse proxy with HTTPS (Caddy or nginx). Strongly recommended. |

```bash
git clone https://github.com/loft17/Obsidita.git
cd Obsidita
npm install
npm start
```

<div align="justify">

Open **`http://localhost:3000`** and follow the [initial setup](#-initial-setup). To deploy it on a server with systemd, nginx and HTTPS, see the full guide in [Installation and setup](docs/en/INSTALLATION_AND_SETUP.md).

</div>

> [!WARNING]
> **Don't use `npm install --omit=dev` or `--production`.** The web app is built with Vite (a dev dependency) during `postinstall`; without it `web/dist` isn't generated and the page will be blank.

---

## 🔧 Initial setup

<div align="justify">

On first start, the server prints a **one-time token** to the console. This way, nobody who reaches the site before you can set it up.

</div>

```text
==================================================
  Token de configuración inicial: 3f9a1c0e7b2d4a6f8e1c9b0d
==================================================
```

1. Open the site and paste the **setup token**.
2. Enter the **absolute path** of your vault, for example `/srv/vaults/my-vault`.
3. Choose a **password** of at least **12 characters**.
4. Optionally, change the **port** (default `3000`).
5. Click **Set up** and log in. Done! 🎉

---

## 🧩 Environment variables

<div align="justify">

On startup, the server loads the **`.env`** file from the app folder, if there is one. Copy the template, adjust it and restart. Variables set in the shell, in systemd or in PM2 take precedence over those in `.env`.

</div>

```bash
cp .env.example .env && nano .env
```

| Variable | What it does |
| :--- | :--- |
| `HOST` | In production, `127.0.0.1`, so only the reverse proxy can connect. |
| `TRUST_PROXY` | Set it to `1` if there's a reverse proxy in front (Caddy, nginx). |
| `VAULTS_ROOT` | Restricts the vault to a specific folder, e.g. `/srv/vaults`. |
| `UPDATE_CHECK` | With `0`, the server doesn't check GitHub for new versions. |
| `MAX_UPLOAD_MB`, `MAX_NOTE_MB`… | Limits for size, search, password and sessions. |

<div align="justify">

Every variable is commented in [`.env.example`](.env.example) and explained in detail in [Installation and setup](docs/en/INSTALLATION_AND_SETUP.md#-environment-variables).

</div>

---

## ⌨️ Keyboard shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>P</kbd> | Quickly open a note |
| <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>S</kbd> | Save now |
| <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>E</kbd> | Toggle editing and reading |
| <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd> | Search the whole vault |
| <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>F</kbd> | Search within the note |
| <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + wheel | Change the font size |

<div align="justify">

The full list is in [Keyboard shortcuts](docs/en/KEYBOARD_SHORTCUTS.md).

</div>

---

## 🔄 GitHub sync

<div align="justify">

Obsidita can keep your vault in sync with a GitHub repository and, through it, with Obsidian desktop using the **Obsidian Git** plugin. Set it up under **Preferences → Sync**: enter the repository (preferably private, since all your notes are uploaded), the branch and a **personal access token** scoped to that repository.

Each sync commits your changes, merges those from the repository and pushes the result. If a note changed on both sides, the server's version wins. You can sync manually or pick an automatic interval, from every 5 minutes to once a day. The token is stored only on the server and never reaches the browser; the `.trash` folder is not uploaded.

</div>

---

## ⚠️ Important

> [!NOTE]
> **Firefox:** some text fields use `field-sizing`, which works in recent Chrome, Edge and Safari but may not in Firefox. There the field won't grow with the text, but it still fills the free space on the line, so it remains usable.

---

## 📚 Documentation

| Document | Contents |
| :--- | :--- |
| 📖 [User guide](docs/en/USER_GUIDE.md) | The basics to start writing and organizing your notes. |
| ⚙️ [Installation and setup](docs/en/INSTALLATION_AND_SETUP.md) | Production deployment, nginx, environment variables and backups. |
| ⌨️ [Keyboard shortcuts](docs/en/KEYBOARD_SHORTCUTS.md) | Every available shortcut. |
| ✨ [AI editing](docs/en/AI.md) | Set up providers (DeepSeek, Gemini...) and edit notes with AI. |
| 🩺 [Errors and solutions](docs/en/ERRORS_AND_SOLUTIONS.md) | Common problems and how to fix them. |
| 🪶 [Limited resources](docs/en/OPTIMIZATION_LIMITED_RESOURCES.md) | How to tune it for small servers. |
| 🧰 [Ready-to-use scripts](docs/en/READY_TO_USE_SCRIPTS.md) | Scripts to install, update and maintain the app. |
| 🏗️ [Architecture](docs/en/ARCHITECTURE.md) | How the code is organized. |
| 🔌 [HTTP API](docs/en/API.md) | Server endpoints. |
| 🤝 [Contributing](CONTRIBUTING.md) | How to run the project locally and propose changes (in Spanish). |

<div align="justify">

🇪🇸 The documentation is also available in Spanish in [docs/es](docs/es/).

</div>

---

## 🤖 Built with AI

<div align="justify">

Obsidita was built with the help of **[Claude](https://claude.com/claude-code)**, Anthropic's AI, using Claude Code: both the code and the documentation were written and reviewed in collaboration with it.

</div>

---

## 📄 License

<div align="justify">

Distributed under the [MIT](https://opensource.org/licenses/MIT) license.

Obsidita is an independent project and is not affiliated with, sponsored or endorsed by Obsidian or Dynalist Inc. "Obsidian" is a trademark of its respective owners and is mentioned here only to indicate compatibility.

</div>

---

<p align="center">
  Made with 💜 for everyone who lives in their Obsidian vault.<br><br>
  <a href="#top"><b>⬆ Back to top</b></a>
</p>
