# Contribuir a Obsidita

Guía corta para levantar el proyecto en local, comprobar que un cambio funciona y desplegarlo. Para el detalle de cada pieza:

- [Arquitectura](docs/es/ARQUITECTURA.md) — cómo está organizado el código
- [API HTTP](docs/es/API.md) — endpoints del servidor
- [Instalación y configuración](docs/es/INSTALACION_Y_CONFIGURACION.md) — variables de entorno y proxy
- [Mejoras recomendadas](docs/es/MEJORAS_RECOMENDADAS.md) — lista de pendientes priorizada (buen sitio para elegir tarea)

---

## Requisitos

- **Node.js ≥ 20** (lo exige `engines` en `package.json`)
- **npm**
- **git** (solo si vas a usar la sincronización con GitHub)
- Una carpeta que haga de vault de pruebas. **No uses tu vault real para desarrollar**: la app escribe, renombra y borra archivos en él.

---

## Levantar en local

```bash
git clone https://github.com/loft17/Obsidita.git
cd Obsidita
npm install          # instala todo y, por el postinstall, compila la web (web/dist)
cp .env.example .env # opcional: los valores por defecto sirven para desarrollar
```

Para desarrollar, quita del `.env` la línea `NODE_ENV=production` o pon `LOG_LEVEL=debug`: así verás los logs `info` y `debug`.

### Modo desarrollo

```bash
npm run dev
```

Lanza dos procesos a la vez:

| Proceso | Puerto | Qué hace |
|---|---|---|
| `server:dev` | 3000 | Express con `node --watch`: se reinicia al guardar cualquier archivo de `server/` |
| `web:dev` | 5173 | Vite con recarga en caliente; reenvía `/api` al puerto 3000 |

Abre **http://localhost:5173**. La primera vez aparece el setup: elige contraseña y la ruta (absoluta) del vault de pruebas. Esto crea `data/config.json`.

Para empezar de cero, para el servidor y borra `data/` (contraseña, sesiones, secreto de cookies y configuración). Se regenera en el siguiente arranque.

### Modo producción en local

```bash
npm run web:build   # vuelve a compilar la web en web/dist
npm start           # sirve web/dist y la API en http://localhost:3000
```

Sirve para comprobar lo que de verdad se despliega: compresión `.br`/`.gz`, CSP, caché de `assets/`…

---

## Estructura en 30 segundos

```
server/            Backend Express (JavaScript, ES modules)
  index.js         Arranque, middlewares y montaje de rutas
  routes/          Un archivo por grupo de endpoints (/api/files, /api/search, /healthz…)
  vault.js         Todo acceso al disco pasa por aquí (guardPath impide salir del vault)
web/               Frontend React + TypeScript + Vite
  src/components/  Componentes de la interfaz
  src/api.ts       Único cliente de la API
data/              Estado del servidor (no se versiona; permisos 700)
docs/              Documentación en español (es/) e inglés (en/)
```

---

## Comprobar un cambio

