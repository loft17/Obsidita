# 📚 Documentación de Obsidita - Índice Completo

Bienvenido a la documentación completa de **Obsidita** (Obsidian Web). Aquí encontrarás todo lo que necesitas para instalar, configurar y mantener tu aplicación.

---

## 📖 Documentación Disponible

### 1. **Atajos.md** ⌨️
- **Tamaño:** 92 líneas
- **Tiempo de lectura:** 5 minutos
- **Para quién:** Usuarios finales
- **Contenido:**
  - Atajos globales (Ctrl+P, S, E, B, etc.)
  - Atajos del editor
  - Atajos en búsqueda y diálogos
  - Notas para dispositivos móviles

👉 **Leer si:** Quieres conocer todos los atajos de teclado.

---

### 2. **INSTALACION_Y_CONFIGURACION.md** 🚀
- **Tamaño:** 1139 líneas (~23 KB)
- **Tiempo de lectura:** 30-45 minutos
- **Para quién:** Administradores, DevOps
- **Contenido:**
  - ✅ Requisitos del sistema (mínimos y recomendados)
  - ✅ Instalación paso a paso en Linux/macOS/Windows
  - ✅ Instalación en producción con systemd
  - ✅ **Configuración completa con Nginx**
  - ✅ Configuración HTTPS con Let's Encrypt
  - ✅ Todas las variables de entorno documentadas
  - ✅ Seguridad (firewall, SSL, rate limiting)
  - ✅ Administración del servicio
  - ✅ Monitoreo y logs
  - ✅ Troubleshooting completo
  - ✅ Backup y recuperación
  - ✅ Optimizaciones avanzadas

👉 **LEER PRIMERO si:** Es tu primera instalación en producción.

---

### 3. **OPTIMIZACION_RECURSOS_LIMITADOS.md** 💪
- **Tamaño:** 519 líneas (~11 KB)
- **Tiempo de lectura:** 20-30 minutos
- **Para quién:** Usuarios con VPS pequeños (512 MB - 2 GB RAM)
- **Contenido:**
  - ✅ Tabla de requisitos por RAM disponible
  - ✅ Configuración y expansión de swap
  - ✅ Configuración de Node.js para poca memoria
  - ✅ **Optimización de búsqueda (impacto crítico)**
  - ✅ Reducción de dependencias
  - ✅ Limitaciones de tamaño
  - ✅ Compilación remota (si falla localmente)
  - ✅ Monitoreo de memoria
  - ✅ Cgroups y limitaciones de procesos
  - ✅ Caché en Nginx
  - ✅ Troubleshooting específico

👉 **LEER SI:** Tu VPS tiene < 2 GB RAM (como tu caso).

---

### 4. **SCRIPTS_LISTOS.md** ⚡
- **Tamaño:** 570 líneas (~12 KB)
- **Tiempo de lectura:** 15-20 minutos (leer para entender, copiar para usar)
- **Para quién:** Todos (automatización)
- **Contenido:**
  - ✅ **Script de instalación automática completa**
  - ✅ Script de monitoreo de memoria
  - ✅ Script de diagnóstico
  - ✅ Script de actualización sin riesgos
  - ✅ Comandos rápidos útiles
  - ✅ Comandos de emergencia
  - ✅ Checklist de verificación

👉 **USAR PARA:** Instalación rápida, automática y sin errores.

---

## 🎯 Guía de Lectura Recomendada

### Escenario 1: Primera Instalación en Producción

1. **INSTALACION_Y_CONFIGURACION.md** - Lee secciones:
   - Requisitos del Sistema
   - Instalación en Producción
   - Configuración con Nginx
   - Seguridad

2. **SCRIPTS_LISTOS.md** - Usa:
   - Script de Instalación Rápida

3. **Atajos.md** - Muestra a usuarios

---

### Escenario 2: VPS Pequeño (Tu caso)

