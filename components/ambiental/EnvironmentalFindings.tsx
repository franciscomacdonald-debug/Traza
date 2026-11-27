"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AccessLevel } from "@/lib/modules";
import FindingFollowUp from "./FindingFollowUp";
import styles from "./EnvironmentalFindings.module.css";

type Finding = {
  id: string;
  project_id: string;
  inspection_id: string | null;
  title: string;
  description: string;
  classification: string;
  origin: string;
  status: string;
  corrective_action_requested: string | null;
  due_date: string | null;
  created_at: string;
  closed_at: string | null;
  closure_notes: string | null;
};
type LinkedPhoto = { id: string; description: string | null; path: string; url: string | null };

const states: Record<string, string> = {
  pending: "Pendiente", in_management: "En gestión", responded: "Respondido",
  closure_requested: "Cierre solicitado", closed: "Cerrado", overdue: "Vencido", cancelled: "Anulado"
};
const classes: Record<string, string> = {
  non_compliance: "No conformidad", observation: "Observación", recommendation: "Recomendación"
};
const origins: Record<string, string> = { aif: "AIF", contractor_internal: "Contratista (interno)" };
const dateCL = (value: string | null) => value ? new Date(value.length === 10 ? value + "T12:00:00" : value).toLocaleDateString("es-CL") : "—";

