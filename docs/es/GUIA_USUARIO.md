# 📖 Guía de uso - Obsidita

Bienvenido a **Obsidita**, tu vault de Obsidian en el navegador. Esta guía te muestra lo básico para empezar.

---

## 🚪 Acceso y contraseña

1. **Abre la web** en tu navegador (tu administrador te dará la dirección)
2. **Introduce tu contraseña** y haz clic en *Entrar*
3. ✅ Ya estás dentro. Tu sesión durará **30 días** (o 7 días sin usar la web)

> **💡 Tip**: Si usas muchos dispositivos, abre la sesión en cada uno. Puedes cerrar todas las sesiones desde ⚙️ → Seguridad.

---

## 📝 Crear y editar notas.

### Crear una nota nueva

Hay 3 formas:

1. **Explorador** (panel izquierdo) → haz clic derecho en una carpeta → *Nueva nota*
2. **Buscador rápido** → `Ctrl+P` (o `Cmd+P` en Mac) → escribe el nombre → *Crear*
3. **Menú** (≡) → *Nueva nota*

### Editar una nota

- **Haz clic en una nota** del explorador para abrirla
- **Pon el cursor** en el texto para entrar en modo edición
- **Escribe** como en cualquier editor
- ✅ Se guarda **automáticamente** cada pocos segundos (sin que hagas nada)
- `Ctrl+S` para guardar ahora

### Cambiar entre leer y editar

- **Vista previa** (lectura): ves el Markdown renderizado, pero no puedes editar
- **Edición**: ves el código Markdown y puedes cambiar el texto
- `Ctrl+E` para cambiar entre los dos modos

---

## 🎨 Formato de texto (sin complicaciones)

Mientras editas, usa estos atajos:

| Quiero hacer | Atajo | O escribe |
|---|---|---|
| **Negrita** | `Ctrl+B` | `**texto**` |
| *Cursiva* | `Ctrl+I` | `*texto*` |
| `Código inline` | `Ctrl+'` | `` `código` `` |
| Bloque de código | — | ````triple backtick```` |
| # Encabezado | — | `# Texto` |
| > Cita | — | `> Texto` |
| - Lista | — | `- Texto` |
| 1. Numerada | — | `1. Texto` |

> **Tip**: Si hay barra de herramientas arriba del editor, haz clic en los botones para insertar formato.

---

## 🔗 Wikilinks (conecta tus notas)

Los **wikilinks** son cómo conectas unas notas con otras.

```
[[Otra nota]]              → Enlace a "Otra nota"
[[Otra nota|con este nombre]]  → El enlace dice "con este nombre"
[[Otra nota#Sección]]     → Enlace a una sección específica
```

**Cómo usarlos:**
1. Escribe `[[` mientras editas
2. Se abre una lista de notas → elige una o escribe el nombre
3. Haz clic en el enlace para ir a esa nota
4. Si la nota **no existe**, aparece atenuada; haz clic para crearla

---

## 🔍 Buscar notas

### Búsqueda rápida (por nombre)

- `Ctrl+P` → empieza a escribir → `Enter` para abrir

### Búsqueda global (en todo el contenido)

- `Ctrl+Shift+F` → escribe lo que buscas
- Ves dónde aparece en cada nota
- Haz clic en un resultado para ir allá

### Buscar dentro de una nota

- `Ctrl+F` mientras lees/editas → escribe → `Enter` siguiente, `Shift+Enter` anterior

### Buscar por etiqueta

- En la búsqueda global, escribe `tag:proyecto` para ver todas las notas con esa etiqueta

---

## 📁 Explorador (panel izquierdo)

El **explorador** te muestra la estructura de carpetas.

### Acciones principales

| Acción | Cómo |
|--------|------|
| **Expandir/contraer carpeta** | Haz clic en la flechita ▶ |
| **Abrir nota en pestaña nueva** | `Ctrl+clic` (o `Cmd+clic`) |
| **Menú contextual** | Haz clic derecho → opciones |
| **Mover/renombrar** | Clic derecho → *Renombrar* o *Mover* (los enlaces se actualizan solos) |
| **Eliminar** | Clic derecho → *Eliminar* (va a la papelera, puedes recuperarla) |
| **Ocultar el explorador** | `Ctrl+B` |

