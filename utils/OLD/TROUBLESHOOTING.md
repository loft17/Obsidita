# 🩺 Solución de problemas

Primero, ejecuta el diagnóstico automático. Revisa Node, dependencias, configuración, vault, build, permisos y puerto:

```bash
./utils/diagnose.sh
```

Los comandos de esta guía suponen el despliegue del [README](../README.md#-despliegue-en-producción) (servicio systemd `obsidian-web`). Para ver los logs, consulta [MANTENIMIENTO.md → Ver los logs](MANTENIMIENTO.md#ver-los-logs).

## Índice

- [Errores frecuentes](#errores-frecuentes)
- [La web sale en blanco](#la-web-sale-en-blanco)
- [La web sigue pidiendo la configuración inicial](#la-web-sigue-pidiendo-la-configuración-inicial)
- [No puedo conectar con la web](#no-puedo-conectar-con-la-web)
- [Volver a empezar de cero](#volver-a-empezar-de-cero)
- [Cómo reportar un fallo](#cómo-reportar-un-fallo)

---

## Errores frecuentes

| Problema | Causa probable y solución |
| :--- | :--- |
| **`403 "Origen no permitido"`** al guardar, entrar, etc. | Estás detrás de un proxy sin `TRUST_PROXY=1`, o nginx no envía `Host`/`X-Forwarded-Proto`. Ver [`TRUST_PROXY`](../README.md#trust_proxy). También pasa si entras por un dominio o puerto distinto del que reenvía el proxy. |
| **`403` en la configuración inicial** | Token incorrecto. Cópialo de la consola del servidor (`journalctl -u obsidian-web`). |
| **No encuentro el token de configuración** | Solo aparece si no existe `data/config.json`. Reinicia el servicio y mira los primeros mensajes del log. |
| **`429 Demasiados intentos`** | Límite de intentos de login: espera el tiempo indicado. Si te pasa sin haber fallado, puede que estés detrás de un proxy sin `TRUST_PROXY` y otra IP esté fallando. |
| **`413` al subir una imagen** | nginx limita el cuerpo a 1 MB por defecto: añade `client_max_body_size 50m;`. |
| **Las imágenes externas salen rotas** | Están bloqueadas a propósito. Arranca con `REMOTE_IMAGES=1`. |
| **El puerto no cambia con `PORT`** | `data/config.json` define `"port"` y tiene prioridad. Ver [Cambiar el puerto](MANTENIMIENTO.md#cambiar-el-puerto). |
| **"Esa carpeta no se puede usar como vault"** | Es una ruta del sistema, una carpeta personal completa, una carpeta oculta o la de la app. Usa una subcarpeta normal, como `/srv/vaults/notas`. |
| **"El vault debe estar dentro de …"** | `VAULTS_ROOT` está definida y la ruta queda fuera. |
| **Una carpeta del vault no aparece** | Es un enlace simbólico (no se siguen), su nombre empieza por `.` (`.obsidian/`, `.trash/`, `.git/`… nunca se muestran) o coincide con un patrón de *Preferencias → Archivos → Ocultar carpetas*. |
| **`Permiso denegado`** | El usuario que ejecuta la app no puede leer o escribir en el vault. Revisa propietario y permisos (`chown`/`chmod`). Con systemd, comprueba también `ReadWritePaths` y `ProtectHome`. |
| **Error al sincronizar con GitHub (401 / 403)** | El token ha caducado o no tiene permiso *Contents: Read and write* sobre ese repositorio. Crea otro y pégalo en *Preferencias → Sincronización*. |
| **La sesión se cierra sola** | Han pasado 7 días sin uso o 30 en total, o se cambió la contraseña o se cerraron todas las sesiones. |
| **Las preferencias no se mantienen entre dispositivos** | Las de interfaz se guardan en cada navegador (`localStorage`). |
| **He olvidado la contraseña** | Ver [MANTENIMIENTO.md](MANTENIMIENTO.md#he-olvidado-la-contraseña). |
| **El navegador bloquea un script (error de CSP en la consola)** | Has recompilado el frontend sin reiniciar el servidor: los hashes CSP se calculan al arrancar. Reinicia el servicio. |
| **El texto de la nota sale sin centrar y con un borde blanco; en la consola: *"Applying inline style violates… 'default-src 'self''"*** | El proxy inverso añade su propia `Content-Security-Policy` además de la de la app, y bloquea los estilos de CodeMirror y el script inline. Quita ese `add_header Content-Security-Policy …` de nginx (o la cabecera equivalente en Caddy o Nginx Proxy Manager) y recarga el proxy. Ver el aviso de la [sección de nginx](../README.md#4️⃣-ponle-https-delante). |

---

## La web sale en blanco

O aparece `Cannot GET /`. No existe `web/dist` o está a medias:

```bash
npm install          # sin --omit=dev ni --production
npm run web:build    # si quieres recompilar solo el frontend
```

Después reinicia el servidor y recarga con <kbd>Ctrl</kbd> + <kbd>F5</kbd>.

---

## La web sigue pidiendo la configuración inicial

1. Comprueba que existe `data/config.json` y que el usuario de la app puede leerlo:
   ```bash
   ls -l data/config.json
   ```
2. Si no existe, la configuración falló. En el navegador abre las herramientas de desarrollo (<kbd>F12</kbd>) → **Red** y mira la respuesta de `POST /api/setup/init`; en el servidor, el log.
3. Si la carpeta `data/` no es del usuario que ejecuta la app, el servidor no puede escribir en ella:
   ```bash
   sudo chown -R obsidian:obsidian /opt/obsidian-web/app/data
   ```

---

## No puedo conectar con la web

1. **¿Está el servidor en marcha?**
   ```bash
   sudo systemctl status obsidian-web
   curl -I http://127.0.0.1:3000      # desde el propio servidor
   ```
2. **¿Responde el proxy?** Revisa su configuración y sus logs (`sudo nginx -t`, `journalctl -u caddy`).
3. **¿Accedes sin proxy?** Con `HOST=127.0.0.1` la app solo acepta conexiones del propio servidor, y el firewall puede estar cerrando el puerto. Lo recomendado es poner un proxy con HTTPS delante, no abrir el puerto.

---

## Volver a empezar de cero

Ninguno de estos pasos toca las notas del vault.

```bash
sudo systemctl stop obsidian-web
cd /opt/obsidian-web/app

sudo -u obsidian rm data/config.json                  # vuelve a la configuración inicial
sudo -u obsidian rm data/sessions.json data/.secret   # cierra todas las sesiones
sudo -u obsidian rm data/sync.json                    # olvida la sincronización y el token
sudo -u obsidian rm -rf data/                         # todo lo anterior a la vez

sudo -u obsidian rm -rf node_modules web/dist         # reinstala y recompila
sudo -u obsidian npm install

sudo systemctl start obsidian-web
```

---

## Cómo reportar un fallo

Abre un *issue* en el repositorio con:

1. Qué hiciste, qué esperabas y qué pasó.
2. La salida de `./utils/diagnose.sh`.
3. Los errores de la consola del navegador (<kbd>F12</kbd> → **Consola**) y, si es un error de la API, la respuesta en **Red**.
4. El log del servidor alrededor del fallo (`journalctl -u obsidian-web -n 100`).
5. Versión de la app (*Preferencias → Acerca de*), de Node y del navegador.

> [!CAUTION]
> Revisa lo que pegas: no incluyas el contenido de `data/`, tokens de GitHub, cookies ni notas privadas.