export default function EnvironmentalFindings({ projectId, accessLevel }: { projectId: string; accessLevel: AccessLevel }) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<LinkedPhoto[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");

  const refresh = useCallback(async () => {
    if (!supabase || !projectId) return;
    setLoading(true);
    setError("");
    const { data, error: fetchError } = await supabase.from("findings")
      .select("id,project_id,inspection_id,title,description,classification,origin,status,corrective_action_requested,due_date,created_at,closed_at,closure_notes")
      .eq("project_id", projectId).order("created_at", { ascending: false }).limit(500);
    if (fetchError) setError(fetchError.message);
    else setFindings((data ?? []) as Finding[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    setFindings([]);
    setOpenId(null);
    setPhotoId(null);
    setPhotos([]);
    void refresh();
  }, [projectId, refresh]);

  const visible = useMemo(() => findings.filter(f => {
    if (filter === "open" && ["closed", "cancelled"].includes(f.status)) return false;
    if (filter !== "all" && filter !== "open" && f.status !== filter) return false;
    const s = query.trim().toLocaleLowerCase("es-CL");
    return !s || [f.title, f.description, f.id].some(x => x.toLocaleLowerCase("es-CL").includes(s));
  }), [findings, filter, query]);

  const openCount = findings.filter(f => !["closed", "cancelled"].includes(f.status)).length;
  async function togglePhotos(finding: Finding) {
    if (photoId === finding.id) { setPhotoId(null); setPhotos([]); return; }
    if (!supabase) return;
    setPhotoId(finding.id); setPhotos([]); setPhotoError(""); setPhotoBusy(true);
    const { data: links, error: linkError } = await supabase.from("finding_photos")
      .select("photo_id").eq("finding_id", finding.id).limit(100);
    if (linkError) { setPhotoError(linkError.message); setPhotoBusy(false); return; }
    const ids = (links ?? []).map(link => link.photo_id as string);
    if (!ids.length) { setPhotoBusy(false); return; }
    const { data: photoRows, error: rowError } = await supabase.from("evidence_photos")
      .select("id,project_id,inspection_id,description,original_file_path")
      .eq("project_id", projectId).in("id", ids);
    if (rowError) { setPhotoError(rowError.message); setPhotoBusy(false); return; }
    const items = await Promise.all((photoRows ?? [])
      .filter(p => !finding.inspection_id || p.inspection_id === finding.inspection_id)
      .map(async p => {
        const { data: signed } = await supabase!.storage.from("traza-documents")
          .createSignedUrl(p.original_file_path, 300);
        return { id: p.id as string, description: p.description as string | null,
          path: p.original_file_path as string, url: signed?.signedUrl ?? null };
      }));
    setPhotos(items);
    setPhotoBusy(false);
  }

  return <section className={styles.container} aria-label="Gestión de hallazgos ambientales">
    <div className={styles.heading}>
      <div><h2>Gestión de hallazgos ambientales</h2><div className={styles.hint}>Consulta, filtra y da seguimiento a los hallazgos del proyecto activo.</div></div>
      <button className={styles.button} type="button" onClick={() => void refresh()} disabled={loading}>Actualizar hallazgos</button>
    </div>
    <div className={styles.summary}>
      <span><strong>{findings.length}</strong> registrados</span>
      <span><strong>{openCount}</strong> abiertos</span>
      <span><strong>{findings.filter(f => f.status === "closure_requested").length}</strong> solicitan cierre</span>
      <span><strong>{findings.filter(f => f.status === "closed").length}</strong> cerrados</span>
    </div>
    <div className={styles.toolbar}>
      <label className={styles.field}>Buscar hallazgo<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Título, descripción o ID" /></label>
      <label className={styles.field}>Estado<select value={filter} onChange={e => setFilter(e.target.value)}>
        <option value="all">Todos</option><option value="open">Todos los abiertos</option>
        {Object.entries(states).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
      </select></label>
      <span className={styles.hint}>Mostrando {visible.length} de {findings.length} (máximo 500 registros)</span>
    </div>
    {error && <div className={styles.error} role="alert">{error}</div>}
    {loading && <span className={styles.hint}>Actualizando hallazgos...</span>}
    {!loading && visible.length === 0 && <div className={styles.empty}>No existen hallazgos para los filtros seleccionados. Para registrar uno nuevo, ingresa a Inspecciones.</div>}
    <div className={styles.list}>{visible.map(f => <article className={styles.item} key={f.id}>
      <div className={styles.top}>
        <div><h3>{f.title}</h3><div className={styles.meta}>
          <span>{classes[f.classification] ?? f.classification}</span>
          <span>Origen: {origins[f.origin] ?? f.origin}</span>
          <span>Registrado: {dateCL(f.created_at)}</span>
          <span>Plazo: {dateCL(f.due_date)}</span>
          <span>{f.inspection_id ? "Vinculado a inspección" : "Sin inspección vinculada"}</span>
        </div></div>
        <span className={styles.tag}>{states[f.status] ?? f.status}</span>
      </div>
      <p className={styles.description}>{f.description}</p>
      {f.corrective_action_requested && <div className={styles.note}><strong>Medida correctiva solicitada:</strong> {f.corrective_action_requested}</div>}
      {f.closed_at && <div className={styles.meta}>Cerrado: {dateCL(f.closed_at)}</div>}
      {f.closure_notes && <div className={styles.note}><strong>Observaciones de cierre:</strong> {f.closure_notes}</div>}
      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={() => setOpenId(x => x === f.id ? null : f.id)}>{openId === f.id ? "Ocultar seguimiento" : "Seguimiento y cierre"}</button>
        <button type="button" className={styles.button} onClick={() => void togglePhotos(f)}>{photoId === f.id ? "Ocultar fotografías" : "Ver fotografías"}</button>
      </div>
      {photoId === f.id && <div>
        <strong>Fotografías asociadas al hallazgo</strong>
        {photoBusy ? <p className={styles.hint}>Cargando fotografías...</p> : photos.length === 0 && <p className={styles.hint}>No hay fotografías asociadas.</p>}
        {photoError && <p className={styles.error}>{photoError}</p>}
        <div className={styles.photos}>{photos.map(p => <div className={styles.photo} key={p.id}>
          {p.url ? <><img src={p.url} alt={p.description || "Fotografía de evidencia"} /><a href={p.url} target="_blank" rel="noopener noreferrer">Ver fotografía</a></> : <small>No se pudo generar enlace temporal.</small>}
          {p.description && <small>{p.description}</small>}
        </div>)}</div>
      </div>}
      {openId === f.id && <FindingFollowUp findingId={f.id} projectId={projectId} accessLevel={accessLevel} onUpdated={() => void refresh()} />}
    </article>)}</div>
  </section>;
}
