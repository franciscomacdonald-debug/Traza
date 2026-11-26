"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AccessLevel } from "@/lib/modules";
import styles from "./EnvironmentalInspections.module.css";

type InspectionStatus = "draft" | "in_progress" | "completed" | "cancelled";
type Inspection = {
  id: string;
  title: string | null;
  inspection_date: string;
  status: InspectionStatus;
  general_notes: string | null;
  weather_notes: string | null;
  created_at: string;
};

const statusNames: Record<InspectionStatus, string> = {
  draft: "Borrador", in_progress: "En progreso", completed: "Completada", cancelled: "Cancelada",
};

function todayLocal() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export default function EnvironmentalInspections({ projectId, accessLevel }: {
  projectId: string;
  accessLevel: AccessLevel;
}) {
  const [rows, setRows] = useState<Inspection[]>([]);
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
    setError("");
    const result = await supabase.from("inspections")
      .select("id,title,inspection_date,status,general_notes,weather_notes,created_at")
      .eq("project_id", projectId)
      .order("inspection_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);
    if (result.error) setError(`No fue posible cargar las inspecciones: ${result.error.message}`);
    else setRows((result.data ?? []) as Inspection[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  async function saveInspection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !projectId || !canEdit || saving) return;
    setError(""); setSuccess("");
    if (!title.trim() || !date) { setError("Indica un título y una fecha."); return; }
    setSaving(true);
    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData.user) {
      setError("Tu sesión no está disponible. Vuelve a iniciar sesión."); setSaving(false); return;
    }
    const { error: insertError } = await supabase.from("inspections").insert({
      project_id: projectId,
      inspector_user_id: userData.user.id,
      inspection_date: date,
      title: title.trim(),
      general_notes: generalNotes.trim() || null,
      weather_notes: weatherNotes.trim() || null,
      status: "draft",
    });
    if (insertError) {
      setError(`No se pudo guardar la inspección: ${insertError.message}. Revisa los permisos RLS si el usuario debe tener acceso.`);
    } else {
      setTitle(""); setGeneralNotes(""); setWeatherNotes("");
      setSuccess("Inspección guardada como borrador.");
      await load();
    }
    setSaving(false);
  }

  return (
    <div className={styles.wrap}>
      <div>
        <h2 className={styles.title}>Inspecciones ambientales</h2>
        <p className={styles.info}>Registra inspecciones del proyecto activo y consulta las últimas 100. Esta primera versión guarda borradores; el cierre y los hallazgos se incorporarán después.</p>
      </div>
      {canEdit && (
        <section className={styles.panel}>
          <h3 style={{margin:0}}>Nueva inspección</h3>
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
              <button className={styles.button} type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar borrador"}</button>
              <span className={styles.info}>El inspector se vincula a tu usuario actual.</span>
            </div>
          </form>
        </section>
      )}
      {!canEdit && <p className={styles.info}>Tu nivel de acceso permite consultar inspecciones, pero no crearlas.</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {success && <p role="status" className={styles.success}>{success}</p>}
      <section className={styles.panel}>
        <div className={styles.actions} style={{justifyContent:"space-between"}}>
          <h3 style={{margin:0}}>Inspecciones registradas</h3>
          <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => void load()} disabled={loading}>Actualizar lista</button>
        </div>
        {loading ? <p className={styles.info}>Cargando inspecciones…</p> : rows.length === 0 ?
          <p className={styles.empty}>No existen inspecciones registradas en este proyecto.</p> :
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Fecha</th><th>Inspección</th><th>Estado</th><th>Observaciones</th></tr></thead>
              <tbody>{rows.map((item) => <tr key={item.id}>
                <td>{item.inspection_date}</td>
                <td>{item.title || "Sin título"}</td>
                <td>{statusNames[item.status] ?? item.status}</td>
                <td>{item.general_notes || "—"}</td>
              </tr>)}</tbody>
            </table>
          </div>}
      </section>
    </div>
  );
}
