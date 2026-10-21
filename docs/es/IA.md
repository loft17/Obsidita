# ✨ Edición con IA

Obsidita puede pedir a un modelo de IA que edite la nota abierta, o solo el texto seleccionado, con una instrucción en lenguaje natural: «corrige la ortografía», «resume en viñetas», «tradúcelo al inglés»... El resultado se aplica directamente en la nota y se puede deshacer de una vez.

- Funciona con cualquier API compatible con OpenAI: **DeepSeek, Gemini, OpenAI, OpenRouter, Ollama**...
- Es opcional: sin proveedores configurados, la función no aparece y no se carga nada.
- El servidor nunca escribe la nota: el cambio se aplica en el editor y lo guarda el autoguardado de siempre.
- Las claves de API se guardan **cifradas** y nunca vuelven al navegador.

---

## 📋 Índice

1. [Configuración rápida](#-configuración-rápida)
2. [Uso](#️-uso)
3. [Deshacer y reintentar](#️-deshacer-y-reintentar)
4. [Ajustes → IA en detalle](#️-ajustes--ia-en-detalle)
5. [Elegir modelo](#-elegir-modelo)
6. [Problemas frecuentes](#-problemas-frecuentes)
7. [Seguridad y privacidad](#-seguridad-y-privacidad)
8. [Configuración avanzada (a mano)](#️-configuración-avanzada-a-mano)

---

## 🚀 Configuración rápida

1. Consigue una clave de API de tu proveedor:
   - **Gemini**: [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (tiene plan gratuito).
   - **DeepSeek**: [platform.deepseek.com](https://platform.deepseek.com) → *API keys*.
2. En Obsidita, abre **⚙️ Ajustes → IA**.
3. En **Añadir proveedor**, elige la plantilla (Gemini, DeepSeek...). La URL y el modelo se rellenan solos.
4. Pega la clave en **Clave de API** y pulsa **Guardar**.
5. Pulsa **Editar** en el proveedor y después **Probar**: debe salir «Conexión correcta».

No hace falta reiniciar. El primer proveedor que añades queda como proveedor por defecto.

---

## ✍️ Uso

### Abrir la barra

Con una nota abierta, de cualquiera de estas formas:

- <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>K</kbd>
- El botón **✨** de la barra de formato del editor.
- **Editar con IA** en el menú de la nota (⋯), útil en el móvil.

Si la nota está en modo lectura, pasa a edición. La barra aparece abajo, encima del editor; en el móvil ocupa todo el ancho y queda por encima del teclado.

### Qué se edita

| Si... | Se edita | La barra muestra |
|---|---|---|
| Hay texto seleccionado | Solo la selección | «Selección · 120 palabras» |
| No hay selección | La nota entera, sin las propiedades (frontmatter) | «Nota completa» |

### Enviar una instrucción

- Escribe lo que quieres («hazlo más formal», «convierte esto en una tabla») y pulsa <kbd>Intro</kbd>.
- O pulsa una **acción rápida** (por ejemplo, *Corregir ortografía*), que envía su instrucción directamente.
- Si hay varios proveedores, elige uno en el desplegable. Se recuerda el último que eliges.

Mientras espera, el texto afectado se resalta y la barra muestra los segundos que lleva. **Cancelar** o <kbd>Esc</kbd> detienen la petición; con la barra en reposo, <kbd>Esc</kbd> la cierra. Puedes seguir usando el editor mientras tanto, pero si cambias el texto afectado, la respuesta no se aplica y se avisa.

### Afinar el resultado

Si editaste una selección, el texto nuevo queda seleccionado: escribe otra instrucción para retocarlo («más corto», «sin viñetas»...).

---

## ↩️ Deshacer y reintentar

| Opción | Qué hace | Cuándo funciona |
|---|---|---|
| <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Z</kbd> | Deshace todo el cambio de la IA de una vez | Mientras no cierres la nota |
| Botón **Deshacer** | Vuelve a la nota de antes del cambio | Durante 5 minutos, aunque cambies de nota y vuelvas, siempre que no la hayas editado después |
| Botón **Reintentar** | Deshace el cambio y repite la misma petición | Igual que Deshacer |

La copia para **Deshacer** se guarda solo en la memoria del navegador: se pierde al recargar la página. Si sincronizas con GitHub, también tienes el historial de versiones de la nota.

---

## ⚙️ Ajustes → IA en detalle

Cada proveedor se muestra en una línea con su modelo y el estado de la clave. **Editar** despliega sus campos y **Borrar** lo quita. Los cambios se aplican al pulsar **Guardar**.

| Campo | Para qué sirve |
|---|---|
| **Nombre** | Lo que verás en el desplegable de la barra. Letras, números, `-`, `_` y `.`. |
| **URL base** | La dirección de la API, sin `/chat/completions` al final. |
| **Modelo** | El nombre exacto del modelo en ese proveedor. |
| **Clave de API** | Se guarda cifrada. Escribe otra solo para cambiarla; **Olvidar clave** la borra. |
| **Variable de entorno** | Opcional. Si esa variable está definida en el servidor, se usa en lugar de la clave guardada. |
| **↑ ↓** | Cambian el orden de la lista, que es el orden del respaldo. |
| **Probar** | Hace una petición mínima solo a ese proveedor. Guarda antes los cambios. |

**Uso:**

- **Proveedor por defecto**: el que se usa si no eliges otro en la barra.
- **Respaldo**: si el proveedor elegido falla (red, clave rechazada, sin saldo, límite de uso, error del servidor o sin respuesta a tiempo), se prueba con los marcados, en el orden de la lista. Si contesta otro, aparece un aviso: «Respondió gemini (deepseek falló)».

**Acciones rápidas**: botones con una instrucción fija. Opcionalmente, pueden usar siempre un proveedor concreto.

Puedes dar de alta el mismo servicio varias veces con modelos distintos (por ejemplo, uno rápido y otro más potente) y elegir en la barra.

### URLs de los proveedores más comunes

| Proveedor | URL base | Modelo de ejemplo |
|---|---|---|
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat` |
| Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-3.5-flash-lite` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4.1-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | `deepseek/deepseek-chat` |
| Ollama (local, sin clave) | `http://127.0.0.1:11434/v1` | `llama3.2` |

---

## 🧠 Elegir modelo

Para editar texto no hace falta el modelo más grande: los rápidos y baratos suelen bastar.

Algunos modelos «piensan» antes de responder y pueden tardar **más de un minuto** incluso con un texto corto. Obsidita deja de esperar a los 60 segundos (`AI_TIMEOUT_S`). En Gemini, por ejemplo:

| Modelo | Respuesta a «Responde solo: OK» (medida real) |
|---|---|
| `gemini-3.5-flash-lite`, `gemini-flash-lite-latest` | ~1 s ✅ |
| `gemini-3.8-flash`, `gemini-flash-latest` | 30-100 s ❌ |

Los modelos disponibles cambian con el tiempo: los de tu clave se listan en `GET {URL base}/models` (con la clave en la cabecera `Authorization: Bearer ...`).

---

## 🩺 Problemas frecuentes

Cuando el proveedor devuelve un error, la barra o el botón **Probar** muestran el código y el motivo que da el proveedor, por ejemplo `(HTTP 400: API key not valid)`.

| Mensaje | Causa probable | Solución |
|---|---|---|
| No aparece ✨ ni funciona <kbd>Ctrl</kbd>+<kbd>K</kbd> | No hay proveedores, o la página es anterior a configurarlos | Configura uno en Ajustes → IA y recarga la página |
| «Falta la clave de la API del proveedor» | No hay clave guardada ni variable de entorno | Pega la clave y guarda |
| «La clave guardada no se puede descifrar» | Ha cambiado la clave de cifrado | Vuelve a escribir la clave |
| `HTTP 400: API key not valid` / `HTTP 401` | Clave mal copiada o revocada | Cópiala de nuevo |
| `HTTP 402` | Sin saldo (DeepSeek, OpenAI...) | Recarga saldo en el proveedor |
| `HTTP 403` | La API no está activada para esa clave o proyecto | Actívala o crea la clave desde AI Studio |
| `HTTP 404 ... model ... not found / no longer available` | El modelo no existe o ya no está disponible | Cambia el modelo (mira la lista de modelos de tu clave) |
| `HTTP 429` | Cuota o límite por minuto del proveedor | Espera o revisa tu plan |
| «El proveedor de IA no respondió a tiempo» | Modelo lento (ver [Elegir modelo](#-elegir-modelo)) | Usa un modelo más rápido o sube `AI_TIMEOUT_S` |
| «No se pudo conectar con el proveedor» | El servidor no tiene salida a internet hacia esa URL | Revisa la URL, el DNS o el cortafuegos |
| «Demasiadas peticiones a la IA» | Límite de Obsidita (`AI_RATE_MAX`, 10 por minuto) | Espera un minuto o súbelo |
| «El texto es demasiado largo» | Más de `AI_MAX_CHARS` caracteres (40 000) | Selecciona un trozo o sube el límite |
| «La nota ha cambiado mientras tanto» | Se editó el texto mientras se esperaba | Vuelve a enviar la instrucción |

---

## 🔒 Seguridad y privacidad

- **Qué sale del servidor**: solo el texto que se edita (la selección o la nota) y tu instrucción, hacia el proveedor elegido. Nada más del vault.
- **Qué no se guarda**: no hay historial de conversaciones. Los logs no incluyen ni el texto ni las claves; con `LOG_LEVEL=info` solo aparecen el proveedor, el código HTTP y el tiempo de respuesta.
- **Claves**: se cifran con AES-256-GCM y se guardan en `data/config.json` (`apiKeyEnc`). Ajustes nunca las muestra; solo indica si hay una guardada.
- **Clave de cifrado**: por defecto se genera en `data/.ai-secret`, legible solo por el usuario del servicio. Eso protege las claves si se comparte o se filtra `config.json`, pero quien tenga una copia de toda la carpeta `data/` (incluidas las copias de `data/backups/`) podría descifrarlas. Para evitarlo, define la clave de cifrado fuera de `data/`, en el `.env` o en el entorno del servicio:

  ```env
  # 64 caracteres hexadecimales: openssl rand -hex 32
  AI_KEYS_SECRET=...
  ```

  Al definirla o cambiarla, las claves guardadas dejan de poder leerse: Ajustes → IA lo indica y basta con volver a escribirlas.

---

## 🛠️ Configuración avanzada (a mano)

Ajustes → IA guarda todo en la sección `ai` de `data/config.json`, que también puedes editar a mano. El servidor vuelve a leer el archivo al cambiar, así que no hace falta reiniciar (sí recargar la página).

```json
"ai": {
  "default": "deepseek",
  "fallback": ["deepseek", "gemini"],
  "providers": {
    "deepseek":   { "baseUrl": "https://api.deepseek.com", "model": "deepseek-chat", "apiKeyEnv": "DEEPSEEK_API_KEY" },
    "gemini":     { "baseUrl": "https://generativelanguage.googleapis.com/v1beta/openai", "model": "gemini-3.5-flash-lite", "apiKeyEnv": "GEMINI_API_KEY" },
    "ollama":     { "baseUrl": "http://127.0.0.1:11434/v1", "model": "llama3.2" }
  },
  "actions": [
    { "name": "Corregir ortografía", "prompt": "Corrige ortografía y gramática sin cambiar el estilo.", "provider": "deepseek" },
    { "name": "Mejorar redacción",  "prompt": "Mejora la claridad y la fluidez." },
    { "name": "Resumir",            "prompt": "Resume en viñetas." }
  ]
}
```

| Campo | Qué es |
|---|---|
| `providers` | Nombre → `baseUrl` + `model` y, opcionalmente, `apiKeyEnv` (variable de entorno con la clave), `apiKeyEnc` (clave cifrada, la escribe Ajustes) y `temperature`. Sin clave no se envía `Authorization` (Ollama en local). |
| `default` | Proveedor por defecto. Si falta, el primero. |
| `fallback` | Orden de respaldo. |
| `actions` | Acciones rápidas. `provider` es opcional. |

Las claves por variable de entorno van en el `.env` (y necesitan reiniciar el servicio):

```env
DEEPSEEK_API_KEY=sk-...
GEMINI_API_KEY=AIza...
```

### Límites (opcionales, en el `.env`)

| Variable | Por defecto | Qué limita |
|---|---|---|
| `AI_MAX_CHARS` | `40000` | Caracteres del texto enviado (selección o nota) |
| `AI_RATE_MAX` | `10` | Peticiones por minuto y por sesión |
| `AI_TIMEOUT_S` | `60` | Segundos de espera por proveedor |
| `AI_KEYS_SECRET` | — | Clave de cifrado de las claves guardadas (64 caracteres hexadecimales) |

### Endpoints

Todos requieren sesión:

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/api/ai/config` | Lo que necesita la barra: nombres de proveedores, el de por defecto y acciones (sin URLs ni claves) |
| `POST` | `/api/ai/edit` | `{ text, instruction, provider? }` → `{ text, provider, failed }` |
| `GET` / `POST` | `/api/ai/settings` | Ajustes → IA (URLs y modelos, nunca claves) |