1. **OPTIMIZACION_RECURSOS_LIMITADOS.md** - Lee TODO:
   - Tabla de requisitos
   - Pasos 1-7
   - Troubleshooting

2. **INSTALACION_Y_CONFIGURACION.md** - Lee solo:
   - Seguridad
   - Administración del Sistema

3. **SCRIPTS_LISTOS.md** - Usa:
   - Script de instalación (leyendo primero)
   - Scripts de monitoreo

---

### Escenario 3: Mantenimiento y Administración

1. **INSTALACION_Y_CONFIGURACION.md** - Secciones:
   - Administración del Sistema
   - Monitoreo y Logs
   - Troubleshooting

2. **SCRIPTS_LISTOS.md** - Comandos útiles:
   - Ver estado en tiempo real
   - Reiniciar y diagnosticar
   - Comandos de emergencia

---

### Escenario 4: Optimizar Sistema Existente

1. **OPTIMIZACION_RECURSOS_LIMITADOS.md** - Lee secciones:
   - Paso 2-3 (Node.js y búsqueda)
   - Paso 7-8 (Nginx caché)
   - Monitoreo

2. **SCRIPTS_LISTOS.md** - Usa:
   - Script de monitoreo
   - Script de diagnóstico

---

## 📊 Estadísticas de Documentación

```
Total de documentos:    4
Líneas totales:         2,320
Tamaño total:           49 KB
Tiempo total lectura:   ~60-90 minutos (leyendo TODO)
Tiempo instalación:     30 minutos (script automático)
```

---

## 🔍 Búsqueda Rápida por Tema

### Instalación

- **Instalación rápida:** SCRIPTS_LISTOS.md → Script Completo
- **Instalación detallada:** INSTALACION_Y_CONFIGURACION.md → Instalación Básica
- **Instalación en producción:** INSTALACION_Y_CONFIGURACION.md → Instalación en Producción

### Configuración

- **Nginx:** INSTALACION_Y_CONFIGURACION.md → Configuración con Nginx
- **HTTPS:** INSTALACION_Y_CONFIGURACION.md → Configuración HTTPS
- **Variables de entorno:** INSTALACION_Y_CONFIGURACION.md → Variables de Entorno
- **Recursos limitados:** OPTIMIZACION_RECURSOS_LIMITADOS.md → TODO

### Administración

- **Gestionar servicio:** INSTALACION_Y_CONFIGURACION.md → Administración del Sistema
- **Ver logs:** INSTALACION_Y_CONFIGURACION.md → Monitoreo y Logs
- **Troubleshooting:** INSTALACION_Y_CONFIGURACION.md → Troubleshooting
- **Actualizar:** SCRIPTS_LISTOS.md → Script de Actualización

### Seguridad

- **Seguridad:** INSTALACION_Y_CONFIGURACION.md → Seguridad
- **Firewall:** INSTALACION_Y_CONFIGURACION.md → Seguridad → Firewall
- **SSL/HTTPS:** INSTALACION_Y_CONFIGURACION.md → Configuración HTTPS

### Monitoreo

- **Monitoreo básico:** OPTIMIZACION_RECURSOS_LIMITADOS.md → Monitoreo de Memoria
- **Monitoreo avanzado:** INSTALACION_Y_CONFIGURACION.md → Monitoreo y Logs
- **Scripts de monitoreo:** SCRIPTS_LISTOS.md → Script de Monitoreo

### Backup

- **Backup manual:** INSTALACION_Y_CONFIGURACION.md → Respaldo y Recuperación
- **Backup automático:** INSTALACION_Y_CONFIGURACION.md → Respaldo y Recuperación
- **Restaurar:** INSTALACION_Y_CONFIGURACION.md → Respaldo y Recuperación

### Rendimiento

- **Poca memoria:** OPTIMIZACION_RECURSOS_LIMITADOS.md → TODO
- **Caché:** INSTALACION_Y_CONFIGURACION.md → Optimizaciones Avanzadas
- **Múltiples instancias:** INSTALACION_Y_CONFIGURACION.md → Optimizaciones Avanzadas

