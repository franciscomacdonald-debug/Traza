export const TRAZA_MODULES = [
  { id: "ambiental", name: "Medio Ambiente", icon: "🌿", path: "/ambiental", desc: "Inspecciones y cumplimiento ambiental" },
  { id: "avances", name: "Control de Avances", icon: "📈", path: "/avances", desc: "Programación, mediciones y visaciones" },
  { id: "documental", name: "Gestión Documental", icon: "📁", path: "/documental", desc: "Archivos, versiones y aprobaciones" },
  { id: "prevencion", name: "Prevención de Riesgos", icon: "🦺", path: "/prevencion", desc: "Seguridad, incidentes y medidas" },
  { id: "calidad", name: "Control de Calidad", icon: "✅", path: "/calidad", desc: "Protocolos y no conformidades" },
  { id: "topografia", name: "Topografía", icon: "📐", path: "/topografia", desc: "Cotas, replanteos y cubicaciones" },
  { id: "laboratorio", name: "Laboratorio", icon: "🧪", path: "/laboratorio", desc: "Muestras, ensayos y resultados" },
  { id: "comunidad", name: "Participación Ciudadana", icon: "👥", path: "/comunidad", desc: "Solicitudes y compromisos comunitarios" },
] as const;
export type ModuleId = (typeof TRAZA_MODULES)[number]["id"];
export type AccessLevel = "view" | "edit" | "approve" | "admin";
