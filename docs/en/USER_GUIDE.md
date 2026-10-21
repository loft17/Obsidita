# 📖 User Guide - Obsidita

Welcome to **Obsidita**, your Obsidian vault in the browser. This guide shows you the basics to get started.

---

## 🚪 Access and Password

1. **Open the web** in your browser (your administrator will give you the address)
2. **Enter your password** and click *Login*
3. ✅ You're in. Your session will last **30 days** (or 7 days without using the web)

> **💡 Tip**: If you use many devices, login on each one. You can close all sessions from ⚙️ → Security.

---

## 📝 Create and Edit Notes

### Create a New Note

Three ways:

1. **Explorer** (left panel) → right-click on folder → *New Note*
2. **Quick Search** → `Ctrl+P` (or `Cmd+P` on Mac) → type name → *Create*
3. **Menu** (≡) → *New Note*

### Edit a Note

- **Click a note** in explorer to open it
- **Click in text** to enter edit mode
- **Type** as in any editor
- ✅ Saves **automatically** every few seconds (without you doing anything)
- `Ctrl+S` to save now

### Toggle Read/Edit Mode

- **Preview** (reading): see rendered Markdown, cannot edit
- **Edit**: see Markdown code and can change text
- `Ctrl+E` to toggle between modes

---

## 🎨 Text Formatting (Simple)

While editing, use these shortcuts:

| What I Want | Shortcut | Or Type |
|---|---|---|
| **Bold** | `Ctrl+B` | `**text**` |
| *Italic* | `Ctrl+I` | `*text*` |
| `Code inline` | `Ctrl+'` | `` `code` `` |
| Code block | — | ````triple backtick```` |
| # Heading | — | `# Text` |
| > Quote | — | `> Text` |
| - List | — | `- Text` |
| 1. Numbered | — | `1. Text` |

> **Tip**: If there's toolbar above the editor, click buttons to insert formatting.

---

## 🔗 Wikilinks (Connect Your Notes)

**Wikilinks** are how you connect notes together.

```
[[Another Note]]              → Link to "Another Note"
[[Another Note|with this text]]  → Link says "with this text"
[[Another Note#Section]]     → Link to specific section
```

**How to use:**
1. Type `[[` while editing
2. A list opens → choose one or type name
3. Click link to go to that note
4. If note **doesn't exist**, it appears faded; click to create it

---

## 🔍 Search Notes

### Quick Search (by name)

- `Ctrl+P` → start typing → `Enter` to open

### Global Search (in all content)

- `Ctrl+Shift+F` → type what you search
- See where it appears in each note
- Click result to go there

### Search Within Note

- `Ctrl+F` while reading/editing → type → `Enter` next, `Shift+Enter` previous

### Search by Tag

- In global search, type `tag:project` to see all notes with that tag

---

## 📁 Explorer (Left Panel)

The **explorer** shows your folder structure.

### Main Actions

| Action | How |
|--------|------|
| **Expand/collapse folder** | Click arrow ▶ |
| **Open in new tab** | `Ctrl+click` (or `Cmd+click`) |
| **Context menu** | Right-click → options |
| **Move/rename** | Right-click → *Rename* or *Move* (links update automatically) |
| **Delete** | Right-click → *Delete* (goes to trash, can recover) |
| **Hide explorer** | `Ctrl+B` |

---

## 📎 Attachments and Images

### Paste an Image

- Simply **paste** with `Ctrl+V` (or `Cmd+V`) while editing
- Saves to attachments folder automatically

### Upload File

- **Drag** a file from your computer to explorer (left panel)
- You can also drag entire folders (structure is preserved)

### Insert Image in Note

- From editor → menu (≡) → *Insert Image* → choose file
- Or type directly: `![](path/image.png)`

---

## ✨ Edit with AI

If it's configured (**⚙️ → AI**), you can ask an AI to edit the note or the selected text:

1. Press `Ctrl+K`, the **✨** button in the editor toolbar, or **Edit with AI** in the note menu.
2. Type what you want ("fix the spelling", "summarize as bullet points"...) and press `Enter`, or use a quick action.
3. The change is applied directly. If you don't like it, `Ctrl+Z` or the **Undo** button revert it.

Setup and troubleshooting: [AI editing](AI.md).

---

## ⚙️ Preferences

Open **⚙️** (top right) to change:

### 👁️ Appearance
- **Language**: Spanish, English, Catalan
- **Theme**: Dark, Light, or System
- **Font Size**: Adjustable with `Ctrl+wheel`

### ✏️ Editor
- **Default Mode**: Open notes in read or edit mode?
- **Line Numbers**: Yes or no

### 📂 Files
- **Attachments Folder**: Where images and files upload
- **Vault Folder**: You can change it here (requires password)

### ✨ AI
- **Providers**, API keys (stored encrypted), fallback and quick actions. See [AI editing](AI.md)

---

## 🗑️ Trash

When you **delete a note**, it goes to `.trash/` folder (trash).

- **Recover it**: Right-click in `.trash/` → note → *Move* → choose where
- **Empty trash**: Right-click in `.trash/` → *Empty Trash*

---

## 📊 Tabs and Organization

### Open Note in New Tab

- `Ctrl+click` in explorer
- Or middle mouse button

### Close a Tab

- Click the `✕` on the tab
- Or `Ctrl+W`

---

## ⌨️ Useful Shortcuts (at a Glance)

| Shortcut | What It Does |
|-------|----------|
| `Ctrl+P` | Open note (quick search) |
| `Ctrl+Shift+F` | Search entire vault |
| `Ctrl+F` | Search this note |
| `Ctrl+E` | Toggle read ↔ edit |
| `Ctrl+S` | Save now |
| `Ctrl+B` | Show/hide explorer |
| `Ctrl+K` | Edit with AI |
| `Ctrl+W` | Close tab |
| `Escape` | Close dialogs and menus |

---

## 💾 Download Your Vault

If you want a backup copy:

1. Open **menu** (≡) of any note
2. *More Options* → *Download Vault*
3. A `.zip` file downloads with all your notes

---

## ❓ Something Doesn't Work or I Have Questions

- **Ask the administrator** of the server (who gave you access)
- Or check the [complete documentation](../../README.md) (more detailed)

---

Enjoy organizing your ideas! 📝✨
