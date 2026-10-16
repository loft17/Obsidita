# 🏗️ Obsidita Architecture

## 📋 Table of Contents

- [Overview](#overview)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Layered Architecture](#layered-architecture)
- [Data Flow](#data-flow)
- [Main Components](#main-components)
- [Backend API](#backend-api)
- [Authentication System](#authentication-system)
- [Development Guide](#development-guide)
- [Conventions and Patterns](#conventions-and-patterns)

---

## 🎯 Overview

**Obsidita** is a complete web application that allows you to view, edit, and sync [Obsidian](https://obsidian.md/) vaults through the browser. It combines a modern React frontend with a robust Node.js/Express backend.

```
┌─────────────────────────────────────────────────────┐
│              🌐 Web Browser                          │
├─────────────────────────────────────────────────────┤
│  React App (Vite) - TypeScript - Zustand State      │
│  - Editor (CodeMirror)                              │
│  - Markdown Viewer                                  │
│  - File Explorer                                    │
│  - Search Panel                                     │
│  - Task System                                      │
└────────────────┬────────────────────────────────────┘
                 │ API REST + WebSockets
                 │ (JSON, session cookies)
                 ▼
┌─────────────────────────────────────────────────────┐
│         📦 Backend Node.js/Express                  │
├─────────────────────────────────────────────────────┤
│  - Authentication Routes                           │
│  - File & Vault Management                         │
│  - Search System                                   │
│  - Synchronization (GitHub/Dropbox)                │
│  - Sessions & Security                             │
│  - Font Management                                 │
└────────────────┬────────────────────────────────────┘
                 │ Read/Write
                 │ Files
                 ▼
┌─────────────────────────────────────────────────────┐
│      💾 File System / Obsidian Vault                │
│  ├── /notes        (.md files)                      │
│  ├── /.obsidian    (configuration)                  │
│  └── /attachments  (images and files)               │
└─────────────────────────────────────────────────────┘
```

---

## 🛠️ Technology Stack

### Frontend
| Technology | Purpose | Version |
|-----------|---------|---------|
| **React** | UI Library | 18.2.0 |
| **TypeScript** | Static Typing | 5.0.0 |
| **Vite** | Bundler & Dev Server | 6.4.4 |
| **Zustand** | Global State Management | 4.4.0 |
| **CodeMirror** | Code/Markdown Editor | 6.x |
| **markdown-it** | Markdown Parser | 15.0.2 |
| **Mermaid** | Markdown Diagrams | 11.17.2 |

### Backend
| Technology | Purpose |
|-----------|---------|
| **Node.js** | Runtime (>=20.0.0) |
| **Express** | Web Framework |
| **cookie-parser** | Cookie Management |
| **archiver** | File Compression |
| **highlight.js** | Syntax Highlighting |

### Development Tools
- **concurrently** - Run frontend and backend dev server simultaneously
- **@types/react** - React type definitions
- **ESM modules** - Native ES6 modules

---

### 📦 Dependency Management

> **⚠️ Important:** All dependencies are in the root `package.json`. The frontend is compiled with Vite in the `postinstall`, so **development dependencies are also needed in production**.

This means:
- `npm install --omit=dev` **will NOT** work correctly
- You must do `npm install` (including devDependencies) also in production
- The `web/` directory has its own `package.json` but dependencies are resolved from root
- The `postinstall` script automatically runs `npm run web:build` after install

Installation flow:
```bash
npm install
  ↓
npm run postinstall
  ↓
cd web && vite build    # Compile frontend
  ↓
Frontend ready to serve from dist/
```

---

## 📁 Project Structure

```
Obsidian-Web/
├── 📄 package.json           # Dependencies and scripts
├── 📄 ARCHITECTURE.md        # This file
│
├── 🌐 web/                   # Frontend (React + Vite + TypeScript)
│   ├── src/
│   │   ├── components/       # Reusable React components
│   │   │   ├── App.tsx       # Entry point
│   │   │   ├── MainLayout.tsx# Main layout (editor, sidebar, etc)
│   │   │   ├── Editor.tsx    # Editor with CodeMirror
│   │   │   ├── ReadingView.tsx# Rendered markdown viewer
│   │   │   ├── FileExplorer.tsx# File tree
│   │   │   ├── SearchPanel.tsx# Full-text search
│   │   │   ├── SettingsModal.tsx# User settings
│   │   │   ├── Setup.tsx     # Initial setup wizard
│   │   │   ├── Login.tsx     # Authentication screen
│   │   │   └── [others]      # TagsPanel, NoteMenu, ImageViewer, etc
│   │   │
│   │   ├── store.ts          # Global state (Zustand)
│   │   ├── api.ts            # HTTP client for backend communication
│   │   ├── main.tsx          # App entry point
│   │   │
│   │   ├── i18n/             # Internationalization
│   │   │   ├── index.tsx     # i18n context and hooks
│   │   │   ├── en.ts         # English translations
│   │   │   └── es.ts         # Spanish translations
│   │   │
│   │   ├── utils/            # Helper functions
│   │   │   ├── wikilinks.ts  # [[wikilinks]] processing
│   │   │   ├── frontmatter.ts# YAML frontmatter parsing
│   │   │   ├── attachments.ts# Attachment handling
│   │   │   ├── imageUpload.ts# Image upload
│   │   │   ├── mermaidDiagrams.ts# Diagram rendering
│   │   │   ├── livePreview.ts# Live preview update
│   │   │   ├── codeHighlight.ts# Code highlighting
│   │   │   ├── mobile.ts     # Mobile detection & support
│   │   │   └── [others]      # fonts, toast, templates, etc
│   │   │
│   │   └── styles/           # Global CSS and themes
│   │
│   ├── public/               # Static assets
│   ├── dist/                 # Build output (generated)
│   ├── vite.config.ts        # Vite configuration
│   ├── tsconfig.json         # TypeScript configuration
│   └── package.json
│
├── 🔧 server/                # Backend (Node.js + Express)
│   ├── index.js              # Entry point, Express configuration
│   │
│   ├── core/                 # Core logic
│   │   ├── vault.js          # Vault management (read/write)
│   │   ├── sync.js           # Sync engine (GitHub, Dropbox)
│   │   ├── sessions.js       # Session storage
│   │   ├── searchIndex.js    # Full-text search index
│   │   └── links.js          # Link analysis and relationships
│   │
│   ├── routes/               # API Endpoints
│   │   ├── auth.js           # POST /login, /logout, /change-password
│   │   ├── files.js          # GET/POST /notes, /attachments, /tree
│   │   ├── search.js         # GET /search?q=
│   │   ├── settings.js       # GET/POST /settings, /fonts
│   │   ├── sync.js           # POST /sync, /sync-status
│   │   ├── setup.js          # GET /setup, POST /setup
│   │   └── fonts.js          # GET /fonts/:name
│   │
│   ├── middleware/           # Express Middlewares
│   │   ├── security.js       # CSRF, security headers, limits
│   │   ├── password.js       # Sensitive endpoint protection
│   │   └── env.js            # Environment variables
│   │
│   ├── utils/                # Helper functions
│   │   ├── limits.js         # Size limits
│   │   ├── updates.js        # Update management
│   │   └── lazy.js           # Lazy module loading
│   │
│   └── .env                  # Environment variables (not versioned)
│
├── 💾 data/                  # Local storage (not versioned)
│   ├── .secret               # Secret for signing cookies
│   ├── .password             # Password hash
│   ├── sessions.json         # Active sessions
│   ├── config.json           # Saved configuration
│   ├── ai.json               # AI configuration
│   └── [vault]               # Obsidian Vault
│       ├── notes/            # .md files
│       ├── .obsidian/        # Obsidian configuration
│       └── attachments/      # Images and other files
│
└── 📚 utils/                 # Scripts and documentation
    ├── ENG/                  # Documentation in English
    │   ├── ERRORS_AND_SOLUTIONS.md
    │   └── [other guides]
    └── [useful scripts]
```

---

## 🏛️ Layered Architecture

### Presentation Layer (Frontend)

**Responsibilities:**
- Render React UI
- Manage user state
- Capture user input
- Communicate with backend

**Key Components:**
- `App.tsx` - Lifecycle management (Setup → Login → Main)
- `MainLayout.tsx` - Main layout with editor, sidebar, commands
- `Editor.tsx` - CodeMirror integration
- `ReadingView.tsx` - Processed markdown rendering

**Global State (Zustand):**
```typescript
// store.ts
{
  // Folder/file structure
  tree: FileNode[],
  
  // Open file
  currentNote: Note,
  content: string,
  
  // Interface
  sidebarCollapsed: boolean,
  theme: 'light' | 'dark',
  
  // Search
  searchResults: Note[],
}
```

---

### Business Logic Layer (Backend)

**Responsibilities:**
- Validate and authorize requests
- Execute vault operations
- Maintain synchronization
- Manage search

**Typical Request Flow:**

```
1. Client makes request to POST /api/notes/save
                    ↓
2. Security middleware (CSRF, headers)
                    ↓
3. Authentication (verify session cookie)
                    ↓
4. Authorization (authenticated user)
                    ↓
5. Data validation (maximum size, etc)
                    ↓
6. Vault operation (file read/write)
                    ↓
7. Update search index
                    ↓
8. Respond to client
```

---

### Data Layer (Storage)

**File System:**
```
data/
├── [vault-name]/
│   ├── notes/          # Markdown files (.md)
│   ├── attachments/    # Images, PDFs, etc
│   └── .obsidian/      # Obsidian Config
├── config.json         # Configuration (vault path, etc)
├── sessions.json       # Active sessions
├── ai.json            # AI configuration
├── .password          # Password bcrypt hash
└── .secret            # Secret for signing cookies
```

---

## 🔄 Data Flow

### Edit Cycle: User Edits a File

```
┌──────────────────────────────────────────────────────────────┐
│ 1️⃣  User types in CodeMirror                                │
└──────────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│ 2️⃣  onChange event triggers debounce (500ms)                 │
└──────────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│ 3️⃣  Save to local store (Zustand)                            │
│     - Show "Unsaved" indicator                               │
│     - Update live preview                                    │
└──────────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│ 4️⃣  POST /api/notes/:path with content                       │
│     Header: { 'X-CSRF-Token': ... }                          │
│     Body: { content: string }                                │
└──────────────────────────────────────────────────────────────┘
                           ↓
         ┌─────────────────┴─────────────────┐
         ▼                                   ▼
    ✅ Success                           ❌ Error
    - Status 200                       - Error toast
    - Save to file                     - Retry
    - Update index                     - Show conflict
    - Respond to client
         │                                   │
         └─────────────────┬─────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ 5️⃣  Client updates state                                     │
│     - Clear "Unsaved" indicator                              │
│     - Show last save time                                    │
└──────────────────────────────────────────────────────────────┘
```

### Automatic Synchronization Cycle

```
Every 5 minutes (configurable):

┌──────────────────────────────────────────────────────────────┐
│ SyncManager checks for changes in GitHub/Dropbox             │
└──────────────────────────────────────────────────────────────┘
                           ↓
    ┌──────────────────────┴──────────────────────┐
    ▼                                             ▼
Remote Changes                           No Remote Changes
    │                                             │
    ├─ Download files                            └─ Wait
    ├─ Merge changes
    ├─ Update index
    └─ Notify client
```

---

## 🧩 Main Components

### Frontend Components

#### `MainLayout.tsx`
Main layout containing:
- **Ribbon** (left) - Quick command buttons
- **FileExplorer** (left-center) - File tree
- **Editor** (center) - CodeMirror or ReadingView
- **StatusBar** (bottom) - Info: words, current line, saved
- **Modal System** - Overlays for settings, dialogs, etc

#### `Editor.tsx`
CodeMirror6 integration:
- Syntax highlighting for Markdown
- Wikilink autocompletion
- Search and replace
- Theme based on user preferences
- Global state synchronization

#### `ReadingView.tsx`
Processed Markdown rendering:
- Parse with markdown-it
- Code highlighting with highlight.js
- Mermaid diagram rendering
- Clickable wikilinks
- Note embed rendering

#### `FileExplorer.tsx`
Interactive file tree:
- Recursive folder exploration
- Create/rename/delete files
- Drag-and-drop
- Search filter
- Context menu

### Backend Modules

#### `vault.js` - Vault Manager

```javascript
// Main operations
readNote(path)           // Read note content
writeNote(path, content) // Save note
deleteNote(path)         // Delete note
listFiles(path)          // List folder files
createFolder(path)       // Create folder
getVaultStructure()      // Complete tree
```

#### `searchIndex.js` - Full-text Search

```javascript
// In-memory inverted index
{
  noteIndex: {
    "search": [
      { file: "notes/dev.md", score: 0.95 },
      { file: "notes/tips.md", score: 0.87 }
    ]
  },
  
  tagIndex: {
    "#python": ["notes/dev.md", "notes/tips.md"]
  }
}

// API
search(query)      // Content search
searchTags(tag)    // Notes with specific tag
rebuildIndex()     // Rebuild after changes
```

#### `sync.js` - Synchronization

```javascript
// Supports multiple providers
- GitHub (through API)
- Dropbox (through API)
- Google Drive (future)

// Operations
sync()             // Sync changes
getStatus()        // See sync status
setProvider(...)   // Configure provider
```

#### `sessions.js` - Session Management

```javascript
// Disk storage
data/sessions.json = {
  "session-token": {
    userId: 1,
    createdAt: timestamp,
    expiresAt: timestamp,
    ip: "192.168.1.1"
  }
}

// API
createSession()    // Create session after login
validateSession()  // Validate in each request
destroySession()   // Logout
cleanupExpired()   // Clean expired sessions (daily)
```

---

## 🔌 Backend API

**All routes hang from `/api`.** Except `setup` and `auth`, they require a valid session (otherwise return `401`). Non-`GET` requests pass CSRF protection (header `X-CSRF-Token`).

**`:filePath`** is the path relative to vault, encoded as a single URL segment.

### Endpoint Table

| Method | Route | Description |
| :---: | :--- | :--- |
| `GET` | `/api/setup/status` | Check if configured. Responds `{ configured }` |
| `POST` | `/api/setup/init` | **Initial setup** - `setupToken`, `vaultPath`, `password`, `port` |
| `POST` | `/api/auth/login` | Login (`password`). Set-Cookie: `session=...` |
| `POST` | `/api/auth/logout` | Close current session |
| `GET` | `/api/files/tree` | Vault tree (flat list of `{ type, path, name, size?, modified? }`) |
| `GET` | `/api/files/read/:filePath` | Note content and version (`{ content, version }`) |
| `GET` | `/api/files/raw/:filePath` | Binary file (images, attachments) |
| `GET` | `/api/files/export-pdf/:filePath` | Printable version (PDF) of note |
| `POST` | `/api/files/write/:filePath` | Save note (`{ content, baseVersion? }`). Returns `409` if version conflict |
| `POST` | `/api/files/upload?note=…&name=…` | Upload attachment (binary body); returns `{ path }` |
| `DELETE` | `/api/files/:filePath` | Move to `.trash/` |
| `GET` | `/api/files/trash` | Trash contents |
| `POST` | `/api/files/trash/restore` | Restore to original path (`{ id }`) |
| `POST` | `/api/files/trash/delete` | Delete permanently (`{ id }`) |
| `POST` | `/api/files/trash/empty` | Empty entire trash |
| `POST` | `/api/files/rename` | Rename or move (`{ oldPath, newPath }`), update links; returns `{ updated }` |
| `POST` | `/api/files/copy` | Duplicate note (`{ path }`) |
| `POST` | `/api/files/create-note` | Create empty note (`{ path, content? }`) |
| `POST` | `/api/files/create-folder` | Create folder (`{ path }`) |
| `GET` | `/api/search?q=…` | Full-text search or `tag:tag` |
| `GET` | `/api/search/tags` | All vault tags (`{ tag, paths }[]`) |
| `GET` `POST` | `/api/settings/vault` | Read / change vault path (`{ vaultPath, password }`) |
| `GET` | `/api/settings/limits` | Current server limits (read-only) |
| `POST` | `/api/settings/password` | Change password (`{ currentPassword, newPassword }`) |
| `POST` | `/api/settings/sessions/revoke` | Close all sessions except current |
| `GET` `POST` | `/api/settings/attachments` | Read / change `{ attachmentFolderPath }` |
| `GET` `POST` | `/api/settings/notes` | Read / change `{ dailyNotes, templates }` |
| `GET` | `/api/sync` | Sync config and status (`{ hasToken }`) |
| `POST` | `/api/sync/config` | Change config (`{ provider, interval, github }`) |
| `POST` | `/api/sync/run` | Sync now; returns status |
| `GET` | `/api/sync/history?path=` | Commits that touched the note |
| `GET` | `/api/sync/history/version?path=&commit=` | Content and diff in that commit |

---

## 🔐 Authentication System

### Authentication Flow

```
1️⃣  Setup (first time)
    POST /api/setup
    ├─ Create data/ directory
    ├─ Generate secret for cookies
    ├─ Hash password with scrypt
    └─ Save to data/.password

2️⃣  Login
    POST /api/login { password }
    ├─ Compare hash with scrypt
    ├─ If matches: create session
    ├─ Save to data/sessions.json
    ├─ Set cookie: session=<token> (httpOnly, Secure, SameSite)
    └─ Respond 200 OK

3️⃣  Authenticated requests
    GET /api/notes/tree
    ├─ Validate session cookie
    ├─ Look up in data/sessions.json
    ├─ Check expiration
    ├─ If valid: continue
    └─ If invalid: respond 401 Unauthorized

4️⃣  Logout
    POST /api/logout
    ├─ Remove session from data/sessions.json
    ├─ Clear cookie
    └─ Respond 200 OK
```

### Security

**Passwords:**
- Scrypt hash (salt rounds: 10)
- Never plain text
- Stored in `data/.password` with permissions 0600

**Sessions:**
- 32-byte random token (hex)
- Stored in JSON (could migrate to DB)
- Expiration: 7 days configurable
- Cookie httpOnly (not accessible from JS)
- Cookie Secure (HTTPS only in production)
- Cookie SameSite=Strict (CSRF protection)

**CSRF:**
- Token in each form
- Validation in middleware
- Headers: X-CSRF-Token

**File Permissions:**
- `data/` → 0700 (user only)
- Files in `data/` → 0600
- Vault → 0755 (user + group if needed)

---

## 🚀 Development Guide

### Local Installation

```bash
# Clone repository
git clone <repo>
cd Obsidian-Web

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env with your configuration
```

### Development Mode

```bash
# Run frontend (Vite) and backend (Node) in parallel
npm run dev

# Or separately:
npm run web:dev          # Frontend: http://localhost:5173
npm run server:dev       # Backend: http://localhost:3000
```

### Build for Production

```bash
# Compile frontend (Vite)
npm run web:build

# Start production server
npm start
```

---

## 📐 Conventions and Patterns

### Naming

**Files:**
- React Components: `PascalCase.tsx` (eg: `FileExplorer.tsx`)
- Functions/modules: `camelCase.js` (eg: `vault.js`)
- Custom hooks: `useXxx.ts` (eg: `useSearch.ts`)
- Constants: `UPPER_SNAKE_CASE` (eg: `MAX_NOTE_MB`)

**Variables:**
- `const` by default (immutability)
- `currentNote` for currently open file
- `tree` for file structure
- `content` for file content

### Error Handling

**Frontend:**
```typescript
try {
  const result = await filesApi.saveNote(path, content);
  showToast('Saved!', 'success');
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  showToast(message, 'error');
  console.error('Save failed:', error);
}
```

**Backend:**
```javascript
router.post('/notes/:path', requireAuth, async (req, res) => {
  try {
    const result = await vault.writeNote(decodePath(req.params.path), req.body.content);
    res.json({ success: true, saved: result.timestamp });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'File not found' });
    }
    console.error('Write error:', err);
    res.status(500).json({ error: 'Failed to save file' });
  }
});
```

---

**Last Updated:** October 2024

Questions? Open an issue or discuss in a PR. Happy coding! 🚀
