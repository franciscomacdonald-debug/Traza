"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AccessLevel } from "@/lib/modules";
import styles from "./SavedReportDetail.module.css";

type SnapshotFinding = { id?: string; title?: string; description?: string; status?: string; closure_notes?: string | null };
type SnapshotPhoto = { id?: string; description?: string | null; original_file_path?: string };
type Snapshot = {
  schema_version?: number;
  inspection?: { id?: string; title?: string | null; inspection_date?: string; general_notes?: string | null; weather_notes?: string | null; status?: string };
  findings?: SnapshotFinding[];
  photos?: SnapshotPhoto[];
  project?: { id?: string; name?: string };
  prepared_at?: string;
};
type SavedReport = {
  id: string; project_id: string; title: string; report_type: string; status: string;
  version_number: number; executive_summary: string | null; conclusions: string | null;
  report_snapshot: Snapshot | null; created_at: string;
};

type Props = { reportId: string; projectId: string; accessLevel: AccessLevel; onClose: () => void; onSaved: () => void };

function date(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s.length === 10 ? `${s}T12:00:00` : s);
  return Number.isNaN(d.valueOf()) ? s : d.toLocaleDateString("es-CL");
}

export default function SavedReportDetail({ reportId, projectId, accessLevel, onClose, onSaved }: Props) {
  const [report, setReport] = useState<SavedReport | null>(null);
  const [summary, setSummary] = useState("");
  const [conclusions, setConclusions] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const canEdit = report?.status === "draft" && ["admin", "approve", "edit"].includes(accessLevel);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError(""); setMessage(""); setReport(null);
      if (!supabase) { setError("No hay conexión con Supabase."); setLoading(false); return; }
      const { data, error: queryError } = await supabase.from("environmental_reports")
        .select("id,project_id,title,report_type,status,version_number,executive_summary,conclusions,report_snapshot,created_at")
        .eq("project_id", projectId).eq("id", reportId).eq("report_type", "inspection").maybeSingle();
      if (cancelled) return;
      if (queryError) setError(queryError.message);
      else if (!data) setError("No se encontró el informe o no tienes acceso a él.");
      else {
        const row = data as SavedReport;
        setReport(row); setSummary(row.executive_summary ?? ""); setConclusions(row.conclusions ?? "");
      }
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [reportId, projectId]);

  async function save() {
    if (!supabase || !report || !canEdit || saving) return;
    setSaving(true); setError(""); setMessage("");
    const { error: rpcError } = await supabase.rpc("update_environmental_report_draft", {
      p_report_id: report.id, p_executive_summary: summary, p_conclusions: conclusions,
    });
    if (rpcError) setError(rpcError.message);
    else {
      setReport((prior) => prior ? { ...prior, executive_summary: summary.trim() || null, conclusions: conclusions.trim() || null } : prior);
      setMessage("Cambios guardados en este borrador. El informe aún no está aprobado.");
      onSaved();
    }
    setSaving(false);
  }

  const snap = report?.report_snapshot;
  const findings = Array.isArray(snap?.findings) ? snap.findings : [];
  const photos = Array.isArray(snap?.photos) ? snap.photos : [];
  return <section className={styles.panel} aria-label="Detalle de informe guardado">
    <div className={styles.heading}><div><h4>Informe guardado · Versión {report?.version_number ?? "—"}</h4>
      <p>{report?.title ?? "Consulta del documento"}</p></div>
      <button type="button" className={styles.close} onClick={onClose}>Cerrar detalle</button></div>
    {loading && <p className={styles.note}>Cargando copia guardada…</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {message && <p className={styles.success} role="status">{message}</p>}
    {report && <>
      <p className={styles.note}>Esta vista utiliza el contenido guardado del informe; no se actualiza automáticamente con cambios posteriores de la inspección.</p>
      <div className={styles.grid}>
        <div className={styles.field}><small>Estado</small><strong>{report.status}</strong></div>
        <div className={styles.field}><small>Registrado</small><strong>{date(report.created_at)}</strong></div>
        <div className={styles.field}><small>Inspección original</small><strong>{snap?.inspection?.title || "No identificada"}</strong></div>
        <div className={styles.field}><small>Fecha de inspección</small><strong>{date(snap?.inspection?.inspection_date)}</strong></div>
      </div>
      <div className={styles.section}><h5>Antecedentes registrados</h5><p>{snap?.inspection?.general_notes || "Sin observaciones generales."}</p></div>
      <div className={styles.section}><h5>Condiciones meteorológicas</h5><p>{snap?.inspection?.weather_notes || "Sin antecedentes registrados."}</p></div>
      <div className={styles.section}><h5>Hallazgos incorporados ({findings.length})</h5>
        {findings.length ? <ul>{findings.map((f, i) => <li key={f.id ?? i}><strong>{f.title || "Hallazgo"}</strong> — {f.description || "Sin descripción"} ({f.status || "sin estado"})</li>)}</ul> : <p>Sin hallazgos en esta versión.</p>}
      </div>
      <div className={styles.section}><h5>Fotografías referenciadas ({photos.length})</h5><p>Se conservan los identificadores y rutas privadas de las fotografías asociadas al momento de crear el informe.</p></div>
      {canEdit ? <div className={styles.form}>
        <label>Resumen ejecutivo<textarea value={summary} onChange={(e) => setSummary(e.target.value)} disabled={saving}/></label>
        <label>Conclusiones<textarea value={conclusions} onChange={(e) => setConclusions(e.target.value)} disabled={saving}/></label>
        <div className={styles.actions}><button type="button" className={styles.save} onClick={() => void save()} disabled={saving}>{saving ? "Guardando…" : "Guardar cambios del borrador"}</button>
          <span className={styles.note}>Solo usuarios autorizados pueden editar; Supabase verifica rol AIF y estado.</span></div>
      </div> : <>
        <div className={styles.section}><h5>Resumen ejecutivo</h5><p>{report.executive_summary || "Sin resumen guardado."}</p></div>
        <div className={styles.section}><h5>Conclusiones</h5><p>{report.conclusions || "Sin conclusiones guardadas."}</p></div>
        <p className={styles.note}>El contenido no puede editarse desde esta pantalla porque el informe no está en borrador o no tienes autorización.</p>
      </>}
    </>}
  </section>;
}
