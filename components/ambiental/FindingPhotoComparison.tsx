"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AccessLevel } from "@/lib/modules";
import styles from "./FindingPhotoComparison.module.css";

type Photo = {
  id: string; description: string | null; original_file_path: string;
  evidence_type: string; captured_at: string; url: string | null;
};
type Comparison = {
  id: string; before_photo_id: string; after_photo_id: string;
  description: string | null; created_at: string;
};

export default function FindingPhotoComparison({ findingId, projectId, accessLevel }: {
  findingId: string; projectId: string; accessLevel: AccessLevel;
}) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [beforeId, setBeforeId] = useState("");
  const [afterId, setAfterId] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [canAif, setCanAif] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true); setError("");
    const [links, saved] = await Promise.all([
      supabase.from("finding_photos").select("photo_id").eq("finding_id", findingId).limit(200),
      supabase.rpc("traza_list_finding_photo_comparisons", { p_finding_id: findingId, p_project_id: projectId }),
    ]);
    if (links.error || saved.error) {
      setError(links.error?.message || saved.error?.message || "No se pudieron consultar las comparaciones.");
      setLoading(false); return;
    }
    const ids = [...new Set((links.data ?? []).map(x => x.photo_id as string))];
    let nextPhotos: Photo[] = [];
    if (ids.length > 0) {
      const records = await supabase.from("evidence_photos")
        .select("id,description,original_file_path,evidence_type,captured_at")
        .eq("project_id", projectId).in("id", ids).limit(200);
      if (records.error) { setError(records.error.message); setLoading(false); return; }
      nextPhotos = await Promise.all((records.data ?? []).map(async p => {
        const link = await supabase!.storage.from("traza-documents")
          .createSignedUrl(p.original_file_path, 900);
        return { ...p, url: link.error ? null : link.data?.signedUrl ?? null } as Photo;
      }));
    }
    setPhotos(nextPhotos);
    setComparisons((saved.data ?? []) as Comparison[]);
    setLoading(false);
  }, [findingId, projectId]);

  useEffect(() => {
    let mounted = true;
    setPhotos([]); setComparisons([]); setBeforeId(""); setAfterId("");
    setCanAif(false); setError(""); setNotice("");
    void load();
    void (async () => {
      if (!supabase) return;
      const auth = await supabase.auth.getUser();
      if (!auth.data.user) return;
      const member = await supabase.from("project_members").select("role")
        .eq("project_id", projectId).eq("user_id", auth.data.user.id).eq("status", "active");
      if (mounted && !member.error) setCanAif((member.data ?? []).some(m => m.role === "aif_environmental"));
    })();
    return () => { mounted = false; };
  }, [load, projectId]);

  const originals = useMemo(() => photos.filter(p => p.evidence_type !== "after"), [photos]);
  const corrections = useMemo(() => photos.filter(p => p.evidence_type === "after"), [photos]);
  const byId = useMemo(() => new Map(photos.map(p => [p.id, p])), [photos]);
  const canSave = canAif && ["approve", "admin"].includes(accessLevel);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !canSave || !beforeId || !afterId || saving) return;
    setSaving(true); setError(""); setNotice("");
    const result = await supabase.rpc("traza_create_finding_photo_comparison", {
      p_finding_id: findingId, p_project_id: projectId,
      p_before_photo_id: beforeId, p_after_photo_id: afterId,
      p_description: description.trim() || null,
    });
    if (result.error) setError(result.error.message);
    else { setNotice("Comparación guardada correctamente."); setDescription(""); await load(); }
    setSaving(false);
  }

  function picture(photo: Photo | undefined, label: string) {
    return <div className={styles.photo}>
      <strong>{label}</strong>
      {photo?.url ? <><a href={photo.url} target="_blank" rel="noopener noreferrer">
        <img src={photo.url} alt={`${label}: ${photo.description || "Evidencia fotográfica"}`} loading="lazy" />
      </a><a href={photo.url} target="_blank" rel="noopener noreferrer">Ver imagen completa</a></> :
        <span className={styles.note}>{photo ? "Enlace temporal no disponible" : "Selecciona una fotografía"}</span>}
      <small>{photo?.description || "Sin descripción"}</small>
      {photo?.captured_at && <small>{new Date(photo.captured_at).toLocaleString("es-CL")}</small>}
    </div>;
  }

  return <section className={styles.wrap} aria-label="Comparaciones fotográficas del hallazgo">
    <div className={styles.header}>
      <strong className={styles.title}>Comparación fotográfica · Antes / Después</strong>
      <button className={styles.button} type="button" onClick={() => void load()} disabled={loading}>Actualizar</button>
    </div>
    <p className={styles.note}>Solo se comparan fotografías asociadas a este hallazgo. Los enlaces son temporales y los originales permanecen privados.</p>
    {loading && <p className={styles.note}>Cargando fotografías y comparaciones...</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {canSave && <form className={styles.form} onSubmit={e => void save(e)}>
      <div className={styles.fields}>
        <label className={styles.field}>Fotografía ANTES
          <select value={beforeId} onChange={e => setBeforeId(e.target.value)} required>
            <option value="">Seleccionar evidencia original</option>
            {originals.map(p => <option key={p.id} value={p.id}>{p.description || `Fotografía ${p.id.slice(0,8)}`}</option>)}
          </select>
        </label>
        <label className={styles.field}>Fotografía DESPUÉS
          <select value={afterId} onChange={e => setAfterId(e.target.value)} required>
            <option value="">Seleccionar evidencia de subsanación</option>
            {corrections.map(p => <option key={p.id} value={p.id}>{p.description || `Fotografía ${p.id.slice(0,8)}`}</option>)}
          </select>
        </label>
      </div>
      {(beforeId || afterId) && <div className={styles.compare}>
        {picture(byId.get(beforeId), "ANTES")}{picture(byId.get(afterId), "DESPUÉS")}
      </div>}
      <label className={styles.field}>Conclusión de la comparación (opcional)
        <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} rows={2} placeholder="Describe el cambio observado" />
      </label>
      <button className={styles.button} disabled={saving || !beforeId || !afterId || loading || originals.length === 0 || corrections.length === 0} type="submit">
        {saving ? "Guardando..." : "Guardar comparación"}
      </button>
      {(originals.length === 0 || corrections.length === 0) && <p className={styles.note}>Para guardar una comparación, el hallazgo debe tener una fotografía original y otra de subsanación.</p>}
    </form>}
    {notice && <p className={styles.ok} role="status">{notice}</p>}
    <div className={styles.history}>
      <strong>Comparaciones guardadas ({comparisons.length})</strong>
      {comparisons.length === 0 && !loading && <p className={styles.note}>No hay comparaciones guardadas para este hallazgo.</p>}
      {comparisons.map(c => <div className={styles.entry} key={c.id}>
        <span className={styles.meta}>{new Date(c.created_at).toLocaleString("es-CL")}</span>
        {c.description && <p>{c.description}</p>}
        <div className={styles.compare}>
          {picture(byId.get(c.before_photo_id), "ANTES")}
          {picture(byId.get(c.after_photo_id), "DESPUÉS")}
        </div>
      </div>)}
    </div>
  </section>;
}
