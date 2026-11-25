# TRAZA — Gestión Documental Ambiental

## Qué se incorporó
- Entrada **Documentos** en el menú lateral de `/ambiental`.
- Biblioteca de fuentes centrales y fuentes del proyecto seleccionado; filtros y búsqueda.
- Consulta de versiones, estados y rutas/referencias registradas.
- Formulario de fuentes del proyecto mediante RPC `create_project_environmental_source`.
- Formulario de versiones mediante RPC `create_project_environmental_source_version`.
- Activación de borradores mediante RPC `activate_project_environmental_source_version`.
- La interfaz respeta el nivel modular: `view` puede consultar, `edit` puede crear, `approve` puede activar, `admin` puede hacer ambas operaciones. La base de datos debe mantener sus propias comprobaciones de rol, RLS y permisos RPC.

## Dónde ingresar
1. Iniciar sesión en TRAZA y seleccionar un proyecto con módulo Ambiental habilitado.
2. Entrar a **Medio Ambiente** desde el inicio.
3. En el menú lateral elegir **Documentos**.

## Requisitos
- Variables públicas de Supabase existentes: `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Políticas SELECT en `environmental_sources` y `environmental_source_versions` y las tres RPC arriba mencionadas, creadas en las etapas previas.
- Usuario con proyecto activo y permisos modulares.

## Limitaciones importantes
- Esta versión **no sube archivos** a Supabase Storage. El campo `file_path` registra una ruta que debe existir; no hay verificación de existencia ni vínculo de descarga.
- La biblioteca **no es** el módulo general `/documental`, que continúa deshabilitado según permisos y alcance previo.
- No incluye pantallas de auditoría. La tabla `audit_log` está reservada a roles administrativos y requiere una vista independiente.
- Las fuentes `central` se muestran según su actual RLS, incluso si hay versiones en borrador; revisar esa política antes de habilitar distintas organizaciones.
- No se han probado las llamadas en un Supabase real desde esta copia. Verificar en navegador y en Vercel.
