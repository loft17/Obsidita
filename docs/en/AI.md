# ✨ AI Editing

Obsidita can ask an AI model to edit the open note, or just the selected text, with a natural-language instruction: "fix the spelling", "summarize as bullet points", "translate to Spanish"... The result is applied directly to the note and can be undone in one step.

- Works with any OpenAI-compatible API: **DeepSeek, Gemini, OpenAI, OpenRouter, Ollama**...
- It's optional: with no providers configured, the feature is hidden and nothing is loaded.
- The server never writes the note: the change is applied in the editor and saved by the usual autosave.
- API keys are stored **encrypted** and never go back to the browser.

---

## 📋 Table of Contents

1. [Quick setup](#-quick-setup)
2. [Usage](#️-usage)
3. [Undo and retry](#️-undo-and-retry)
4. [Settings → AI in detail](#️-settings--ai-in-detail)
5. [Choosing a model](#-choosing-a-model)
6. [Troubleshooting](#-troubleshooting)
7. [Security and privacy](#-security-and-privacy)
8. [Advanced (manual) setup](#️-advanced-manual-setup)

---

## 🚀 Quick setup

1. Get an API key from your provider:
   - **Gemini**: [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (has a free tier).
   - **DeepSeek**: [platform.deepseek.com](https://platform.deepseek.com) → *API keys*.
2. In Obsidita, open **⚙️ Settings → AI**.
3. In **Add provider**, choose the template (Gemini, DeepSeek...). The URL and model are filled in for you.
4. Paste the key into **API key** and click **Save**.
5. Click **Edit** on the provider and then **Test**: you should see "Connection OK".

No restart needed. The first provider you add becomes the default one.

---

## ✍️ Usage

### Opening the bar

With a note open, any of these:

- <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>K</kbd>
- The **✨** button in the editor's formatting toolbar.
- **Edit with AI** in the note menu (⋯), handy on mobile.

If the note is in reading mode, it switches to editing. The bar appears at the bottom, above the editor; on mobile it spans the full width and stays above the keyboard.

### What gets edited

| If... | What's edited | The bar shows |
|---|---|---|
| Text is selected | Only the selection | "Selection · 120 words" |
| Nothing is selected | The whole note, without its properties (frontmatter) | "Whole note" |

### Sending an instruction

- Type what you want ("make it more formal", "turn this into a table") and press <kbd>Enter</kbd>.
- Or click a **quick action** (e.g. *Fix spelling*), which sends its instruction right away.
- If there are several providers, choose one in the dropdown. The last one you choose is remembered.

While waiting, the affected text is highlighted and the bar shows how many seconds have passed. **Cancel** or <kbd>Esc</kbd> stop the request; when idle, <kbd>Esc</kbd> closes the bar. You can keep using the editor meanwhile, but if you change the affected text, the response isn't applied and you're warned.

### Refining the result

If you edited a selection, the new text stays selected: type another instruction to tweak it ("shorter", "no bullet points"...).

---

## ↩️ Undo and retry

| Option | What it does | When it works |
|---|---|---|
| <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Z</kbd> | Undoes the whole AI change at once | As long as you don't close the note |
| **Undo** button | Restores the note as it was before the change | For 5 minutes, even if you switch notes and come back, as long as you haven't edited it since |
| **Retry** button | Undoes the change and repeats the same request | Same as Undo |

The copy used by **Undo** is kept only in the browser's memory: it's lost when you reload the page. If you sync with GitHub, you also have the note's version history.

---

## ⚙️ Settings → AI in detail

Each provider is shown on one line with its model and key status. **Edit** expands its fields and **Delete** removes it. Changes take effect when you click **Save**.

| Field | What it's for |
|---|---|
| **Name** | What you'll see in the bar's dropdown. Letters, digits, `-`, `_` and `.`. |
| **Base URL** | The API address, without `/chat/completions` at the end. |
| **Model** | The exact model name at that provider. |
| **API key** | Stored encrypted. Type another one only to change it; **Forget key** deletes it. |
| **Environment variable** | Optional. If that variable is set on the server, it's used instead of the saved key. |
| **↑ ↓** | Change the list order, which is the fallback order. |
| **Test** | Sends a minimal request to that provider only. Save your changes first. |

**Usage:**

- **Default provider**: used when you don't choose another one in the bar.
- **Fallback**: if the chosen provider fails (network, rejected key, no credit, rate limit, server error or timeout), the checked ones are tried in list order. If another one answers, you see a notice: "gemini answered (deepseek failed)".

**Quick actions**: buttons with a fixed instruction. Optionally, they can always use a specific provider.

You can add the same service several times with different models (e.g. a fast one and a more capable one) and choose in the bar.

### Common provider URLs

| Provider | Base URL | Example model |
|---|---|---|
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat` |
| Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-3.5-flash-lite` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4.1-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | `deepseek/deepseek-chat` |
| Ollama (local, no key) | `http://127.0.0.1:11434/v1` | `llama3.2` |

---

## 🧠 Choosing a model

You don't need the biggest model to edit text: fast, cheap ones are usually enough.

Some models "think" before answering and can take **over a minute** even for a short text. Obsidita stops waiting after 60 seconds (`AI_TIMEOUT_S`). On Gemini, for example:

| Model | Answer to "Reply only: OK" (real measurement) |
|---|---|
| `gemini-3.5-flash-lite`, `gemini-flash-lite-latest` | ~1 s ✅ |
| `gemini-3.8-flash`, `gemini-flash-latest` | 30-100 s ❌ |

Available models change over time: the ones for your key are listed at `GET {base URL}/models` (with the key in the `Authorization: Bearer ...` header).

---

## 🩺 Troubleshooting

When the provider returns an error, the bar or the **Test** button show the code and the provider's reason, e.g. `(HTTP 400: API key not valid)`.

| Message | Likely cause | Fix |
|---|---|---|
| No ✨ and <kbd>Ctrl</kbd>+<kbd>K</kbd> does nothing | No providers, or the page was loaded before configuring them | Configure one in Settings → AI and reload the page |
| "The provider's API key is missing" | No saved key and no environment variable | Paste the key and save |
| "The saved key cannot be decrypted" | The encryption key changed | Type the key again |
| `HTTP 400: API key not valid` / `HTTP 401` | Key miscopied or revoked | Copy it again |
| `HTTP 402` | No credit (DeepSeek, OpenAI...) | Top up at the provider |
| `HTTP 403` | The API isn't enabled for that key or project | Enable it or create the key from AI Studio |
| `HTTP 404 ... model ... not found / no longer available` | The model doesn't exist or is no longer available | Change the model (check your key's model list) |
| `HTTP 429` | Provider quota or per-minute limit | Wait or check your plan |
| "The AI provider did not respond in time" | Slow model (see [Choosing a model](#-choosing-a-model)) | Use a faster model or raise `AI_TIMEOUT_S` |
| "Could not connect to the AI provider" | The server can't reach that URL | Check the URL, DNS or firewall |
| "Too many AI requests" | Obsidita's limit (`AI_RATE_MAX`, 10 per minute) | Wait a minute or raise it |
| "The text is too long" | More than `AI_MAX_CHARS` characters (40,000) | Select a part or raise the limit |
| "The note changed in the meantime" | The text was edited while waiting | Send the instruction again |

---

## 🔒 Security and privacy

- **What leaves the server**: only the text being edited (the selection or the note) and your instruction, sent to the chosen provider. Nothing else from the vault.
- **What isn't stored**: there's no conversation history. Logs never include the text or the keys; with `LOG_LEVEL=info` they only show the provider, HTTP status and response time.
- **Keys**: encrypted with AES-256-GCM and stored in `data/config.json` (`apiKeyEnc`). Settings never shows them; it only tells you whether one is saved.
- **Encryption key**: by default it's generated in `data/.ai-secret`, readable only by the service user. That protects the keys if `config.json` is shared or leaked, but someone with a copy of the whole `data/` folder (including the copies in `data/backups/`) could decrypt them. To avoid that, set the encryption key outside `data/`, in `.env` or in the service environment:

  ```env
  # 64 hex characters: openssl rand -hex 32
  AI_KEYS_SECRET=...
  ```

  When you set or change it, saved keys can no longer be read: Settings → AI shows it and you just type them again.

---

## 🛠️ Advanced (manual) setup

Settings → AI stores everything in the `ai` section of `data/config.json`, which you can also edit by hand. The server re-reads the file when it changes, so no restart is needed (but reload the page).

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
    { "name": "Fix spelling",    "prompt": "Fix spelling and grammar without changing the style.", "provider": "deepseek" },
    { "name": "Improve writing", "prompt": "Improve clarity and flow." },
    { "name": "Summarize",       "prompt": "Summarize as bullet points." }
  ]
}
```

| Field | Meaning |
|---|---|
| `providers` | Name → `baseUrl` + `model` and, optionally, `apiKeyEnv` (environment variable with the key), `apiKeyEnc` (encrypted key, written by Settings) and `temperature`. With no key, no `Authorization` header is sent (local Ollama). |
| `default` | Default provider. If missing, the first one. |
| `fallback` | Fallback order. |
| `actions` | Quick actions. `provider` is optional. |

Keys from environment variables go in `.env` (and need a service restart):

```env
DEEPSEEK_API_KEY=sk-...
GEMINI_API_KEY=AIza...
```

### Limits (optional, in `.env`)

| Variable | Default | What it limits |
|---|---|---|
| `AI_MAX_CHARS` | `40000` | Characters of the text sent (selection or note) |
| `AI_RATE_MAX` | `10` | Requests per minute and per session |
| `AI_TIMEOUT_S` | `60` | Seconds to wait for each provider |
| `AI_KEYS_SECRET` | — | Encryption key for saved keys (64 hex characters) |

### Endpoints

All require a session:

| Method | Path | Use |
|---|---|---|
| `GET` | `/api/ai/config` | What the bar needs: provider names, the default one and actions (no URLs or keys) |
| `POST` | `/api/ai/edit` | `{ text, instruction, provider? }` → `{ text, provider, failed }` |
| `GET` / `POST` | `/api/ai/settings` | Settings → AI (URLs and models, never keys) |
