# TRAZA — carga de PDF en Gestión Documental Ambiental

## Orden de instalación
1. En Supabase SQL Editor, ejecutar **SUPABASE_STORAGE_DOCUMENTOS.sql**. Requiere que el bucket privado `traza-documents` y sus políticas SELECT/INSERT ya estén creados.
2. Subir a GitHub el contenido de este proyecto (reemplazando los archivos existentes en las mismas rutas). Vercel hará el despliegue si está conectado al repositorio.
3. Entrar a **Medio Ambiente → Documentos**. Abrir una fuente del proyecto y seleccionar **Agregar versión → Subir archivo PDF**; alternativamente usar **Subir PDF** dentro de una versión en borrador sin archivo.
4. Seleccionar PDF (máximo 20 MB). Al finalizar debe aparecer **PDF almacenado en TRAZA** y el botón **Ver PDF**.
5. Si corresponde, activar con perfil que tenga permiso `approve` y rol admitido. El archivo se abre con enlace firmado de 60 segundos.

## Diseño
- Bucket privado: `traza-documents`.
- Ruta de cada archivo: `projectId/ambiental/sourceId/versionId/uuid.pdf`.
- El navegador sube a Storage con sesión autenticada y `upsert:false`.
- Un procedimiento RPC `attach_project_environmental_source_version_file` verifica proyecto, rol, permiso, estado `draft`, ruta, existencia del archivo y lo asocia a la versión; deja auditoría.
- Los documentos centrales son de solo lectura. Las versiones activas no permiten cambiar el PDF.
- Las versiones antiguas con rutas locales de Windows **no se han migrado**: siguen siendo referencias inválidas. Crea una versión nueva para subir un archivo real.

## Limitaciones antes de usar en producción
- No se ha podido ejecutar `next build` con dependencias: validar el despliegue de Vercel y probar con sesiones reales.
- El bucket puede tener un límite distinto al máximo de 20 MB que aplica el navegador; configurar ambos según la necesidad.
- Si el PDF se carga, pero falla la vinculación RPC, puede quedar un archivo sin referencia. Se necesita una rutina de limpieza controlada por administradores.
- Las funciones antiguas aún aceptan rutas de archivo escritas manualmente vía RPC; debe incorporarse validación de existencia del archivo **también en la activación**, antes de usar documentos oficiales. La UI nueva sí exige archivos Storage o referencias HTTPS.
- Revisar las políticas de Storage para garantizar propiedad del documento, no solo permisos del proyecto, y hacer pruebas de subida/lectura entre proyectos.
