"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AccessLevel } from "@/lib/modules";
import styles from "./InspectionFindings.module.css";

type Origin = "aif" | "contractor_internal";
type Classification = "non_compliance" | "observation" | "recommendation";
type Finding = { id: string; title: string; classification: Classification; status: string; created_at: string; due_date: string | null };
type Photo = { id: string; description: string | null; original_file_path: string; signedUrl: string | null };
const classificationNames: Record<Classification, string> = { non_compliance: "No conformidad", observation: "Observación", recommendation: "Recomendación" };
const statusNames: Record<string, string> = { pending: "Pendiente", in_management: "En gestión", responded: "Respondido", closure_requested: "Cierre solicitado", closed: "Cerrado", overdue: "Vencido", cancelled: "Anulado" };

export default function InspectionFindings({ projectId, inspectionId, accessLevel }: { projectId: string; inspectionId: string; accessLevel: AccessLevel }) {
  const [rows, setRows] = useState<Finding[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [roles, setRoles] = useState<Origin[]>([]);
  const [origin, setOrigin] = useState<Origin>("aif");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [classification, setClassification] = useState<Classification>("observation");
  const [correctiveAction, setCorrectiveAction] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const canEdit = accessLevel === "edit" || accessLevel === "approve" || accessLevel === "admin";

  const load = useCallback(async () => {
    if (!supabase || !projectId || !inspectionId) return;
    setLoading(true);
    const [found, images] = await Promise.all([
      supabase.from("findings").select("id,title,classification,status,created_at,due_date").eq("project_id", projectId).eq("inspection_id", inspectionId).order("created_at", { ascending: false }).limit(100),
      supabase.from("evidence_photos").select("id,description,original_file_path").eq("project_id", projectId).eq("inspection_id", inspectionId).order("created_at", { ascending: false }).limit(100),
    ]);
    if (found.error || images.error) {
      setError(`No se pudieron consultar los datos: ${found.error?.message || images.error?.message}`);
    } else {
      setRows((found.data ?? []) as Finding[]);
      const photoRows = (images.data ?? []) as Omit<Photo, "signedUrl">[];
      const prepared = await Promise.all(photoRows.map(async photo => {
        const signed = await supabase!.storage.from("traza-documents").createSignedUrl(photo.original_file_path, 900);
        return { ...photo, signedUrl: signed.error ? null : signed.data?.signedUrl ?? null };
      }));
      setPhotos(prepared);
    }
    setLoading(false);
  }, [projectId, inspectionId]);

  useEffect(() => {
    let alive = true;
    setRows([]); setPhotos([]); setSelectedPhotoIds([]); setError(""); setSuccess(""); setRoles([]);
    void (async () => {
      if (!supabase) return;
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const result = await supabase.from("project_members")
        .select("role,status").eq("project_id", projectId).eq("user_id", auth.user.id).eq("status", "active");
      if (!alive) return;
      if (result.error) { setError(`No se pudieron verificar tus roles: ${result.error.message}`); return; }
      const allowed = (result.data ?? []).map((r: {role: string}) => r.role === "aif_environmental" ? "aif" : r.role === "contractor_environmental" ? "contractor_internal" : null).filter((r): r is Origin => r !== null);
      const unique = [...new Set(allowed)];
      setRoles(unique);
      if (unique.length) setOrigin(unique[0]);
    })();
    void load();
    return () => { alive = false; };
  }, [projectId, inspectionId, load]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase || saving || !canEdit || !roles.includes(origin)) return;
    setError(""); setSuccess("");
    if (!title.trim() || !description.trim()) { setError("Debes indicar título y descripción."); return; }
    setSaving(true);
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) { setError("La sesión no está disponible."); setSaving(false); return; }
    // El permiso final lo controla RLS. La consulta previa evita asociar un registro de otro proyecto.
    const inspection = await supabase.from("inspections").select("id").eq("id", inspectionId).eq("project_id", projectId).maybeSingle();
    if (inspection.error || !inspection.data) { setError("No se encontró la inspección en este proyecto."); setSaving(false); return; }
    const created = await supabase.from("findings").insert({
      project_id: projectId, inspection_id: inspectionId, created_by: auth.user.id,
      origin, classification, status: "pending", title: title.trim(), description: description.trim(),
      corrective_action_requested: correctiveAction.trim() || null, due_date: dueDate || null,
    }).select("id").single();
    if (created.error || !created.data) { setError(`No se pudo crear el hallazgo: ${created.error?.message ?? "sin respuesta"}`); setSaving(false); return; }
    const findingId = created.data.id as string;
    if (selectedPhotoIds.length) {
      const linked = await supabase.from("finding_photos").insert(selectedPhotoIds.map(id => ({ finding_id: findingId, photo_id: id, relation_type: "evidence" })));
      if (linked.error) {
        setError(`Se creó el hallazgo, pero NO se asociaron las fotografías: ${linked.error.message}. Hallazgo: ${findingId}. No lo vuelvas a crear; revisaremos la vinculación.`);
        await load(); setSaving(false); return;
      }
    }
    setSuccess("Hallazgo registrado correctamente."); setTitle(""); setDescription(""); setCorrectiveAction(""); setDueDate(""); setSelectedPhotoIds([]);
    await load(); setSaving(false);
  }

  return <section className={styles.wrap} aria-label="Hallazgos de inspección">
    <div className={styles.header}><h4 className={styles.title}>Hallazgos asociados ({rows.length})</h4><button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => void load()} disabled={loading || saving}>Actualizar</button></div>
    {canEdit && roles.length > 0 && <form className={styles.form} onSubmit={(e) => void submit(e)}>
      <label className={styles.field}>Origen
        <select value={origin} onChange={e => setOrigin(e.target.value as Origin)}>
          {roles.includes("aif") && <option value="aif">Asesoría / AIF</option>}
          {roles.includes("contractor_internal") && <option value="contractor_internal">Contratista (interno)</option>}
        </select>
      </label>
      <label className={styles.field}>Clasificación
        <select value={classification} onChange={e => setClassification(e.target.value as Classification)}>
          <option value="non_compliance">No conformidad</option><option value="observation">Observación</option><option value="recommendation">Recomendación</option>
        </select>
      </label>
      <label className={`${styles.field} ${styles.wide}`}>Título *<input value={title} onChange={e => setTitle(e.target.value)} maxLength={160} required /></label>
      <label className={`${styles.field} ${styles.wide}`}>Descripción del hallazgo *<textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} required /></label>
      <label className={`${styles.field} ${styles.wide}`}>Acción correctiva solicitada<textarea value={correctiveAction} onChange={e => setCorrectiveAction(e.target.value)} rows={2}/></label>
      <label className={styles.field}>Plazo para corregir<input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></label>
      <div className={`${styles.field} ${styles.wide}`}><span>Vincular fotografías existentes (opcional)</span>
        {photos.length === 0 ? <p className={styles.hint}>Esta inspección todavía no tiene fotografías.</p> : <div className={styles.photos}>
          {photos.map(photo => <label key={photo.id} className={styles.photo}>
            <input type="checkbox" checked={selectedPhotoIds.includes(photo.id)} onChange={e => setSelectedPhotoIds(current => e.target.checked ? [...current, photo.id] : current.filter(id => id !== photo.id))}/>
            {photo.signedUrl && <img src={photo.signedUrl} alt="Evidencia" loading="lazy"/>}
            <span>{photo.description || `Fotografía ${photo.id.slice(0, 8)}`}</span>
          </label>)}
        </div>}
      </div>
      <div className={styles.wide}><button type="submit" className={styles.button} disabled={saving}>{saving ? "Guardando…" : "Registrar hallazgo"}</button></div>
    </form>}
    {canEdit && roles.length === 0 && <p className={styles.hint}>No se detectó un rol AIF o Contratista activo para registrar hallazgos. La consulta está disponible.</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {success && <p role="status" className={styles.success}>{success}</p>}
    <div className={styles.list}>{loading ? <p className={styles.hint}>Cargando…</p> : rows.length === 0 ? <p className={styles.hint}>No hay hallazgos asociados a esta inspección.</p> : rows.map(row =>
      <article key={row.id} className={styles.item}><strong>{row.title}</strong><span>{classificationNames[row.classification]} · {statusNames[row.status] || row.status} · {new Date(row.created_at).toLocaleDateString("es-CL")}</span>{row.due_date && <span>Plazo: {row.due_date}</span>}</article>
    )}</div>
  </section>;
}