> El proyecto **todavía no tiene tests automáticos ni CI** (mejoras #52 y #53). Mientras tanto, antes de dar un cambio por bueno:

1. **Tipos del frontend**
   ```bash
   npx tsc --noEmit -p web
   ```
2. **Sintaxis del servidor**
   ```bash
   for f in server/*.js server/routes/*.js; do node --check "$f" || exit 1; done
   ```
3. **Build de producción**: `npm run web:build` tiene que terminar sin errores.
4. **Salud del servicio** con el servidor arrancado:
   ```bash
   curl -fsS http://localhost:3000/healthz
   # {"status":"ok","configured":true,"vault":true,...}
   ```
5. **Prueba manual** de lo que hayas tocado y de lo que se apoya en ello. Lo mínimo:
   - login y logout
   - abrir, editar y guardar una nota (y que el cambio esté en el `.md` del disco)
   - crear, renombrar (comprueba que se actualizan los wikilinks) y borrar (papelera)
   - búsqueda
   - si tocaste la interfaz: tema claro y oscuro, y ancho de móvil

Cuando se añadan tests, este apartado pasará a ser `npm test` y `npm run typecheck`.

---

## Convenciones

- **Idioma**: comentarios, mensajes de log y errores de la API en **español**. Los nombres de variables y funciones, en inglés.
- **Comentarios**: explican el *porqué* (el riesgo que se evita, el caso raro), no el *qué*. Mira cualquier archivo de `server/` como referencia.
- **Seguridad primero**:
  - Toda ruta de archivo que venga del cliente pasa por `resolveFile`/`guardPath` de `server/vault.js`.
  - Ningún endpoint nuevo de `/api` puede saltarse la comprobación de sesión de `server/index.js`. Si de verdad tiene que ser público (como `/healthz`), que no devuelva rutas ni contenido del vault.
  - Las escrituras en `data/` usan `writeFileAtomic` de `server/dataFiles.js`.
- **Límites configurables**: si añades un límite o una opción nueva, léela de una variable de entorno con un valor por defecto razonable y documéntala en `.env.example`.
- **Documentación**: si cambias un endpoint, actualiza `docs/es/API.md` y `docs/en/API.md`. Si resuelves una mejora de `MEJORAS_RECOMENDADAS.md`, márcala con ✅ y explica qué se hizo.
- **Versión**: se sube en `package.json` (`version`). El aviso de actualización de la web la compara con la de la rama `main` en GitHub.

---

## Desplegar

Despliegue de referencia: **Linux + systemd + nginx (o Caddy) con HTTPS delante**. Los scripts completos para copiar y pegar están en [docs/es/SCRIPTS_LISTOS.md](docs/es/SCRIPTS_LISTOS.md). Aquí va lo esencial para que dos despliegues den el mismo resultado.

### 1. Usuario y código

```bash
sudo useradd --system --create-home --home-dir /opt/obsidita obsidita
sudo -u obsidita git clone https://github.com/loft17/Obsidita.git /opt/obsidita/app
cd /opt/obsidita/app
sudo -u obsidita git checkout <commit-o-etiqueta>   # despliega siempre una versión concreta, no "lo último"
```

Nunca como root: el servidor avisa al arrancar si lo detecta.

### 2. Dependencias y build

```bash
sudo -u obsidita npm install
```

- **No uses `npm install --omit=dev`**: el `postinstall` compila la web con Vite, que es una dependencia de desarrollo, y el build fallaría.
- En máquinas con poca RAM: `NODE_OPTIONS=--max-old-space-size=512 npm install` (ver [OPTIMIZACION_RECURSOS_LIMITADOS.md](docs/es/OPTIMIZACION_RECURSOS_LIMITADOS.md)).

### 3. Configuración

```bash
sudo -u obsidita cp .env.example .env
sudo chmod 600 .env
```

Valores mínimos para producción:

```ini
NODE_ENV=production
HOST=127.0.0.1        # solo el proxy puede llegar a la app
TRUST_PROXY=1         # para que el límite de intentos de login vea la IP real
VAULTS_ROOT=/srv/vaults
```

### 4. Servicio systemd

`/etc/systemd/system/obsidita.service`:

```ini
[Unit]
Description=Obsidita
After=network.target

[Service]
Type=simple
User=obsidita
WorkingDirectory=/opt/obsidita/app
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now obsidita
journalctl -u obsidita -f      # logs
```

### 5. Proxy inverso

- Reenvía todo a `127.0.0.1:3000` con HTTPS.
- `client_max_body_size` de nginx ≥ `MAX_UPLOAD_MB` (y pon `PROXY_MAX_BODY_MB` al mismo valor). Si no, las subidas grandes fallan con un 413 de nginx.
- Si el proxy admite comprobaciones de salud, apúntalas a `GET /healthz`. Devuelve `503` si el vault deja de ser accesible.

### 6. Verificar

```bash
curl -fsS http://127.0.0.1:3000/healthz
```

Después abre la web por HTTPS y completa el setup.

### Actualizar

```bash
tar -czf ~/obsidita-data-$(date +%F).tar.gz -C /opt/obsidita/app data .env   # copia de seguridad
cd /opt/obsidita/app
sudo -u obsidita git fetch && sudo -u obsidita git checkout <nueva-versión>
sudo -u obsidita npm install
sudo systemctl restart obsidita
curl -fsS http://127.0.0.1:3000/healthz
```

Para volver atrás: `git checkout <versión-anterior>`, `npm install` y reiniciar. Si la versión nueva llegó a tocar `data/`, restaura también la copia de seguridad.

---

## Enviar cambios

1. Crea una rama a partir de `main`.
2. Haz un cambio por PR, con una descripción de **qué** cambia y **cómo lo has comprobado** (los pasos de [Comprobar un cambio](#comprobar-un-cambio)).
3. No incluyas `data/`, `.env`, `web/dist/` ni `node_modules/` (ya están en `.gitignore`).
