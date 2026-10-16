# 🧰 Documentación técnica

Esta carpeta reúne todo lo necesario para **modificar, mejorar, mantener o actualizar** Obsidita. Para instalar y usar la app basta con el [README principal](../README.md).

| Archivo | Para qué sirve | Léelo si… |
| :--- | :--- | :--- |
| [USO.md](USO.md) | Guía de uso de la web: editor, wikilinks, propiedades, búsqueda, etiquetas, plantillas, papelera, historial y descarga del vault. | Quieres sacarle todo el partido a la app. |
| [DESARROLLO.md](DESARROLLO.md) | Entorno de desarrollo, scripts, convenciones, recetas para cambios habituales, comprobaciones antes de publicar y hoja de ruta. | Vas a tocar el código. **Empieza por aquí.** |
| [ARQUITECTURA.md](ARQUITECTURA.md) | Estructura del proyecto, flujos internos, dónde está cada medida de seguridad, archivos de `data/` y referencia completa de la API. | Necesitas entender cómo funciona algo por dentro. |
| [MANTENIMIENTO.md](MANTENIMIENTO.md) | Actualizar una instalación, copias de seguridad, recuperar la contraseña, cerrar sesiones, referencia de variables de entorno y límites. | Administras una instalación en un servidor. |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Errores frecuentes con su causa y solución, y cómo reunir información para reportar un fallo. | Algo no funciona. |
| [diagnose.sh](diagnose.sh) | Script que revisa Node, dependencias, configuración, vault, build, permisos y puerto. | Quieres un primer diagnóstico automático. |

```bash
./utils/diagnose.sh     # desde cualquier carpeta
```
