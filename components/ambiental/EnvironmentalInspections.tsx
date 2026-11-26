"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AccessLevel } from "@/lib/modules";
import styles from "./EnvironmentalInspections.module.css";
import InspectionPhotos from "./InspectionPhotos";

type InspectionStatus = "draft" | "in_progress" | "completed" | "cancelled";
type Inspection = {
  id: string;
  title: string | null;
  inspection_date: string;
  status: InspectionStatus;
  inspector_user_id: string;
  general_notes: string | null;
  weather_notes: string | null;
  created_at: string;
  completed_at: string | null;
};

const statusNames: Record<InspectionStatus, string> = {
  draft: "Borrador", in_progress: "En progreso", completed: "Completada", cancelled: "Cancelada",
};
function todayLocal() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export default function EnvironmentalInspections({ projectId, accessLevel }: { projectId: string; accessLevel: AccessLevel }) {
  const [rows, setRows] = useState<Inspection[]>([]);
  const [userId, setUserId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [photosForId, setPhotosForId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayLocal);
  const [generalNotes, setGeneralNotes] = useState("");
  const [weatherNotes, setWeatherNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const canEdit = accessLevel === "edit" || accessLevel === "approve" || accessLevel === "admin";

  const load = useCallback(async () => {
    if (!supabase || !projectId) return;
    setLoading(true);
    const result = await supabase.from("inspections")
      .select("id,title,inspection_date,status,inspector_user_id,general_notes,weather_notes,created_at,completed_at")
      .eq("project_id", projectId)
      .order("inspection_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);
    if (result.error) setError(`No fue posible cargar las inspecciones: ${result.error.message}`);
    else setRows((result.data ?? []) as Inspection[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    let live = true;
    setEditingId(null); setError(""); setSuccess("");
    void (async () => {
      if (!supabase) return;
      const { data } = await supabase.auth.getUser();
      if (live) setUserId(data.user?.id ?? "");
    })();
    void load();
    return () => { live = false; };
  }, [load]);

  function resetForm() {
    setEditingId(null); setTitle(""); setDate(todayLocal()); setGeneralNotes(""); setWeatherNotes("");
  }
  function startEdit(item: Inspection) {
    if (!canEdit || !userId || item.inspector_user_id !== userId || !["draft", "in_progress"].includes(item.status)) return;
    setEditingId(item.id); setTitle(item.title ?? ""); setDate(item.inspection_date);
    setGeneralNotes(item.general_notes ?? ""); setWeatherNotes(item.weather_notes ?? "");
    setError(""); setSuccess("");
    document.getElementById("traza-inspection-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveInspection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !projectId || !canEdit || saving) return;
    setError(""); setSuccess("");
    if (!title.trim() || !date) { setError("Indica un título y una fecha."); return; }
    setSaving(true);
    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData.user) { setError("Tu sesión no está disponible."); setSaving(false); return; }
    const payload = {
      inspection_date: date, title: title.trim(),
      general_notes: generalNotes.trim() || null,
      weather_notes: weatherNotes.trim() || null,
    };
    if (editingId) {
      const existing = rows.find((row) => row.id === editingId);
      if (!existing || existing.inspector_user_id !== userData.user.id || !["draft", "in_progress"].includes(existing.status)) {
        setError("Solo puedes editar tus propias inspecciones en borrador o en progreso."); setSaving(false); return;
      }
      const { data, error: updateError } = await supabase.from("inspections")
        .update(payload).eq("id", editingId).eq("project_id", projectId)
        .eq("inspector_user_id", userData.user.id).in("status", ["draft", "in_progress"])
        .select("id");
      if (updateError) setError(`No se pudo actualizar: ${updateError.message}`);
      else if (!data?.length) setError("No se actualizó el registro. Verifica permisos o si cambió su estado.");
      else { setSuccess("Inspección actualizada."); resetForm(); await load(); }
    } else {
      const { error: insertError } = await supabase.from("inspections").insert({
        project_id: projectId, inspector_user_id: userData.user.id, ...payload, status: "draft",
      });
      if (insertError) setError(`No se pudo guardar: ${insertError.message}`);
      else { setSuccess("Inspección guardada como borrador."); resetForm(); await load(); }
    }
    setSaving(false);
  }

  async function changeStatus(item: Inspection, next: "in_progress" | "completed") {
    if (!supabase || !canEdit || saving || !userId || item.inspector_user_id !== userId) return;
    if ((next === "in_progress" && item.status !== "draft") || (next === "completed" && item.status !== "in_progress")) return;
    if (next === "completed" && !window.confirm("¿Completar esta inspección? Después no se podrá editar desde esta pantalla.")) return;
    setError(""); setSuccess(""); setSaving(true);
    const changes: { status: "in_progress" | "completed"; completed_at?: string } = { status: next };
    if (next === "completed") changes.completed_at = new Date().toISOString();
    const { data, error: updateError } = await supabase.from("inspections")
      .update(changes).eq("id", item.id).eq("project_id", projectId)
      .eq("inspector_user_id", userId).eq("status", item.status)
      .select("id");
    if (updateError) setError(`No se pudo cambiar el estado: ${updateError.message}`);
    else if (!data?.length) setError("No se modificó el registro. Revisa permisos o actualiza la lista.");
    else {
      if (editingId === item.id) resetForm();
      setSuccess(next === "in_progress" ? "Inspección iniciada." : "Inspección completada.");
      await load();
    }
    setSaving(false);
  }

  return (
    <div className={styles.wrap}>
      <div>
        <h2 className={styles.title}>Inspecciones ambientales</h2>
        <p className={styles.info}>Crea borradores, edita tus inspecciones y cambia su estado. Las inspecciones completadas se conservan en el historial.</p>
      </div>
      {canEdit && <section id="traza-inspection-form" className={styles.panel}>
        <div className={styles.actions} style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>{editingId ? "Editar inspección" : "Nueva inspección"}</h3>
          {editingId && <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={resetForm} disabled={saving}>Cancelar edición</button>}
        </div>
        <form onSubmit={(e) => void saveInspection(e)} className={styles.form}>
          <label className={styles.field}>Título *
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required placeholder="Ej.: Inspección de almacenamiento de residuos" />
          </label>
          <label className={styles.field}>Fecha de inspección *
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className={`${styles.field} ${styles.wide}`}>Observaciones generales
            <textarea rows={4} value={generalNotes} onChange={(e) => setGeneralNotes(e.target.value)} placeholder="Describe los aspectos revisados" />
          </label>
          <label className={`${styles.field} ${styles.wide}`}>Condiciones meteorológicas (opcional)
            <textarea rows={2} value={weatherNotes} onChange={(e) => setWeatherNotes(e.target.value)} />
          </label>
          <div className={`${styles.actions} ${styles.wide}`}>
            <button className={styles.button} type="submit" disabled={saving}>{saving ? "Guardando…" : editingId ? "Guardar cambios" : "Guardar borrador"}</button>
            <span className={styles.info}>Solo el inspector creador puede modificar sus inspecciones, según las políticas de Supabase.</span>
          </div>
        </form>
      </section>}
      {!canEdit && <p className={styles.info}>Tu nivel de acceso permite consultar inspecciones, pero no crearlas.</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {success && <p role="status" className={styles.success}>{success}</p>}
      <section className={styles.panel}>
        <div className={styles.actions} style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Inspecciones registradas</h3>
          <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => void load()} disabled={loading || saving}>Actualizar lista</button>
        </div>
        {loading ? <p className={styles.info}>Cargando inspecciones…</p> : rows.length === 0 ?
          <p className={styles.empty}>No existen inspecciones registradas en este proyecto.</p> :
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Fecha</th><th>Inspección</th><th>Estado</th><th>Observaciones</th><th>Acciones</th></tr></thead>
              <tbody>{rows.map((item) => {
                const ownEditable = canEdit && item.inspector_user_id === userId;
                return <Fragment key={item.id}><tr>
                  <td>{item.inspection_date}</td>
                  <td>{item.title || "Sin título"}</td>
                  <td>{statusNames[item.status] ?? item.status}</td>
                  <td>{item.general_notes || "—"}</td>
                  <td><div className={styles.actions}>
                    {ownEditable && (item.status === "draft" || item.status === "in_progress") &&
                      <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => startEdit(item)} disabled={saving}>Editar</button>}
                    {ownEditable && item.status === "draft" &&
                      <button type="button" className={styles.button} onClick={() => void changeStatus(item, "in_progress")} disabled={saving}>Iniciar</button>}
                    {ownEditable && item.status === "in_progress" &&
                      <button type="button" className={styles.button} onClick={() => void changeStatus(item, "completed")} disabled={saving}>Completar</button>}
                    <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => setPhotosForId((current) => current === item.id ? null : item.id)}>{photosForId === item.id ? "Cerrar fotos" : "Fotografías"}</button>
                  </div></td>
                  </tr>
                  {photosForId === item.id && <tr><td colSpan={5}><InspectionPhotos key={item.id} projectId={projectId} inspectionId={item.id} inspectorUserId={item.inspector_user_id} inspectionStatus={item.status} accessLevel={accessLevel} /></td></tr>}
                </Fragment>;
              })}</tbody>
            </table>
          </div>}
      </section>
    </div>
  );
}