---

## 💡 Tips y Tricks

### Para ahorrar tiempo:

1. **Instalación automática:** Usa `SCRIPTS_LISTOS.md` → Script Completo de Instalación
2. **Verificar estado:** `sudo systemctl status obsidita`
3. **Ver logs:** `sudo journalctl -u obsidita -f`
4. **Reiniciar:** `sudo systemctl restart obsidita`

### Para solucionar problemas:

1. Ver logs: `sudo journalctl -u obsidita -n 50`
2. Diagnosticar: Usa script en SCRIPTS_LISTOS.md
3. Buscar solución en INSTALACION_Y_CONFIGURACION.md → Troubleshooting
4. Si es por memoria: OPTIMIZACION_RECURSOS_LIMITADOS.md

### Para producción:

1. Lee INSTALACION_Y_CONFIGURACION.md completo
2. Configura HTTPS con Let's Encrypt
3. Habilita firewall y rate limiting
4. Crea backups automáticos
5. Monitorea logs regularmente

---

## 📋 Checklist Antes de Ir a Producción

- [ ] He leído INSTALACION_Y_CONFIGURACION.md
- [ ] He creado backups
- [ ] Tengo HTTPS configurado
- [ ] Firewall está activo
- [ ] Rate limiting está activado
- [ ] Monitoreo está en lugar
- [ ] Tengo plan de recuperación ante fallos
- [ ] He probado restore de backup
- [ ] Permisos de archivos son correctos
- [ ] .env está protegido (chmod 600)

---

## 🆘 Necesito Ayuda

### Error durante instalación
→ Ve a INSTALACION_Y_CONFIGURACION.md → Troubleshooting

### VPS con poca memoria
→ Ve a OPTIMIZACION_RECURSOS_LIMITADOS.md

### La aplicación no inicia
→ Ve a SCRIPTS_LISTOS.md → Comandos Útiles Rápidos

### ¿Cómo veo los logs?
→ Ve a INSTALACION_Y_CONFIGURACION.md → Monitoreo y Logs

### ¿Cómo actualizo?
→ Ve a SCRIPTS_LISTOS.md → Script de Actualización

### ¿Cómo respaldar?
→ Ve a INSTALACION_Y_CONFIGURACION.md → Respaldo y Recuperación

---

## 📝 Notas Importantes

### Tu VPS (854 MB RAM)

Según tu configuración actual:
- ✅ Instalación posible con optimizaciones
- ✅ Swap de 2-3 GB necesario
- ⚠️ SEARCH_MAX_SCANNED_MB debe estar en 50 o menos
- ⚠️ No cargar vaults muy grandes
- ⚠️ Monitorear memoria constantemente

**Pasos críticos para ti:**
1. Lee OPTIMIZACION_RECURSOS_LIMITADOS.md
2. Usa script con NODE_OPTIONS correctos
3. Configura búsqueda con límites bajos
4. Mantén monitoreo activo

---

## 🔄 Versionado

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0 | 2026-10-16 | Documentación inicial completa |

---

## 📞 Soporte y Recursos

**Documentación local:**
- `Atajos.md` - Teclado
- `INSTALACION_Y_CONFIGURACION.md` - Manual principal
- `OPTIMIZACION_RECURSOS_LIMITADOS.md` - VPS pequeños
- `SCRIPTS_LISTOS.md` - Automatización

**Recursos externos:**
- [GitHub](https://github.com/tu-usuario/Obsidian-Web)
- [Obsidian Help](https://help.obsidian.md)
- [Node.js Docs](https://nodejs.org/docs/)
- [Nginx Docs](https://nginx.org/en/docs/)

---

**¡Gracias por usar Obsidita!** 🚀

Si estas notas te ayudaron, comparte tu feedback en el repositorio.

---

*Última actualización: 2026-10-16*  
*Documentación Versión 1.0*
