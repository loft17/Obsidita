# 🛠️ Mantenimiento de una instalación

Tareas habituales para administrar Obsidita en un servidor. Los ejemplos siguen el despliegue del [README](../README.md#-despliegue-en-producción): app en `/opt/obsidian-web/app`, usuario `obsidian` y servicio systemd `obsidian-web`. Adapta rutas y comandos si lo instalaste de otra forma (con PM2, por ejemplo, `pm2 restart obsidian-web` y `pm2 logs obsidian-web`).

## Índice

- [Actualizar](#actualizar)
- [Copias de seguridad](#copias-de-seguridad)
- [He olvidado la contraseña](#he-olvidado-la-contraseña)
- [Cerrar todas las sesiones sin entrar en la web](#cerrar-todas-las-sesiones-sin-entrar-en-la-web)
- [Cambiar el puerto](#cambiar-el-puerto)
- [Ver los logs](#ver-los-logs)
- [Variables de entorno](#variables-de-entorno)
- [Límites](#límites)

---

## Actualizar

```bash
cd /opt/obsidian-web/app
sudo -u obsidian git pull
sudo -u obsidian npm install      # actualiza dependencias y recompila el frontend
sudo systemctl restart obsidian-web
```

Después, recarga la web con <kbd>Ctrl</kbd> + <kbd>F5</kbd>.

> [!WARNING]
> No uses `npm install --omit=dev` ni `--production`: sin Vite no se compila el frontend y la web aparece en blanco.

Antes de actualizar, revisa los commits nuevos (`git log HEAD..origin/main` tras un `git fetch`) por si alguno pide un cambio en la configuración (variables de entorno, nginx…).

---

## Copias de seguridad

- **El vault es lo importante.** Son archivos Markdown normales: cópialos con tu herramienta habitual (rsync, restic, git, Syncthing…). La [sincronización con GitHub](../README.md#-sincronización-con-github) también sirve como copia.
- `data/` solo guarda configuración, sesiones y la configuración de la sincronización (con el token de GitHub). Si se pierde, basta con repetir la configuración inicial y volver a pegar el token. Si la incluyes en la copia, protégela: contiene secretos.

---

## He olvidado la contraseña

```bash
sudo systemctl stop obsidian-web
sudo -u obsidian rm /opt/obsidian-web/app/data/config.json
sudo systemctl start obsidian-web
sudo journalctl -u obsidian-web -n 20   # copia el nuevo token de configuración
```

Repite la configuración inicial apuntando al mismo vault: tus notas no se tocan y todas las sesiones anteriores dejan de valer. Si habías cambiado el puerto, vuelve a indicarlo.

---

## Cerrar todas las sesiones sin entrar en la web

Borra `data/sessions.json` (o `data/.secret`, que invalida además todas las cookies firmadas) y reinicia el servicio. Desde la web se hace en *Preferencias → Seguridad*.

---

## Cambiar el puerto

El puerto se guarda en `data/config.json` y tiene prioridad sobre la variable `PORT`. Orden: `config.json` → `PORT` → `3000`.

```bash
sudo -u obsidian nano /opt/obsidian-web/app/data/config.json   # cambia "port"
sudo systemctl restart obsidian-web
```

Recuerda cambiarlo también en el proxy inverso.

---

## Ver los logs

```bash
sudo journalctl -u obsidian-web -f          # systemd, en directo
sudo journalctl -u obsidian-web -n 100      # últimas 100 líneas
pm2 logs obsidian-web --lines 100           # PM2
```

Al arrancar, el servidor avisa si se ejecuta como root, si escucha en todas las interfaces sin HTTPS o si una variable de entorno tiene un valor no válido.

---

## Variables de entorno

El servidor carga el `.env` de la carpeta de la app si existe (Node 20.12+). Las definidas en la shell, en la unidad de systemd o en PM2 **tienen prioridad**. Cualquier cambio requiere reiniciar.

| Variable | Por defecto | Para qué sirve |
| :--- | :--- | :--- |
| `HOST` | todas las interfaces | Interfaz donde escuchar. En producción, `127.0.0.1`. |
| `TRUST_PROXY` | desactivada | Número de proxies (normalmente `1`) o sus IPs. Obligatoria detrás de un proxy inverso; peligrosa sin él. Ver [README](../README.md#trust_proxy). |
| `VAULTS_ROOT` | sin límite | El vault solo puede estar dentro de esta carpeta. |
| `PORT` | `3000` | Solo si `data/config.json` no define `port`. |
| `REMOTE_IMAGES` | desactivada | Con `1`, permite cargar imágenes `https:` externas. |
| Límites | ver abajo | Tamaños, contraseña, búsqueda y sesiones. |

`.env.example` incluye también `COOKIE_SECRET` y `NODE_ENV`, pero el servidor **no los usa**: el secreto de las cookies se genera solo en `data/.secret`.

---

## Límites

Se definen en `server/limits.js`. Los valores actuales se ven en *Preferencias → Variables*. Un valor no válido (texto, cero o negativo) se ignora con un aviso en la consola.

| Límite | Por defecto | Variable |
| :--- | :--- | :--- |
| Petición JSON (guardar nota, etc.) | 20 MB | `MAX_NOTE_MB` |
| Adjunto subido | 50 MB | `MAX_UPLOAD_MB` |
| Contraseña | mínimo 12 caracteres | `MIN_PASSWORD_LENGTH` |
| Búsquedas | 60 por minuto y por IP (después, `429`) | `SEARCH_RATE_MAX` |
| Longitud de una búsqueda | 200 caracteres | `SEARCH_MAX_QUERY_LENGTH` |
| Notas leídas por búsqueda | se omiten las de más de 2 MB | `SEARCH_MAX_FILE_MB` |
| Total indexado para la búsqueda (en memoria) | 200 MB; las notas que no caben no se buscan | `SEARCH_MAX_SCANNED_MB` |
| Resultados de búsqueda | 200 archivos | `SEARCH_MAX_RESULTS` |
| Coincidencias por archivo | 5 | `SEARCH_MAX_MATCHES_PER_FILE` |
| Duración máxima de una sesión | 30 días | `SESSION_MAX_DAYS` |
| Caducidad por inactividad | 7 días | `SESSION_IDLE_DAYS` |

> [!IMPORTANT]
> Si subes `MAX_UPLOAD_MB` o `MAX_NOTE_MB` y usas nginx, sube también `client_max_body_size` al mayor de los dos; si no, nginx responderá `413` antes de llegar a la app.

Cambiar el mínimo de contraseña no afecta a la contraseña actual: solo se aplica al crearla o cambiarla.