---

## 📎 Adjuntos e imágenes

### Pegar una imagen

- Simplemente **pega** con `Ctrl+V` (o `Cmd+V`) mientras editas
- Se guarda en la carpeta de adjuntos automáticamente

### Subir archivo

- **Arrastra** un archivo desde tu ordenador al explorador (panel izquierdo)
- También puedes arrastrar carpetas enteras (se respeta la estructura)

### Insertar imagen en una nota

- Desde el editor → menú (≡) → *Insertar imagen* → elige archivo
- O escribe directamente: `![](ruta/imagen.png)`

---

## ✨ Editar con IA

Si está configurada (**⚙️ → IA**), puedes pedir a una IA que edite la nota o el texto seleccionado:

1. Pulsa `Ctrl+K`, el botón **✨** de la barra del editor o **Editar con IA** en el menú de la nota.
2. Escribe qué quieres («corrige la ortografía», «resume en viñetas»...) y pulsa `Intro`, o usa una acción rápida.
3. El cambio se aplica directamente. Si no te gusta, `Ctrl+Z` o el botón **Deshacer** lo revierten.

Cómo configurarla y resolver problemas: [Edición con IA](IA.md).

---

## ⚙️ Preferencias

Abre **⚙️** (arriba a la derecha) para cambiar:

### 👁️ Apariencia
- **Idioma**: español, inglés, catalán
- **Tema**: oscuro, claro o del sistema
- **Tamaño de fuente**: ajustable con `Ctrl+rueda` del ratón

### ✏️ Editor
- **Modo por defecto**: ¿abres notas en lectura o edición?
- **Números de línea**: sí o no

### 📂 Archivos
- **Carpeta de adjuntos**: dónde se guardan imágenes y archivos subidos
- **Carpeta del vault**: puedes cambiarla aquí (exige contraseña)

### ✨ IA
- **Proveedores**, claves de API (se guardan cifradas), respaldo y acciones rápidas. Ver [Edición con IA](IA.md)

---

## 🗑️ Papelera

Cuando **eliminas una nota**, va a la carpeta `.trash/` (papelera).

- **Recuperarla**: clic derecho en `.trash/` → la nota → *Mover* → elige dónde
- **Vaciar papelera**: clic derecho en `.trash/` → *Vaciar papelera*

---

## 📊 Pestañas y organización

### Abrir una nota en pestaña nueva

- `Ctrl+clic` en el explorador
- O botón central del ratón

### Cerrar una pestaña

- Haz clic en la `✕` de la pestaña
- O `Ctrl+W`

---

## ⌨️ Atajos útiles (en un vistazo)

| Atajo | Qué hace |
|-------|----------|
| `Ctrl+P` | Abrir nota (búsqueda rápida) |
| `Ctrl+Shift+F` | Buscar en todo el vault |
| `Ctrl+F` | Buscar en esta nota |
| `Ctrl+E` | Cambiar leer ↔ editar |
| `Ctrl+S` | Guardar ahora |
| `Ctrl+B` | Mostrar/ocultar explorador |
| `Ctrl+K` | Editar con IA |
| `Ctrl+W` | Cerrar pestaña |
| `Escape` | Cerrar diálogos y menús |

---

## 💾 Descargar tu vault

Si quieres una copia de seguridad:

1. Abre el **menú** (≡) de una nota cualquiera
2. *Más opciones* → *Descargar vault*
3. Se descarga un archivo `.zip` con todas tus notas

---

## ❓ Algo no funciona o tengo dudas

- **Pregunta al administrador** del servidor (quien te dio acceso)
- O revisa la [documentación completa](../../README.md) (es más detallada)

---

¡Que disfrutes organizando tus ideas! 📝✨
