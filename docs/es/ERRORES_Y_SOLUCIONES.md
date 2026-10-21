# 🚨 Errores Comunes y Soluciones

Guía completa de **errores, causas y soluciones** para Obsidita.

**Tip:** Usa `Ctrl+F` para buscar tu error específico.

---

## 📋 Tabla de Contenidos

- [Errores de Instalación](#errores-de-instalación)
- [Errores de Ejecución](#errores-de-ejecución)
- [Errores de Memoria](#errores-de-memoria)
- [Errores de Nginx](#errores-de-nginx)
- [Errores de Autenticación](#errores-de-autenticación)
- [Errores de Búsqueda](#errores-de-búsqueda)
- [Errores de Permisos](#errores-de-permisos)
- [Errores de SSL/HTTPS](#errores-de-sslhttps)
- [Errores de Base de Datos](#errores-de-base-de-datos)
- [Errores de Rendimiento](#errores-de-rendimiento)
- [Errores de la Edición con IA](#-errores-de-la-edición-con-ia)

---

## 🔧 Errores de Instalación

### Error: "Node.js versión no válida"

**Mensaje:**
```
node: command not found
or
node: version 18.0.0 is not >= 20.0.0
```

**Causa:** Node.js no está instalado o es versión antigua.

**Solución:**

```bash
# 1. Verificar versión instalada
node --version

# 2. Si es antigua o no existe, instalar Node.js 22 (LTS)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt update
sudo apt install -y nodejs

# 3. Verificar nuevamente
node --version  # Debe ser >= 20.0.0
npm --version
```

**Prevención:** Siempre instala versión LTS de Node.js.

---

### Error: "npm install falla con memoria insuficiente"

**Mensaje:**
```
FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory
or
Killed
```

**Causa:** RAM insuficiente durante instalación. Muy común en VPS <= 1 GB.

**Solución:**

```bash
# 1. Crear o expandir swap (3 GB)
sudo fallocate -l 3G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 2. Instalar con menos heap memory
NODE_OPTIONS="--max-old-space-size=512" npm install

# 3. Si aún falla, limpiar caché y reintentar
npm cache clean --force
NODE_OPTIONS="--max-old-space-size=512" npm install --omit=dev

# 4. Verificar
npm list --depth=0
```

**Prevención:** 
- Usar `NODE_OPTIONS` siempre en sistemas con < 2GB RAM
- Crear swap ANTES de instalar

---

### Error: "npm run web:build falla"

**Mensaje:**
```
Vite build error: Out of memory
or
Cannot find module '@vitejs/plugin-react'
```

**Causa:**
- Dependencias no instaladas correctamente
- Memoria insuficiente

**Solución:**

```bash
# 1. Asegurar que npm install completó
npm list | head -20  # Ver primeras dependencias

# 2. Limpiar y reinstalar
rm -rf node_modules package-lock.json
NODE_OPTIONS="--max-old-space-size=1024" npm install

# 3. Compilar frontend
NODE_OPTIONS="--max-old-space-size=1024" npm run web:build

# 4. Verificar output
ls -la web/dist/index.html
```

**Si aún falla en VPS:**
```bash
# Compilar en máquina local y subir
# Ver: OPTIMIZACION_RECURSOS_LIMITADOS.md → Compilar en Máquina Diferente
```

---

### Error: "Git clone falla - SSL certificate problem"

**Mensaje:**
```
fatal: unable to access 'https://github.com/...': SSL certificate problem
```

**Causa:** Certificado SSL no válido o desactualizado.

**Solución:**

```bash
# 1. Actualizar certificados
sudo apt update
sudo apt install -y ca-certificates

# 2. Reintentar clone
git clone https://github.com/tu-usuario/Obsidian-Web.git

# 3. Si aún falla, usar SSH (si tienes key)
git clone git@github.com:tu-usuario/Obsidian-Web.git
```

---

## ⚠️ Errores de Ejecución

### Error: "Port 3000 already in use"

**Mensaje:**
```
Error: listen EADDRINUSE :::3000
or
Address already in use
```

**Causa:** Otro proceso usa el puerto 3000.

**Diagnóstico:**
```bash
# Ver qué usa puerto 3000
sudo lsof -i :3000
# o
sudo netstat -tlnp | grep 3000
```

**Soluciones:**

**Opción 1: Matar proceso anterior**
```bash
# Ver PID del proceso
PID=$(lsof -t -i :3000)
echo "Matando PID: $PID"
kill -9 $PID

# Reiniciar Obsidita
sudo systemctl restart obsidita
```

**Opción 2: Cambiar puerto**
```bash
# Editar .env
sudo nano /opt/obsidita/.env

# Cambiar:
# PORT=3000
PORT=3001

# Cambiar también en nginx si lo usas
sudo nano /etc/nginx/sites-available/obsidita
# Cambiar: server 127.0.0.1:3000;
# A:      server 127.0.0.1:3001;

# Recargar
sudo systemctl restart obsidita
sudo systemctl reload nginx
```

**Prevención:** Usar systemd para gestionar proceso automáticamente.

---

### Error: "Connection refused / Cannot connect to server"

**Mensaje:**
```
Cannot GET / Connection refused
or
ERR_CONNECTION_REFUSED
```

**Causa:** Servicio no está corriendo.

**Diagnóstico:**
```bash
# Ver si está corriendo
sudo systemctl status obsidita

# Ver logs
sudo journalctl -u obsidita -n 20

# Ver si escucha en puerto
sudo lsof -i :3000
```

**Solución:**

```bash
# 1. Iniciar servicio
sudo systemctl start obsidita

# 2. Esperar 2-3 segundos
sleep 3

# 3. Verificar estado
sudo systemctl status obsidita

# 4. Ver logs si hay error
sudo journalctl -u obsidita -n 50
```

**Prevención:** 
```bash
sudo systemctl enable obsidita  # Auto-arrancar
```

---

### Error: "Not configured"

**Mensaje:**
```
{"error":"Not configured"}
or
Pantalla que pide setup cada vez
```

**Causa:** Archivo `data/config.json` no existe o no se puede leer.

**Diagnóstico:**
```bash
# Ver si existe
ls -la /opt/obsidita/data/config.json

# Ver contenido
cat /opt/obsidita/data/config.json
```

**Soluciones:**

**Si no existe:**
```bash
# Acceder al setup web
# http://tu-dominio.com/api/setup
# o
# http://localhost:3000/api/setup

# Completar formulario y hacer setup
```

**Si existe pero no se lee:**
```bash
# Verificar permisos
ls -la /opt/obsidita/data/

# Debe estar:
# -rw------- obsidita obsidita config.json

# Si no, corregir:
sudo chown obsidita:obsidita /opt/obsidita/data/config.json
sudo chmod 600 /opt/obsidita/data/config.json

# Reiniciar
sudo systemctl restart obsidita
```

**Si el archivo está corrupto:**
```bash
# Ver contenido
cat /opt/obsidita/data/config.json | head -c 500

# Si no es JSON válido, restaurar backup
sudo cp /backup/obsidita/backup_*.tar.gz /tmp/
cd /tmp
tar -xzf backup_*.tar.gz
# Restaurar data/config.json desde backup

# O borrar y hacer setup nuevo
sudo rm /opt/obsidita/data/config.json
sudo systemctl restart obsidita
# Acceder a setup URL
```

---

## 💾 Errores de Memoria

### Error: "ENOMEM: out of memory"

**Mensaje:**
```
ENOMEM: out of memory, read
or
killed process 12345 (node) total-vm:XXX kB
```

**Causa:** Aplicación excede memoria disponible (RAM + Swap).

**Diagnóstico inmediato:**
```bash
# Ver memoria actual
free -h

# Ver si está usando swap
vmstat 1 5

# Ver consumo del proceso
ps aux | grep node | grep -v grep | awk '{print "PID:"$2" CPU:"$3"% MEM:"$4"%"}'
```

**Soluciones:**

**Corto plazo (emergencia):**
```bash
# 1. Aumentar swap de emergencia
sudo fallocate -l 1G /swapfile-emergency
sudo chmod 600 /swapfile-emergency
sudo mkswap /swapfile-emergency
sudo swapon /swapfile-emergency

# 2. Reducir búsqueda (impacto inmediato)
sudo nano /opt/obsidita/.env

# Cambiar:
SEARCH_MAX_SCANNED_MB=50
# A:
SEARCH_MAX_SCANNED_MB=25

# 3. Reiniciar
sudo systemctl restart obsidita

# 4. Monitorear
watch -n 2 'free -h'
```

**Largo plazo:**
```bash
# 1. Revisar OPTIMIZACION_RECURSOS_LIMITADOS.md
# 2. Ajustar límites en .env:
#    - MAX_NOTE_MB=10
#    - MAX_UPLOAD_MB=20
#    - SEARCH_MAX_SCANNED_MB=50
# 3. Considerar actualizar VPS a 2GB+ RAM
```

**Prevención:**
- Crear swap de 2-3x RAM disponible
- Usar NODE_OPTIONS="--max-old-space-size=512"
- Monitorear memoria regularmente

---

### Error: "Aplicación lenta / congela"

**Síntoma:** Interfaz web responde muy lentamente.

**Causa:** Memoria en límite, mucho swap activo.

**Diagnóstico:**
```bash
# Ver si hay swap activo
free -h
# Si Swap "used" es alto, es el problema

# Ver cuánto escriba en disco
vmstat 1 5
# Si "wa" (wait I/O) > 50%, es problema de swap

# Ver proceso Node
ps aux | grep node | grep -v grep
```

**Solución:**

```bash
# 1. Aumentar memoria disponible
# Opción A: Ampliar swap
sudo fallocate -l 1G /swapfile2
sudo mkswap /swapfile2
sudo swapon /swapfile2

# Opción B: Reducir búsqueda indexada
sudo nano /opt/obsidita/.env
# SEARCH_MAX_SCANNED_MB=25
# SEARCH_MAX_FILE_MB=0.5

# Opción C: Reducir límites
# MAX_NOTE_MB=5
# MAX_UPLOAD_MB=10

# 2. Reiniciar
sudo systemctl restart obsidita

# 3. Verificar mejora
free -h
vmstat 1 5
```

---

## 🌐 Errores de Nginx

### Error: "502 Bad Gateway"

**Página:** Error 502 del navegador.

**Causa:** Node.js no está corriendo o no responde.

**Diagnóstico:**
```bash
# 1. Ver si Node corre
sudo systemctl status obsidita

# 2. Ver si escucha en 3000
sudo lsof -i :3000

# 3. Ver logs
sudo journalctl -u obsidita -n 20
```

**Soluciones:**

```bash
# 1. Iniciar Obsidita
sudo systemctl start obsidita

# 2. Esperar que arranque
sleep 3

# 3. Probar conexión directa
curl -v http://127.0.0.1:3000

# 4. Si funciona, problema en Nginx
# Si no, problema en Node

# 5. Si problema en Node, ver logs
sudo journalctl -u obsidita -f
```

**Si Nginx está mal configurado:**
```bash
# 1. Verificar sintaxis
sudo nginx -t

# 2. Ver errores específicos
sudo nano /etc/nginx/sites-available/obsidita
# Buscar errores como:
# - upstream mal escrito
# - puertos incorrectos

# 3. Recargar
sudo systemctl reload nginx

# 4. Ver logs de Nginx
tail -f /var/log/nginx/obsidita-error.log
```

---

### Error: "Connection timeout / timeout en operaciones grandes"

**Síntoma:** Cargar archivos grandes, búsquedas toman demasiado tiempo.

**Causa:** Timeouts de Nginx demasiado cortos.

**Solución:**

```bash
# Editar configuración Nginx
sudo nano /etc/nginx/sites-available/obsidita

# Encontrar sección location / y añadir:
proxy_connect_timeout 120s;
proxy_send_timeout 120s;
proxy_read_timeout 120s;

# También aumentar client_max_body_size si es necesario:
client_max_body_size 100M;

# Verificar y recargar
sudo nginx -t
sudo systemctl reload nginx
```

---

### Error: "SSL certificate expired / Invalid certificate"

**Mensaje:**
```
SEC_ERROR_EXPIRED_CERTIFICATE
o
curl: (60) SSL: certificate problem
```

**Causa:** Certificado Let's Encrypt expirado (no se auto-renovó).

**Diagnóstico:**
```bash
# Ver fecha de expiración
sudo openssl x509 -in /etc/letsencrypt/live/tu-dominio.com/cert.pem -noout -dates

# Ver certificados disponibles
sudo certbot certificates

# Ver estado de renovación
sudo systemctl status certbot.timer
```

**Solución:**

```bash
# 1. Renovar manualmente
sudo certbot renew --force-renewal

# 2. Verificar
sudo openssl x509 -in /etc/letsencrypt/live/tu-dominio.com/cert.pem -noout -dates

# 3. Recargar Nginx
sudo systemctl reload nginx
```

**Prevención:**
```bash
# Verificar que auto-renovación está activa
sudo systemctl enable certbot.timer
sudo systemctl enable certbot.service

# Ver logs de renovación
sudo journalctl -u certbot -n 20
```

---

## 🔐 Errores de Autenticación

### Error: "Too many failed login attempts"

**Mensaje:**
```
{"error": "Too many attempts, try again later"}
or
403 Forbidden
```

**Causa:** Rate limiter de login activado por intentos fallidos.

**Diagnóstico:**
```bash
# Ver intentos en logs
sudo journalctl -u obsidita | grep -i "login\|auth" | tail -10

# Ver IP que intenta
sudo journalctl -u obsidita | grep "failed" | tail -5
```

**Solución:**

```bash
# 1. Esperar 15 minutos (se resetea automáticamente)

# 2. O limpiar base de datos de sesiones
sudo systemctl stop obsidita
sudo rm -rf /opt/obsidita/data/sessions/*
sudo systemctl start obsidita

# 3. Verificar contraseña
# Si olvidaste contraseña, ver "Error: Lost password"
```

**Prevención:**
- Usar contraseña fuerte
- Asegurar que TRUST_PROXY=1 en .env si usas Nginx

---

### Error: "Invalid session / Session expired"

**Síntoma:** Se desconecta aleatoriamente durante el día.

**Causa:** Sesión expirada por inactividad o tiempo máximo.

**Solución:**

```bash
# Aumentar duración de sesiones en .env
sudo nano /opt/obsidita/.env

# Cambiar (por defecto son 7 y 7 días):
SESSION_MAX_DAYS=30      # Válido por máximo 30 días
SESSION_IDLE_DAYS=14     # Expira por 14 días de inactividad

# Reiniciar
sudo systemctl restart obsidita
```

---

### Error: "Lost password - no recovery option"

**Problema:** Olvidaste la contraseña y no hay opción de recuperación.

**Solución:**

```bash
# 1. Detener servicio
sudo systemctl stop obsidita

# 2. Ver archivo config
cat /opt/obsidita/data/config.json

# 3. Resetear contraseña (borrar hash)
sudo nano /opt/obsidita/data/config.json

# Buscar y cambiar:
# "passwordHash": "algo-largo"
# A:
# "passwordHash": ""

# 4. Guardar (Ctrl+X, Y, Enter)

# 5. Iniciar
sudo systemctl start obsidita

# 6. Acceder a setup
# http://dominio.com/api/setup
# Crear nueva contraseña
```

---

## 🔍 Errores de Búsqueda

### Error: "Búsqueda lenta o no funciona"

**Síntoma:** Búsquedas tardan > 10 segundos o no devuelven resultados.

**Causa:** Índice corrupto o demasiado grande.

**Diagnóstico:**
```bash
# Ver si busca
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"test"}'

# Ver logs
sudo journalctl -u obsidita | grep -i search
```

**Solución:**

```bash
# 1. Detener servicio
sudo systemctl stop obsidita

# 2. Limpiar caché de búsqueda
sudo rm -rf /opt/obsidita/data/.search*

# 3. Iniciar
sudo systemctl start obsidita

# 4. La búsqueda se reindexará automáticamente
# (puede tardar con vaults grandes)

# 5. Reducir límites si es por memoria
sudo nano /opt/obsidita/.env
# SEARCH_MAX_SCANNED_MB=50
```

---

### Error: "Search: Out of memory"

**Mensaje en logs:**
```
FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed
search index size exceeded
```

**Causa:** Vault muy grande para memoria disponible.

**Solución:**

```bash
# 1. Reducir archivos indexados en .env
sudo nano /opt/obsidita/.env

SEARCH_MAX_SCANNED_MB=50    # Por defecto 200
SEARCH_MAX_FILE_MB=0.5      # No indexar > 500 KB

# 2. Reiniciar
sudo systemctl restart obsidita

# 3. Si aún falla, reducir más
SEARCH_MAX_SCANNED_MB=25
SEARCH_MAX_FILE_MB=0.2
```

---

## 📂 Errores de Permisos

### Error: "Permission denied / EACCES"

**Mensaje:**
```
EACCES: permission denied, open '/opt/obsidita/data/config.json'
```

**Causa:** Permisos de archivos/carpetas incorrectos.

**Diagnóstico:**
```bash
# Ver permisos actuales
ls -la /opt/obsidita/data/
ls -la /srv/vaults/

# Ver quién ejecuta el proceso
ps aux | grep "node server" | grep -v grep
```

**Solución:**

```bash
# 1. Reparar permisos (como root)
sudo chown -R obsidita:obsidita /opt/obsidita/data
sudo chown -R obsidita:obsidita /srv/vaults

# 2. Establecer permisos correctos
sudo chmod 700 /opt/obsidita/data
sudo chmod 600 /opt/obsidita/data/*
sudo chmod 700 /srv/vaults
sudo chmod 755 /srv/vaults/*/

# 3. Para archivos .env
sudo chmod 600 /opt/obsidita/.env
sudo chown obsidita:obsidita /opt/obsidita/.env

# 4. Reiniciar
sudo systemctl restart obsidita

# 5. Verificar
sudo systemctl status obsidita
```

---

## 🗄️ Errores de Base de Datos

### Error: "Cannot read/write files"

**Síntoma:** No puede guardar cambios en notas.

**Mensaje en logs:**
```
Error writing file
ENOENT: no such file or directory
```

**Causa:** Ruta del vault incorrecta o archivo eliminado.

**Solución:**

```bash
# 1. Verificar configuración
cat /opt/obsidita/data/config.json | grep -i vault

# 2. Verificar que carpeta existe
ls -la /srv/vaults/

# 3. Si no existe, crear
sudo mkdir -p /srv/vaults/mi-vault
sudo chown obsidita:obsidita /srv/vaults/mi-vault

# 4. Reconfigurar en Ajustes
# Ir a Settings > Vault
# Cambiar ruta a: /srv/vaults/mi-vault

# 5. Reiniciar
sudo systemctl restart obsidita
```

---

## ⚡ Errores de Rendimiento

### Error: "Server CPU muy alto (> 80%)"

**Síntoma:** CPU siempre > 80%, incluso sin hacer nada.

**Diagnóstico:**
```bash
# Ver qué consume CPU
ps aux --sort=-%cpu | head -10

# Monitor en tiempo real
top -b -n 1 | head -15

# Ver threads de Node
ps -eLf | grep node | wc -l
```

**Causas comunes:**

1. **Búsqueda reindexando vault grande**
   ```bash
   # Esperar a que termine reindexación
   # O reducir límites de búsqueda
   ```

2. **Sincronización corriendo**
   ```bash
   # Ver si GitHub/Dropbox sync está activo
   # Esperar a que termine
   ```

3. **Leak de memoria (proceso creciendo)**
   ```bash
   # Reiniciar
   sudo systemctl restart obsidita
   ```

---

### Error: "Disco lleno / No space left"

**Mensaje:**
```
ENOSPC: no space left on device
```

**Diagnóstico:**
```bash
# Ver espacio disponible
df -h

# Ver carpetas grandes
du -sh /opt/obsidita/* /srv/vaults/*

# Ver tamaño de datos
du -sh /opt/obsidita/data
```

**Soluciones:**

**Corto plazo:**
```bash
# 1. Limpiar logs antiguos
sudo journalctl --vacuum=7d

# 2. Limpiar caché de npm
npm cache clean --force

# 3. Eliminar backups antiguos
sudo rm /backup/obsidita/backup_*.tar.gz  # Borrar seleccionadamente

# 4. Comprimir logs
gzip /var/log/*.log
```

**Largo plazo:**
```bash
# 1. Aumentar espacio en disco (VPS)
# 2. Mover vaults a otra partición
# 3. Reducir tamaño de vaults (eliminar adjuntos no usados)
```

---

## ✨ Errores de la Edición con IA

Los errores de la barra de IA y del botón **Probar** de Ajustes → IA (clave no válida, modelo inexistente, sin saldo, sin respuesta a tiempo...) están explicados uno a uno en [Edición con IA → Problemas frecuentes](IA.md#-problemas-frecuentes). El mensaje incluye el código HTTP y el motivo que da el proveedor, por ejemplo `(HTTP 404: ... model ... not found)`.

---

## 🐛 Errores Generales

### Error: "Unexpected token in JSON"

**Mensaje:**
```
SyntaxError: Unexpected token < in JSON at position 0
or
Invalid JSON in config.json
```

**Causa:** Archivo .env o config.json está corrupto.

**Solución:**

```bash
# 1. Verificar .env
cat /opt/obsidita/.env | head -5

# Si parece corrupto:
sudo nano /opt/obsidita/.env
# Limpiar caracteres raros, comillas mal cerradas

# 2. Verificar config.json
cat /opt/obsidita/data/config.json

# Validar JSON online si es complejo

# 3. Si config está corrupto, restaurar backup
sudo cp /backup/obsidita/*/opt/obsidita/data/config.json \
  /opt/obsidita/data/config.json

# 4. Reiniciar
sudo systemctl restart obsidita
```

---

### Error: "Cannot find module"

**Mensaje:**
```
Error: Cannot find module 'express'
or
Module not found: '@codemirror/view'
```

**Causa:** Dependencias no instaladas o parcialmente.

**Solución:**

```bash
# 1. Reinstalar dependencias
cd /opt/obsidita
sudo -u obsidita npm install --omit=dev

# 2. Si aún falla, limpiar todo
sudo -u obsidita rm -rf node_modules package-lock.json
sudo -u obsidita npm install --omit=dev

# 3. Verificar
node server/index.js --version

# 4. Reiniciar servicio
sudo systemctl restart obsidita
```

---

## 🎯 Checklist de Troubleshooting

Usa esto cuando algo falla:

```bash
#!/bin/bash
echo "🔍 CHECKLIST DE TROUBLESHOOTING"

# 1. Estado del servicio
echo "1. Estado del servicio:"
sudo systemctl status obsidita --no-pager | head -5

# 2. Logs recientes
echo ""
echo "2. Últimos errores:"
sudo journalctl -u obsidita -n 10 --no-pager

# 3. Memoria
echo ""
echo "3. Memoria:"
free -h

# 4. Puertos
echo ""
echo "4. Puertos en escucha:"
sudo lsof -i :3000 :80 :443 2>/dev/null || echo "Instala: apt install lsof"

# 5. Espacio
echo ""
echo "5. Espacio en disco:"
df -h | grep -E "Filesystem|/opt|/srv|/$"

# 6. Procesos
echo ""
echo "6. Proceso Node:"
ps aux | grep "node server" | grep -v grep || echo "No corriendo"

# 7. Archivo config
echo ""
echo "7. Config existe:"
[ -f /opt/obsidita/data/config.json ] && echo "✓ Existe" || echo "✗ No existe"
```

**Usar:**
```bash
chmod +x troubleshoot.sh
./troubleshoot.sh
```

---

## 📞 Si Nada Funciona

1. **Revisar logs completos:**
   ```bash
   sudo journalctl -u obsidita -n 100 > /tmp/obsidita-logs.txt
   cat /tmp/obsidita-logs.txt
   ```

2. **Hacer respaldo:**
   ```bash
   tar -czf /tmp/obsidita-backup.tar.gz /opt/obsidita/data /srv/vaults
   ```

3. **Reinstalar limpio:**
   ```bash
   sudo systemctl stop obsidita
   sudo rm -rf /opt/obsidita/data/config.json
   sudo systemctl start obsidita
   # Acceder a http://tu-dominio.com/api/setup
   ```

4. **Buscar en documentación:**
   - `INSTALACION_Y_CONFIGURACION.md` → Troubleshooting
   - `OPTIMIZACION_RECURSOS_LIMITADOS.md` → Troubleshooting

5. **Reportar issue en GitHub:**
   - Incluir logs (comando anterior)
   - Especificar versión Node.js, Nginx
   - Describir pasos para reproducir

---

**Última actualización:** 2026-10-16  
**Versión:** 1.0

💡 **Tip:** Mantén backups regulares para recuperarte rápidamente de cualquier error.
