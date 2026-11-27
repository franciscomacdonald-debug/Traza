"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AccessLevel } from "@/lib/modules";
import styles from "./ReportLifecycle.module.css";
import SavedReportDetail from "./SavedReportDetail";

type Report = {
  id: string;
  title: string;
  created_at: string;
  status: string;
  version_number: number;
  previous_report_id: string | null;
  report_number: string | null;
  approved_at: string | null;
  issued_at: string | null;
};

const statusLabels: Record<string, string> = {
  draft: "Borrador", generated: "Generado", under_review: "En revisión",
  approved: "Aprobado", issued: "Emitido", superseded: "Reemplazado",
};
const formatDate = (s: string | null) => s ? new Date(s).toLocaleString("es-CL") : "—";

type Props = { projectId: string; accessLevel: AccessLevel; reloadToken?: number };
export default function ReportLifecycle({ projectId, accessLevel, reloadToken = 0 }: Props) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  // Estos controles son orientativos. Los RPC comprueban el rol AIF y el permiso modular real.
  const canEdit = ["admin", "approve", "edit"].includes(accessLevel);
  const canApprove = ["admin", "approve"].includes(accessLevel);

  const load = useCallback(async () => {
    if (!supabase || !projectId) { setReports([]); return; }
    setLoading(true);
    const { data, error: queryError } = await supabase.from("environmental_reports")
      .select("id,title,created_at,status,version_number,previous_report_id,report_number,approved_at,issued_at")
      .eq("project_id", projectId).eq("report_type", "inspection")
      .order("created_at", { ascending: false }).limit(100);
    if (queryError) setError(queryError.message);
    else { setReports((data ?? []) as Report[]); setError(""); }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load, reloadToken]);

  async function transition(report: Report, action: "review" | "approve" | "revision") {
    if (!supabase || busyId) return;
    const labels = { review: "enviar a revisión", approve: "aprobar", revision: "crear una revisión" };
    if (!window.confirm(`¿Confirmas ${labels[action]} del informe «${report.title}», versión ${report.version_number}?`)) return;
    setBusyId(report.id); setError(""); setMessage("");
    const rpc = action === "review" ? "submit_report_for_review" : action === "approve" ? "approve_environmental_report" : "create_report_revision";
    const { data, error: rpcError } = await supabase.rpc(rpc, { p_report_id: report.id, p_work_identity_id: null });
    if (rpcError) setError(`No se pudo completar la acción: ${rpcError.message}`);
    else {
      setMessage(action === "revision" ? `Nueva revisión creada (${String(data ?? "sin identificador")}). Se guardó como borrador; aún falta una pantalla para editar su contenido.` : action === "review" ? "Informe enviado a revisión." : "Informe aprobado. Todavía NO está emitido oficialmente.");
      await load();
    }
    setBusyId(null);
  }

  return <section className={styles.panel} aria-label="Gestión formal de informes">
    <div className={styles.header}><div><h3>Informes registrados y versiones</h3><p>Las acciones oficiales se ejecutan en Supabase y quedan auditadas. La emisión del PDF permanece deshabilitada hasta verificar su almacenamiento.</p></div>
      <button type="button" onClick={() => void load()} disabled={loading || !!busyId}>Actualizar lista</button></div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {message && <p className={styles.success} role="status">{message}</p>}
    {loading && <p>Cargando informes…</p>}
    {!loading && !reports.length && <p>No existen informes de inspección guardados.</p>}
    {reports.map((r) => <article className={styles.item} key={r.id}>
      <div className={styles.row}>
        <div className={styles.details}><strong>{r.title}</strong><small>{r.report_number ? `N.º ${r.report_number} · ` : ""}Versión {r.version_number} · Creado: {formatDate(r.created_at)}</small>
          {r.previous_report_id && <small>Revisión del informe: {r.previous_report_id}</small>}
          {r.approved_at && <small>Aprobado: {formatDate(r.approved_at)}</small>}
          {r.issued_at && <small>Emitido: {formatDate(r.issued_at)}</small>}
        </div><span className={styles.status}>{statusLabels[r.status] || r.status}</span>
      </div>
      <div className={styles.actions}>
        <button type="button" disabled={!!busyId} onClick={() => setSelectedReportId((v) => v === r.id ? null : r.id)}>{selectedReportId === r.id ? "Ocultar informe guardado" : "Ver / editar informe guardado"}</button>
        {canEdit && ["draft", "generated"].includes(r.status) && <button type="button" disabled={!!busyId} onClick={() => void transition(r,"review")}>Enviar a revisión</button>}
        {canApprove && r.status === "under_review" && <button type="button" disabled={!!busyId} onClick={() => void transition(r,"approve")}>Aprobar informe</button>}
        {canEdit && r.status === "issued" && <button type="button" disabled={!!busyId} onClick={() => void transition(r,"revision")}>Crear nueva revisión</button>}
        {r.status === "approved" && <small>Pendiente de PDF oficial verificable en Storage para su emisión.</small>}
      </div>
      {selectedReportId === r.id && <SavedReportDetail key={r.id} reportId={r.id} projectId={projectId} accessLevel={accessLevel} onClose={() => setSelectedReportId(null)} onSaved={() => void load()} />}
    </article>)}
    <p className={styles.disclaimer}>La vista preliminar superior consulta datos actuales de la inspección. «Ver / editar informe guardado» muestra la copia registrada; solo sus campos de resumen y conclusiones pueden editarse cuando está en borrador. La emisión oficial del PDF permanece pendiente.</p>
  </section>;
}
