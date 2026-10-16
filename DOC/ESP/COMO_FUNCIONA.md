# 🏗️ Cómo funciona Obsidita

## Arquitectura general

Obsidita es una **aplicación cliente-servidor** que te permite acceder a tu vault de Obsidian desde cualquier navegador.

```
Navegador (React)  ←→  Servidor (Express/Node.js)  ←→  Carpeta del vault
```

## El flujo

### 1️⃣ Frontend (React + Vite)
- **Ubicación**: carpeta `web/`
- **Tecnología**: React 18 con TypeScript, compilado con Vite
- Se carga una sola vez en el navegador y luego es una **SPA** (Single Page Application)
- Maneja la interfaz, el editor (CodeMirror), y la visualización de notas
- Se comunica con el servidor a través de **API REST**

### 2️⃣ Backend (Express/Node.js)
- **Ubicación**: carpeta `server/`
- **Archivo principal**: `server/index.js`
- Gestiona:
  - **Autenticación**: login, sesiones, contraseña con scrypt
  - **Lectura/escritura de archivos**: `.md`, imágenes, metadatos
  - **Búsqueda**: indexado de contenido
  - **Sincronización con GitHub**: commits y pulls automáticos
  - **Seguridad**: límite de intentos, CSRF, CSP, protección del `.obsidian/`

### 3️⃣ El vault
- Simplemente una **carpeta normal** del servidor con archivos `.md`
- El servidor **lee y escribe directamente** en estos archivos
- Sin base de datos, sin formato propietario
- Compatible 100% con Obsidian de escritorio

## Flujo de una edición

1. **Escribes en el editor** de la web
2. **React actualiza el estado** en el navegador (local, instantáneo)
3. **Se envía un `PATCH`** al servidor (automático cada pocos segundos)
4. **Express recibe la solicitud**, verifica la sesión y reescribe el `.md`
5. Si **otra pestaña/dispositivo** edita la misma nota, se detecta y se recarga

## Cómo comenzar a desarrollar

```bash
npm install          # Instala dependencias (también compila el frontend)
npm run dev          # Inicia el servidor y Vite en paralelo
                     # Servidor: http://localhost:3000
                     # Vite: http://localhost:5173 (solo para dev hot-reload)
```

## Estructura de carpetas

```
Obsidian-Web/
├── server/                      # Backend Express
│   ├── index.js                # Punto de entrada
│   ├── vault.js                # Lectura/escritura de archivos
│   ├── searchIndex.js          # Índice de búsqueda
│   ├── sessions.js             # Gestión de sesiones
│   ├── sync.js                 # Sincronización GitHub
│   └── ...
├── web/                         # Frontend React
│   ├── vite.config.ts          # Configuración de Vite
│   ├── src/
│   │   ├── App.tsx             # Componente raíz
│   │   ├── components/         # Componentes React
│   │   ├── hooks/              # Hooks personalizados
│   │   ├── api.ts              # Cliente HTTP (fetch)
│   │   └── ...
│   └── dist/                   # Frontend compilado (generado por Vite)
├── data/                        # Datos persistentes del servidor
│   ├── config.json             # Configuración (vault, puerto, etc.)
│   ├── sync.json               # Token de GitHub (secreto)
│   └── sessions/               # Sesiones activas
└── package.json                # Dependencias y scripts

```

## APIs principales

### Autenticación
- `POST /api/setup` → Configuración inicial (solo la primera vez)
- `POST /api/login` → Iniciar sesión
- `GET /api/logout` → Cerrar sesión

### Notas
- `GET /api/note?path=...` → Obtener una nota (MD + metadata)
- `PATCH /api/note` → Actualizar una nota
- `POST /api/note` → Crear una nota nueva
- `DELETE /api/note?path=...` → Eliminar a papelera

### Explorador
- `GET /api/tree` → Árbol de carpetas y archivos
- `POST /api/move` → Mover/renombrar
- `POST /api/upload` → Subir archivos

### Búsqueda
- `GET /api/search?q=...` → Buscar en todo el vault

### Sincronización
- `POST /api/sync` → Hacer commit y push a GitHub
- `GET /api/sync/status` → Estado de la última sincronización

## Cosas importantes

| Concepto | Ubicación | Nota |
|----------|-----------|------|
| **Estado global** | `web/src/hooks/` (Zustand) | Qué nota está abierta, qué pestaña, modo oscuro, etc. |
| **Validación** | Backend (Express) | El frontend confía en el servidor. El servidor valida todo. |
| **Autoguardado** | `web/src/components/Editor.tsx` | Espera 2 seg de inactividad, luego envía `PATCH` |
| **Wikilinks** | `web/src/components/NoteView.tsx` | Se parsean en el cliente, **los enlaces se crean al hacer clic** |
| **Seguridad del vault** | `server/security.js` | No se permiten `../`, rutas del sistema, `.obsidian/`, etc. |

## Para cambios típicos

- **Añadir una opción en Preferencias**: `web/src/components/Settings.tsx` + endpoint en `server/`
- **Cambiar la interfaz**: `web/src/components/`
- **Nueva funcionalidad del servidor**: archivo nuevo en `server/` + ruta en `server/index.js`
- **Recompilar frontend**: `npm run web:build` (automático en `postinstall`)

---

📖 **Para más detalle**, consulta [DESARROLLO.md](../utils/DESARROLLO.md) y [ARQUITECTURA.md](../utils/ARQUITECTURA.md).
