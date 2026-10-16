# 🏗️ Arquitectura de Obsidita

## 📋 Tabla de contenidos

- [Visión general](#visión-general)
- [Stack tecnológico](#stack-tecnológico)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Arquitectura de capas](#arquitectura-de-capas)
- [Flujo de datos](#flujo-de-datos)
- [Componentes principales](#componentes-principales)
- [API Backend](#api-backend)
- [Sistema de autenticación](#sistema-de-autenticación)
- [Guía de desarrollo](#guía-de-desarrollo)
- [Convenciones y patrones](#convenciones-y-patrones)

---

## 🎯 Visión general

**Obsidita** es una aplicación web completa que permite visualizar, editar y sincronizar bóvedas de [Obsidian](https://obsidian.md/) a través del navegador. Combina un frontend moderno basado en React con un backend robusto en Node.js/Express.

```
┌─────────────────────────────────────────────────────┐
│              🌐 Navegador Web                        │
├─────────────────────────────────────────────────────┤
│  React App (Vite) - TypeScript - Zustand State      │
│  - Editor (CodeMirror)                              │
│  - Visor de Markdown                                │
│  - Explorador de archivos                           │
│  - Panel de búsqueda                                │
│  - Sistema de tareas                                │
└────────────────┬────────────────────────────────────┘
                 │ API REST + WebSockets
                 │ (JSON, cookies de sesión)
                 ▼
┌─────────────────────────────────────────────────────┐
│         📦 Backend Node.js/Express                  │
├─────────────────────────────────────────────────────┤
│  - Rutas de autenticación                           │
│  - Gestión de archivos y bóveda                     │
│  - Sistema de búsqueda                              │
│  - Sincronización (GitHub/Dropbox)                  │
│  - Sesiones y seguridad                             │
│  - Gestión de fuentes tipográficas                  │
└────────────────┬────────────────────────────────────┘
                 │ Lectura/Escritura
                 │ de archivos
                 ▼
┌─────────────────────────────────────────────────────┐
│      💾 Sistema de archivos / Bóveda Obsidian      │
│  ├── /notes        (archivos .md)                   │
│  ├── /.obsidian    (configuración)                  │
│  └── /attachments  (imágenes y archivos)            │
└─────────────────────────────────────────────────────┘
```

---

## 🛠️ Stack tecnológico

### Frontend
| Tecnología | Propósito | Versión |
|-----------|----------|---------|
| **React** | Librería de UI | 18.2.0 |
| **TypeScript** | Tipado estático | 5.0.0 |
| **Vite** | Bundler y dev server | 6.4.4 |
| **Zustand** | Gestión de estado global | 4.4.0 |
| **CodeMirror** | Editor de código/markdown | 6.x |
| **markdown-it** | Parser de Markdown | 15.0.2 |
| **Mermaid** | Diagramas en Markdown | 11.17.2 |

### Backend
| Tecnología | Propósito |
|-----------|----------|
| **Node.js** | Runtime (>=20.0.0) |
| **Express** | Framework web |
| **cookie-parser** | Gestión de cookies |
| **archiver** | Compresión de archivos |
| **highlight.js** | Resaltado de sintaxis |

### Herramientas de desarrollo
- **concurrently** - Ejecutar dev server frontend y backend simultaneamente
- **@types/react** - Definiciones de tipos para React
- **ESM modules** - Módulos ES6 nativos

---

## 📁 Estructura del proyecto

```
Obsidian-Web/
├── 📄 package.json           # Dependencias y scripts
├── 📄 ARQUITECTURA.md        # Este archivo
│
├── 🌐 web/                   # Frontend (React + Vite + TypeScript)
│   ├── src/
│   │   ├── components/       # Componentes React reutilizables
│   │   │   ├── App.tsx       # Punto de entrada
│   │   │   ├── MainLayout.tsx# Layout principal (editor, sidebar, etc)
│   │   │   ├── Editor.tsx    # Editor con CodeMirror
│   │   │   ├── ReadingView.tsx# Visor de markdown renderizado
│   │   │   ├── FileExplorer.tsx# Árbol de archivos
│   │   │   ├── SearchPanel.tsx# Búsqueda full-text
│   │   │   ├── SettingsModal.tsx# Configuración de usuario
│   │   │   ├── Setup.tsx     # Wizard de setup inicial
│   │   │   ├── Login.tsx     # Pantalla de autenticación
│   │   │   └── [otros]       # TagsPanel, NoteMenu, ImageViewer, etc
│   │   │
│   │   ├── store.ts          # Estado global (Zustand)
│   │   ├── api.ts            # Cliente HTTP para comunicación backend
│   │   ├── main.tsx          # Punto de entrada de la app
│   │   │
│   │   ├── i18n/             # Internacionalización
│   │   │   ├── index.tsx     # Contexto y hooks de i18n
│   │   │   ├── en.ts         # Traducciones inglés
│   │   │   └── es.ts         # Traducciones español
│   │   │
│   │   ├── utils/            # Funciones auxiliares
│   │   │   ├── wikilinks.ts  # Procesamiento de [[wikilinks]]
│   │   │   ├── frontmatter.ts# Parse de YAML frontmatter
│   │   │   ├── attachments.ts# Manejo de archivos adjuntos
│   │   │   ├── imageUpload.ts# Upload de imágenes
│   │   │   ├── mermaidDiagrams.ts# Rendering de diagramas
│   │   │   ├── livePreview.ts# Actualización en vivo del preview
│   │   │   ├── codeHighlight.ts# Resaltado de código
│   │   │   ├── mobile.ts     # Detección y soporte móvil
│   │   │   └── [otros]       # fonts, toast, templates, etc
│   │   │
│   │   └── styles/           # CSS global y temas
│   │
│   ├── public/               # Assets estáticos
│   ├── dist/                 # Build output (generado)
│   ├── vite.config.ts        # Configuración de Vite
│   ├── tsconfig.json         # Configuración de TypeScript
│   └── package.json
│
├── 🔧 server/                # Backend (Node.js + Express)
│   ├── index.js              # Punto de entrada, configuración de Express
│   │
│   ├── core/                 # Lógica core
│   │   ├── vault.js          # Gestión de la bóveda (lectura/escritura)
│   │   ├── sync.js           # Motor de sincronización (GitHub, Dropbox)
│   │   ├── sessions.js       # Almacenamiento de sesiones
│   │   ├── searchIndex.js    # Índice de búsqueda full-text
│   │   └── links.js          # Análisis y cálculo de relaciones
│   │
│   ├── routes/               # Endpoints de la API
│   │   ├── auth.js           # POST /login, /logout, /change-password
│   │   ├── files.js          # GET/POST /notes, /attachments, /tree
│   │   ├── search.js         # GET /search?q=
│   │   ├── settings.js       # GET/POST /settings, /fonts
│   │   ├── sync.js           # POST /sync, /sync-status
│   │   ├── setup.js          # GET /setup, POST /setup
│   │   └── fonts.js          # GET /fonts/:name
│   │
│   ├── middleware/           # Middlewares de Express
│   │   ├── security.js       # CSRF, headers de seguridad, límites
│   │   ├── password.js       # Protección de endpoints sensibles
│   │   └── env.js            # Variables de entorno
│   │
│   ├── utils/                # Funciones auxiliares
│   │   ├── limits.js         # Límites de tamaño
│   │   ├── updates.js        # Gestión de actualizaciones
│   │   └── lazy.js           # Lazy loading de módulos
│   │
│   └── .env                  # Variables de entorno (no versionado)
│
├── 💾 data/                  # Almacenamiento local (no versionado)
│   ├── .secret               # Secret para firmar cookies
│   ├── .password             # Hash de la contraseña
│   ├── sessions.json         # Sesiones activas
│   ├── config.json           # Configuración guardada
│   ├── ai.json               # Configuración de IA
│   └── [vault]               # Bóveda de Obsidian
│       ├── notes/            # Archivos .md
│       ├── .obsidian/        # Configuración de Obsidian
│       └── attachments/      # Imágenes y otros archivos
│
└── 📚 utils/                 # Scripts y documentación
    ├── ESP/                  # Documentación en español
    │   ├── ERRORES_Y_SOLUCIONES.md
    │   └── [otras guías]
    └── [scripts útiles]
```

---

## 🏛️ Arquitectura de capas

### Capa de Presentación (Frontend)

**Responsabilidades:**
- Renderizar UI React
- Gestionar estado del usuario
- Capturar entrada del usuario
- Comunicarse con el backend

**Componentes clave:**
- `App.tsx` - Manejo del ciclo de vida (Setup → Login → Main)
- `MainLayout.tsx` - Layout principal con editor, sidebar, comandos
- `Editor.tsx` - Integración con CodeMirror
- `ReadingView.tsx` - Rendering de markdown procesado

**Estado global (Zustand):**
```typescript
// store.ts
{
  // Estructura de carpetas/archivos
  tree: FileNode[],
  
  // Archivo abierto
  currentNote: Note,
  content: string,
  
  // Interfaz
  sidebarCollapsed: boolean,
  theme: 'light' | 'dark',
  
  // Búsqueda
  searchResults: Note[],
}
```

---

### Capa de Lógica de Negocios (Backend)

**Responsabilidades:**
- Validar y autorizar requests
- Ejecutar operaciones sobre la bóveda
- Mantener la sincronización
- Gestionar la búsqueda

**Flujo típico de una request:**

```
1. Cliente hace request a POST /api/notes/save
                    ↓
2. Middleware de seguridad (CSRF, headers)
                    ↓
3. Autenticación (verificar cookie de sesión)
                    ↓
4. Autorización (usuario autenticado)
                    ↓
5. Validación de datos (máximo tamaño, etc)
                    ↓
6. Operación en vault (lectura/escritura de archivos)
                    ↓
7. Actualizar índice de búsqueda
                    ↓
8. Responder al cliente
```

---

### Capa de Datos (Almacenamiento)

**Sistema de archivos:**
```
data/
├── [vault-name]/
│   ├── notes/          # Archivos markdown (.md)
│   ├── attachments/    # Imágenes, PDFs, etc
│   └── .obsidian/      # Config de Obsidian
├── config.json         # Configuración (vault path, etc)
├── sessions.json       # Sesiones activas
├── ai.json            # Configuración de IA
├── .password          # Hash bcrypt de la contraseña
└── .secret            # Secret para firmar cookies
```

---

## 🔄 Flujo de datos

### Ciclo de edición: Usuario edita un archivo

```
┌──────────────────────────────────────────────────────────────┐
│ 1️⃣  Usuario escribe en CodeMirror                            │
└──────────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│ 2️⃣  Evento onChange dispara debounce (500ms)                 │
└──────────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│ 3️⃣  Guardar en store local (Zustand)                         │
│     - Mostrar indicador "Sin guardar"                        │
│     - Actualizar preview en vivo                             │
└──────────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│ 4️⃣  POST /api/notes/:path con content                        │
│     Header: { 'X-CSRF-Token': ... }                          │
│     Body: { content: string }                                │
└──────────────────────────────────────────────────────────────┘
                           ↓
         ┌─────────────────┴─────────────────┐
         ▼                                   ▼
    ✅ Éxito                           ❌ Error
    - Status 200                       - Toast de error
    - Guardar en archivo               - Reintentar
    - Actualizar índice                - Mostrar conflicto
    - Responder al cliente
         │                                   │
         └─────────────────┬─────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ 5️⃣  Cliente actualiza estado                                 │
│     - Limpiar indicador "Sin guardar"                        │
│     - Mostrar última hora de guardado                        │
└──────────────────────────────────────────────────────────────┘
```

### Ciclo de sincronización automática

```
Cada 5 minutos (configurable):

┌──────────────────────────────────────────────────────────────┐
│ SyncManager verifica si hay cambios en GitHub/Dropbox        │
└──────────────────────────────────────────────────────────────┘
                           ↓
    ┌──────────────────────┴──────────────────────┐
    ▼                                             ▼
Cambios remotos                           Sin cambios remotos
    │                                             │
    ├─ Descargar archivos                        └─ Esperar
    ├─ Mergear cambios
    ├─ Actualizar índice
    └─ Notificar al cliente
```

---

## 🧩 Componentes principales

### Frontend Components

#### `MainLayout.tsx`
Layout principal que contiene:
- **Ribbon** (izquierda) - Botones de comandos rápidos
- **FileExplorer** (izquierda-centro) - Árbol de archivos
- **Editor** (centro) - CodeMirror o ReadingView
- **StatusBar** (abajo) - Información: palabras, línea actual, guardado
- **Modal System** - Overlays para settings, diálogos, etc

```
┌───────────────────────────────────────────────────┐
│ TopBar (título, comandos globales)               │
├────────┬──────────────────────────┬──────────────┤
│ Ribbon │  FileExplorer            │              │
│        │  ┌──────────────────┐    │              │
│ [🔍]   │  │ 📁 folder        │    │              │
│ [📝]   │  │ ├─ 📄 file1.md   │    │  Editor      │
│ [⚙️]   │  │ ├─ 📄 file2.md   │    │  (CM or RV)  │
│ [📊]   │  │ └─ 📁 subfolder  │    │              │
│        │  └──────────────────┘    │              │
├────────┴──────────────────────────┴──────────────┤
│ StatusBar: "10 words | Line 5:12 | Saved"       │
└───────────────────────────────────────────────────┘
```

#### `Editor.tsx`
Integración con CodeMirror6:
- Syntax highlighting para Markdown
- Autocompletado de wikilinks
- Búsqueda y reemplazo
- Tema basado en preferencias del usuario
- Sincronización con estado global

#### `ReadingView.tsx`
Rendering de Markdown procesado:
- Parse con markdown-it
- Resaltado de código con highlight.js
- Rendering de diagramas Mermaid
- Manejo de wikilinks clicables
- Renderizado de embeds de notas

#### `FileExplorer.tsx`
Árbol de archivos interactivo:
- Exploración recursiva de carpetas
- Crear/renombrar/eliminar archivos
- Drag-and-drop
- Search filter
- Menú contextual

### Backend Modules

#### `vault.js` - Gestor de la bóveda

```javascript
// Operaciones principales
readNote(path)           // Leer contenido de nota
writeNote(path, content) // Guardar nota
deleteNote(path)         // Eliminar nota
listFiles(path)          // Listar archivos en carpeta
createFolder(path)       // Crear carpeta
getVaultStructure()      // Árbol completo
```

#### `searchIndex.js` - Búsqueda full-text

```javascript
// Índice invertido en memoria
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
search(query)      // Búsqueda por contenido
searchTags(tag)    // Notas con un tag específico
rebuildIndex()     // Reconstruir después de cambios
```

#### `sync.js` - Sincronización

```javascript
// Soporta múltiples proveedores
- GitHub (a través de API)
- Dropbox (a través de API)
- Google Drive (futuro)

// Operaciones
sync()             // Sincronizar cambios
getStatus()        // Ver estado de sincronización
setProvider(...)   // Configurar proveedor
```

#### `sessions.js` - Gestión de sesiones

```javascript
// Almacenamiento en disco
data/sessions.json = {
  "session-token": {
    userId: 1,
    createdAt: timestamp,
    expiresAt: timestamp,
    ip: "192.168.1.1"
  }
}

// API
createSession()    // Crear sesión tras login
validateSession()  // Validar en cada request
destroySession()   // Logout
cleanupExpired()   // Limpiar sesiones expiradas (diario)
```

---

## 🔌 API Backend

### Autenticación

#### `POST /api/setup`
Configuración inicial del servidor
```
Body: {
  password: string,
  vaultPath: string,
  siteTitle: string
}
Response: { success: true }
```

#### `POST /api/login`
Login del usuario
```
Body: { password: string }
Response: { success: true }
Header: Set-Cookie: session=...
```

#### `POST /api/logout`
Cierre de sesión
```
Response: { success: true }
```

#### `POST /api/change-password`
Cambiar contraseña
```
Body: {
  currentPassword: string,
  newPassword: string
}
Response: { success: true }
```

---

### Gestión de archivos

#### `GET /api/notes/tree`
Obtener estructura completa de archivos
```
Response: {
  name: "root",
  type: "folder",
  children: [
    {
      name: "notes",
      type: "folder",
      children: [
        {
          name: "Welcome.md",
          type: "file",
          size: 2048,
          modified: timestamp
        }
      ]
    }
  ]
}
```

#### `GET /api/notes/:path`
Obtener contenido de una nota
```
Query params:
  - path: "notes/file.md" (URL encoded)

Response: {
  content: string,
  frontmatter: { title, tags, ... },
  links: ["[[other-note]]", ...],
  backlinks: ["notes/referencing-this.md", ...]
}
```

#### `POST /api/notes/:path`
Guardar nota
```
Body: { content: string }
Response: { success: true, saved: timestamp }
```

#### `POST /api/notes/:path/delete`
Eliminar nota
```
Response: { success: true }
```

#### `POST /api/attachments/upload`
Subir archivo adjunto
```
Form: multipart/form-data
  - file: File
  - path: "path/to/store"

Response: {
  success: true,
  url: "attachments/image-2024-01-15.png"
}
```

---

### Búsqueda

#### `GET /api/search?q=query`
Búsqueda full-text
```
Response: {
  results: [
    {
      file: "notes/dev.md",
      title: "Development Notes",
      excerpt: "...relevant content...",
      score: 0.95
    }
  ],
  total: 5
}
```

---

### Configuración

#### `GET /api/settings`
Obtener configuración del usuario
```
Response: {
  theme: "dark",
  font: "IBM Plex Sans",
  fontSize: 14,
  autoSync: true,
  syncInterval: 300000
}
```

#### `POST /api/settings`
Guardar configuración
```
Body: {
  theme: "light" | "dark",
  font: string,
  fontSize: number
}
Response: { success: true }
```

#### `GET /api/settings/check`
Verificar estado de setup
```
Response: {
  configured: boolean,
  siteTitle: string,
  syncStatus: "idle" | "syncing" | "error"
}
```

---

### Sincronización

#### `POST /api/sync`
Forzar sincronización inmediata
```
Response: {
  success: true,
  changed: 5,
  deleted: 2,
  timestamp: timestamp
}
```

#### `GET /api/sync/status`
Ver estado de sincronización
```
Response: {
  status: "idle" | "syncing" | "error",
  lastSync: timestamp,
  provider: "github" | "dropbox" | "none",
  nextSync: timestamp
}
```

---

## 🔐 Sistema de autenticación

### Flujo de autenticación

```
1️⃣  Setup (primera vez)
    POST /api/setup
    ├─ Crear directorio data/
    ├─ Generar secret para cookies
    ├─ Hash de contraseña con bcrypt
    └─ Guardar en data/.password

2️⃣  Login
    POST /api/login { password }
    ├─ Comparar hash con bcrypt
    ├─ Si coincide: crear sesión
    ├─ Guardar en data/sessions.json
    ├─ Set cookie: session=<token> (httpOnly, Secure, SameSite)
    └─ Responder 200 OK

3️⃣  Requests autenticados
    GET /api/notes/tree
    ├─ Validar cookie de sesión
    ├─ Buscar en data/sessions.json
    ├─ Verificar expiración
    ├─ Si válida: continuar
    └─ Si inválida: responder 401 Unauthorized

4️⃣  Logout
    POST /api/logout
    ├─ Eliminar sesión de data/sessions.json
    ├─ Clear cookie
    └─ Responder 200 OK
```

### Seguridad

**Contraseñas:**
- Hash bcrypt (salt rounds: 10)
- Nunca en plain text
- Almacenadas en `data/.password` con permisos 0600

**Sesiones:**
- Token aleatorio de 32 bytes (hex)
- Almacenadas en JSON (podrían migrarse a BD)
- Expiración: 7 días configurable
- Cookie httpOnly (no accesible desde JS)
- Cookie Secure (solo HTTPS en producción)
- Cookie SameSite=Strict (CSRF protection)

**CSRF:**
- Token en cada formulario
- Validación en middleware
- Headers: X-CSRF-Token

**Permisos de archivos:**
- `data/` → 0700 (solo user)
- Archivos en `data/` → 0600
- Vault → 0755 (user + grupo si es necesario)

---

## 🚀 Guía de desarrollo

### Instalación local

```bash
# Clonar repositorio
git clone <repo>
cd Obsidian-Web

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tu configuración
```

### Modo desarrollo

```bash
# Ejecutar frontend (Vite) y backend (Node) en paralelo
npm run dev

# O por separado:
npm run web:dev          # Frontend: http://localhost:5173
npm run server:dev       # Backend: http://localhost:3000
```

### Build para producción

```bash
# Compilar frontend (Vite)
npm run web:build

# Iniciar servidor de producción
npm start
```

### Estructura de una request típica

#### Agregar un nuevo endpoint GET `/api/notes/related`

**Backend:**

```javascript
// server/routes/files.js
router.get('/related', requireAuth, async (req, res) => {
  try {
    const noteLinks = await vault.getRelatedNotes(req.query.path);
    res.json(noteLinks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

**Frontend:**

```typescript
// web/src/api.ts
export const filesApi = {
  async getRelatedNotes(path: string) {
    const res = await fetch(`/api/notes/related?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error('Failed to fetch related notes');
    return res.json();
  }
};

// web/src/components/SidePanel.tsx
import { filesApi } from '../api';
const related = await filesApi.getRelatedNotes(currentNote.path);
```

---

### Testing (cuando lo haya)

```bash
# Tests unitarios
npm run test

# Tests e2e
npm run test:e2e

# Coverage
npm run test:coverage
```

---

## 📐 Convenciones y patrones

### Naming

**Archivos:**
- Componentes React: `PascalCase.tsx` (ej: `FileExplorer.tsx`)
- Funciones/módulos: `camelCase.js` (ej: `vault.js`)
- Hooks personalizados: `useXxx.ts` (ej: `useSearch.ts`)
- Constantes: `UPPER_SNAKE_CASE` (ej: `MAX_NOTE_MB`)

**Variables:**
- `const` por defecto (inmutabilidad)
- `currentNote` para el archivo abierto actualmente
- `tree` para la estructura de archivos
- `content` para el contenido de un archivo

**Funciones async:**
```typescript
// ✅ Bueno
async function fetchUserData(id) {
  try {
    const response = await api.getUser(id);
    return response.data;
  } catch (error) {
    logError(error);
    throw error;
  }
}

// ❌ Evitar
function fetchUserData(id) {
  return api.getUser(id).then(...).catch(...);
}
```

### Manejo de errores

**Frontend:**
```typescript
try {
  const result = await filesApi.saveNote(path, content);
  showToast('Guardado!', 'success');
} catch (error) {
  const message = error instanceof Error ? error.message : 'Error desconocido';
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

### Estado global (Zustand)

```typescript
// store.ts
export const useStore = create<AppState>((set, get) => ({
  // State
  currentNote: null,
  content: '',
  
  // Acciones
  setCurrentNote: (note) => set({ currentNote: note }),
  setContent: (content) => set({ content }),
  
  // Derived state (getters)
  isDirty: () => get().content !== get().currentNote?.content,
}));

// Usage en componentes
const { currentNote, content, setContent } = useStore();
```

### Componentes React

```typescript
// ✅ Functional components con hooks
export default function Editor() {
  const [isEditing, setIsEditing] = useState(false);
  const { content, setContent } = useStore();
  
  return (
    <div className="editor">
      {isEditing ? (
        <textarea value={content} onChange={(e) => setContent(e.target.value)} />
      ) : (
        <pre>{content}</pre>
      )}
    </div>
  );
}

// ❌ Evitar: class components (legacy)
class Editor extends React.Component { ... }
```

### Async operations

**Debounce para guardar:**
```typescript
const debouncedSave = debounce(async (path: string, content: string) => {
  try {
    await filesApi.saveNote(path, content);
    setLastSaved(new Date());
  } catch (error) {
    showToast('Error al guardar', 'error');
  }
}, 500);

// En onChange del editor
const handleChange = (newContent: string) => {
  setContent(newContent);
  debouncedSave(currentNote.path, newContent);
};
```

---

## 📖 Recursos para desarrolladores

### Documentación importante

- [Obsidian API](https://docs.obsidian.md/) - Format y estructura de bóvedas
- [CodeMirror 6 Docs](https://codemirror.net/) - Editor
- [Zustand](https://github.com/pmndrs/zustand) - State management
- [Express.js Guide](https://expressjs.com/guide) - Framework backend
- [Markdown-it](https://markdown-it.github.io/) - Parser de markdown

### Debugging

**Frontend:**
```bash
# Abrir DevTools en navegador (F12)
# Ver Network tab para requests
# Ver Console para errores

# Logs desde código
console.log({ store: useStore.getState() });
```

**Backend:**
```bash
# Logs en servidor
npm run server:dev  # Muestra logs en terminal

# Debug con inspector
node --inspect server/index.js
# Abrir: chrome://inspect

# Logs detallados
DEBUG=* npm run server:dev
```

### Monitoreo en producción

**Recomendaciones:**
- Usar `pm2` o `systemd` para gestionar el proceso
- Configurar logs rotatorios
- Monitorear uso de memoria y CPU
- Alertas en caso de crashes

```bash
# Usar PM2
npm install -g pm2
pm2 start server/index.js --name "obsidita"
pm2 logs obsidita
pm2 monit  # Monitor en tiempo real
```

---

## 🤝 Contribuciones

Para contribuir:

1. **Fork** el repositorio
2. **Crea** una rama: `git checkout -b feature/tu-feature`
3. **Haz commits** significativos: `git commit -m "feat: agregar..."` 
4. **Abre PR** describiendo los cambios
5. **Espera review** de los maintainers

### Estructura de commits

```
feat: agregar búsqueda full-text
↑
├─ type: feat (feature), fix, docs, style, refactor, test, chore
├─ scope: area afectada (opcional)
└─ subject: cambio en presente, sin punto final

Body (opcional): explicación de por qué y cómo
Footer (opcional): referencias a issues #123
```

### Code Review Checklist

- ✅ El código sigue las convenciones del proyecto
- ✅ No hay console.logs de debug
- ✅ Los types están correctos (TypeScript)
- ✅ Las funciones tienen errores bien manejados
- ✅ Tests pasan (si existen)
- ✅ No hay secrets en el código

---

## 🐛 Troubleshooting

### Errores comunes

**"Module not found" en frontend**
```bash
# Asegurar que está en web/src/
# e importado correctamente con ruta relativa
import { Component } from '../components/Component';
```

**Puerto 3000 ya en uso**
```bash
# Cambiar puerto
PORT=3001 npm run server:dev

# O encontrar qué está usando el puerto
lsof -i :3000
```

**Changes no se guardan**
```bash
# Verificar permisos de la carpeta data/
chmod 700 data/
chmod 600 data/*

# Verificar que data/ no está en .gitignore (debería estarlo)
```

**Sesión se pierde al recargar**
```bash
# Verificar que las cookies se guardan
# DevTools > Application > Cookies > http://localhost:3000
# Debe haber: "session" con httpOnly

# Para HTTPS local, configurar en .env:
SECURE_COOKIES=false  # Solo desarrollo
```

---

## 📝 Próximas mejoras

- [ ] Migrar sesiones a una base de datos (SQLite, PostgreSQL)
- [ ] Agregar soporte para múltiples usuarios
- [ ] Implementar WebSockets para colaboración en tiempo real
- [ ] Sistema de plugins/extensiones
- [ ] Mobile app nativa (React Native)
- [ ] Sincronización con más proveedores (Google Drive, OneDrive)
- [ ] Full-text search mejorado (ElasticSearch)

---

**Última actualización:** Octubre 2024

¿Preguntas? Abre un issue o discute en el PR. ¡Happy coding! 🚀
