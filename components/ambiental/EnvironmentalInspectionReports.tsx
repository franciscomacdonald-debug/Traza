"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AccessLevel } from "@/lib/modules";
import styles from "./EnvironmentalInspectionReports.module.css";

type Inspection = { id: string; title: string | null; inspection_date: string; status: string; general_notes: string | null; weather_notes: string | null; inspector_user_id: string };
type Finding = { id: string; title: string; description: string; classification: string; status: string; corrective_action_requested: string | null; due_date: string | null; closure_notes: string | null };
type Photo = { id: string; description: string | null; original_file_path: string; captured_at: string; url?: string };
type SavedReport = { id: string; title: string; created_at: string; status: string; version_number: number };
const fmt = (value?: string | null) => value ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString("es-CL") : "—";
const labels: Record<string, string> = { draft: "Borrador", in_progress: "En progreso", completed: "Completada", pending: "Pendiente", closed: "Cerrado", in_management: "En gestión", responded: "Respondido", closure_requested: "Cierre solicitado", overdue: "Vencido" };

export default function EnvironmentalInspectionReports({ projectId, projectName, accessLevel }: { projectId: string; projectName: string; accessLevel: AccessLevel }) {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [findings, setFindings] = useState<Finding[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [saved, setSaved] = useState<SavedReport[]>([]);
  const [summary, setSummary] = useState("");
  const [conclusions, setConclusions] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const inspection = useMemo(() => inspections.find((x) => x.id === selectedId), [inspections, selectedId]);
  const canDraft = accessLevel === "admin" || accessLevel === "approve" || accessLevel === "edit";

  const loadBase = useCallback(async () => {
    if (!supabase || !projectId) return;
    setLoading(true); setError("");
    const [i, r] = await Promise.all([
      supabase.from("inspections").select("id,title,inspection_date,status,general_notes,weather_notes,inspector_user_id").eq("project_id", projectId).order("inspection_date", { ascending: false }).limit(200),
      supabase.from("environmental_reports").select("id,title,created_at,status,version_number").eq("project_id", projectId).eq("report_type", "inspection").order("created_at", { ascending: false }).limit(50),
    ]);
    if (i.error || r.error) setError(i.error?.message || r.error?.message || "No fue posible consultar los informes.");
    else {
      const items = (i.data ?? []) as Inspection[];
      setInspections(items); setSaved((r.data ?? []) as SavedReport[]);
      setSelectedId((v) => items.some((x) => x.id === v) ? v : (items[0]?.id ?? ""));
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void loadBase(); }, [loadBase]);
  useEffect(() => {
    if (!supabase || !selectedId || !projectId) { setFindings([]); setPhotos([]); return; }
    let cancelled = false;
    async function loadDetail() {
      if (!supabase) return;
      setError("");
      const [f, p] = await Promise.all([
        supabase.from("findings").select("id,title,description,classification,status,corrective_action_requested,due_date,closure_notes").eq("project_id", projectId).eq("inspection_id", selectedId).order("created_at", { ascending: true }).limit(200),
        supabase.from("evidence_photos").select("id,description,original_file_path,captured_at").eq("project_id", projectId).eq("inspection_id", selectedId).order("created_at", { ascending: true }).limit(100),
      ]);
      if (cancelled) return;
      if (f.error || p.error) { setError(f.error?.message || p.error?.message || "No fue posible cargar las evidencias."); return; }
      setFindings((f.data ?? []) as Finding[]);
      const rows = (p.data ?? []) as Photo[];
      const urls = await Promise.all(rows.map(async (photo) => {
        const { data } = await supabase!.storage.from("traza-documents").createSignedUrl(photo.original_file_path, 600);
        return { ...photo, url: data?.signedUrl };
      }));
      if (!cancelled) setPhotos(urls);
    }
    void loadDetail();
    return () => { cancelled = true; };
  }, [projectId, selectedId]);

  async function saveDraft() {
    if (!supabase || !inspection || !canDraft) return;
    setSaving(true); setError(""); setMessage("");
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { setError("Debes iniciar sesión para guardar el informe."); setSaving(false); return; }
    const title = `Informe de inspección ambiental — ${inspection.title || fmt(inspection.inspection_date)}`;
    // El snapshot congela los antecedentes del informe, pero no incorpora URLs firmadas temporales.
    const snapshot = { schema_version: 1, inspection: { ...inspection }, findings, photos: photos.map(({ url: _url, ...photo }) => photo), project: { id: projectId, name: projectName }, prepared_at: new Date().toISOString() };
    const { error: insertError } = await supabase.from("environmental_reports").insert({
      project_id: projectId, report_type: "inspection", title, period_from: inspection.inspection_date,
      period_to: inspection.inspection_date, status: "draft", version_number: 1,
      report_snapshot: snapshot, executive_summary: summary.trim() || null,
      conclusions: conclusions.trim() || null, created_by: authData.user.id,
    });
    if (insertError) setError(insertError.message);
    else { setMessage("Borrador guardado. No constituye un informe aprobado ni emitido."); await loadBase(); }
    setSaving(false);
  }

  return <div className={styles.wrap}>
    <div className={styles.head}>
      <div><h2>Informes de inspección ambiental</h2><p>Vista preliminar generada desde los registros de Supabase. El PDF se obtiene mediante la opción de imprimir del navegador.</p></div>
      <button type="button" onClick={() => void loadBase()} disabled={loading}>Actualizar</button>
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {message && <p className={styles.ok} role="status">{message}</p>}
    <div className={styles.controls}>
      <label>Inspección
        <select value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setSummary(""); setConclusions(""); }}>
          {!inspections.length && <option value="">Sin inspecciones registradas</option>}
          {inspections.map((item) => <option key={item.id} value={item.id}>{fmt(item.inspection_date)} — {item.title || "Inspección sin título"}</option>)}
        </select>
      </label>
      {inspection && <><label>Resumen ejecutivo
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} placeholder="Síntesis del objetivo y principales resultados" />
      </label><label>Conclusiones
        <textarea value={conclusions} onChange={(e) => setConclusions(e.target.value)} rows={3} placeholder="Conclusiones preliminares de la inspección" />
      </label></>}
      <div className={styles.actions}>
        <button type="button" disabled={!inspection || saving || !canDraft} onClick={() => void saveDraft()}>{saving ? "Guardando…" : "Guardar borrador"}</button>
        <button type="button" disabled={!inspection} onClick={() => window.print()}>Imprimir / Guardar como PDF</button>
      </div>
      {!canDraft && <small>Tu nivel de acceso permite consultar, pero no crear borradores.</small>}
    </div>
    {inspection && <article className={styles.paper} id="traza-inspection-print">
      <div className={styles.paperhead}><strong>TRAZA</strong><span>DOCUMENTO PRELIMINAR · NO APROBADO</span></div>
      <h1>Informe de Inspección Ambiental</h1>
      <p className={styles.muted}>Proyecto: <strong>{projectName}</strong></p>
      <table><tbody>
        <tr><th>Inspección</th><td>{inspection.title || "Sin título"}</td></tr>
        <tr><th>Fecha</th><td>{fmt(inspection.inspection_date)}</td></tr>
        <tr><th>Estado</th><td>{labels[inspection.status] || inspection.status}</td></tr>
        <tr><th>Identificador</th><td className={styles.break}>{inspection.id}</td></tr>
      </tbody></table>
      <h3>1. Antecedentes y observaciones</h3>
      <p>{inspection.general_notes || "Sin observaciones generales registradas."}</p>
      <h3>2. Condiciones meteorológicas</h3>
      <p>{inspection.weather_notes || "Sin antecedentes meteorológicos registrados."}</p>
      <h3>3. Resumen ejecutivo</h3><p>{summary || "Pendiente de completar."}</p>
      <h3>4. Hallazgos asociados ({findings.length})</h3>
      {findings.length ? findings.map((finding, i) => <section key={finding.id} className={styles.finding}>
        <strong>{i + 1}. {finding.title}</strong>
        <p><small>Clasificación: {finding.classification} · Estado: {labels[finding.status] || finding.status} · Plazo: {fmt(finding.due_date)}</small></p>
        <p>{finding.description}</p>
        {finding.corrective_action_requested && <p><strong>Acción solicitada:</strong> {finding.corrective_action_requested}</p>}
        {finding.closure_notes && <p><strong>Observación de cierre:</strong> {finding.closure_notes}</p>}
      </section>) : <p>No se registran hallazgos vinculados a esta inspección.</p>}
      <h3>5. Registro fotográfico ({photos.length})</h3>
      {photos.length ? <div className={styles.photos}>{photos.map((photo, i) => <figure key={photo.id}>
        {photo.url ? <img src={photo.url} alt={photo.description || `Fotografía ${i + 1}`} /> : <div className={styles.noPhoto}>Imagen no disponible. Verificar acceso a Storage.</div>}
        <figcaption>Foto {i + 1}. {photo.description || "Sin descripción"}. {fmt(photo.captured_at)}</figcaption>
      </figure>)}</div> : <p>No se registran fotografías vinculadas a esta inspección.</p>}
      <h3>6. Conclusiones</h3><p>{conclusions || "Pendiente de completar."}</p>
      <p className={styles.foot}>Generado como vista preliminar desde TRAZA. Requiere revisión y aprobación formal antes de su emisión.</p>
    </article>}
    <section className={styles.saved}><h3>Borradores e informes registrados</h3>
      {saved.length ? saved.map((report) => <div key={report.id} className={styles.savedrow}><span><strong>{report.title}</strong><small>{fmt(report.created_at)} · {report.status} · v{report.version_number}</small></span></div>) : <p>Sin informes de inspección registrados.</p>}
    </section>
  </div>;
}
