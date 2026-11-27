"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AccessLevel } from "@/lib/modules";
import styles from "./FindingResponsePhotos.module.css";

type RecordPhoto = { id: string; description: string | null; original_file_path: string; captured_at: string };
type DisplayPhoto = RecordPhoto & { url: string | null };

export default function FindingResponsePhotos({ projectId, findingId, responseId, respondedBy, actionType, findingStatus, accessLevel }: {
  projectId: string; findingId: string; responseId: string; respondedBy: string;
  actionType: string | null; findingStatus: string; accessLevel: AccessLevel;
}) {
  const [photos, setPhotos] = useState<DisplayPhoto[]>([]);
  const [uid, setUid] = useState("");
  const [isContractor, setIsContractor] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const editable = ["edit", "approve", "admin"].includes(accessLevel);
  const canUpload = editable && isContractor && uid === respondedBy &&
    ["respond", "request_closure"].includes(actionType ?? "") &&
    !["closed", "cancelled"].includes(findingStatus);

  const load = useCallback(async () => {
    if (!supabase) return;
    const links = await supabase.from("finding_response_photos")
      .select("photo_id").eq("response_id", responseId).limit(100);
    if (links.error) { setError(links.error.message); return; }
    const ids = (links.data ?? []).map(r => r.photo_id as string);
    if (!ids.length) { setPhotos([]); return; }
    const records = await supabase.from("evidence_photos")
      .select("id,description,original_file_path,captured_at")
      .eq("project_id", projectId).in("id", ids).limit(100);
    if (records.error) { setError(records.error.message); return; }
    const urls = await Promise.all(((records.data ?? []) as RecordPhoto[]).map(async p => {
      const signed = await supabase!.storage.from("traza-documents").createSignedUrl(p.original_file_path, 900);
      return { ...p, url: signed.error ? null : signed.data?.signedUrl ?? null };
    }));
    setPhotos(urls);
  }, [projectId, responseId]);

  useEffect(() => {
    let mounted = true;
    setPhotos([]); setError(""); setSuccess(""); setUid(""); setIsContractor(false);
    void load();
    void (async () => {
      if (!supabase) return;
      const auth = await supabase.auth.getUser();
      if (!mounted || !auth.data.user) return;
      const userId = auth.data.user.id;
      setUid(userId);
      const membership = await supabase.from("project_members").select("role")
        .eq("project_id", projectId).eq("user_id", userId).eq("status", "active");
      if (mounted && !membership.error) setIsContractor((membership.data ?? []).some(x => x.role === "contractor_environmental"));
    })();
    return () => { mounted = false; };
  }, [load, projectId]);

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !canUpload || !file || busy) return;
    setError(""); setSuccess("");
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const types: Record<string,string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
    if (types[extension] !== file.type || file.size < 1 || file.size > 10 * 1024 * 1024) {
      setError("Selecciona una imagen JPG, PNG o WEBP de hasta 10 MB."); return;
    }
    setBusy(true);
    try {
      const auth = await supabase.auth.getUser();
      if (!auth.data.user || auth.data.user.id !== respondedBy) throw new Error("La respuesta pertenece a otro usuario.");
      const path = `${projectId}/hallazgos/${findingId}/${crypto.randomUUID()}.${extension}`;
      const stored = await supabase.storage.from("traza-documents").upload(path, file, {
        upsert: false, contentType: file.type,
      });
      if (stored.error) throw new Error(`No se pudo cargar la imagen: ${stored.error.message}`);
      // Sin asociación a inspección: la medida correctiva puede documentarse después
      // de completar la inspección que originó el hallazgo.
      const photo = await supabase.from("evidence_photos").insert({
        project_id: projectId, uploaded_by: auth.data.user.id,
        evidence_type: "after", orientation: "unknown",
        description: description.trim() || null, original_file_path: path,
      }).select("id").single();
      if (photo.error || !photo.data) throw new Error(`Archivo cargado, pero falló el registro: ${photo.error?.message ?? "Sin identificador"}. Ruta para revisión: ${path}`);
      const linked = await supabase.rpc("traza_attach_finding_response_photo", {
        p_response_id: responseId, p_photo_id: photo.data.id,
      });
      if (linked.error) throw new Error(`Fotografía registrada, pero no vinculada: ${linked.error.message}. ID de fotografía: ${photo.data.id}`);
      setFile(null); setDescription(""); setSuccess("Fotografía de subsanación asociada a esta respuesta.");
      const input = document.getElementById(`traza-response-file-${responseId}`) as HTMLInputElement | null;
      if (input) input.value = "";
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la evidencia.");
    } finally { setBusy(false); }
  }

  return <div className={styles.wrap}>
    <span className={styles.heading}>Fotografías de esta respuesta ({photos.length})</span>
    {photos.length > 0 && <div className={styles.gallery}>{photos.map(photo =>
      <div key={photo.id} className={styles.item}>
        {photo.url ? <a href={photo.url} target="_blank" rel="noopener noreferrer"><img src={photo.url} alt={photo.description || "Evidencia de subsanación"} loading="lazy" /></a>
          : <span className={styles.error}>Enlace privado no disponible</span>}
        <span>{photo.description || "Sin descripción"}</span>
        <span>{new Date(photo.captured_at).toLocaleString("es-CL")}</span>
      </div>)}</div>}
    {canUpload && <form className={styles.form} onSubmit={e => void upload(e)}>
      <label>Agregar evidencia de subsanación (máximo 10 MB)
        <input id={`traza-response-file-${responseId}`} type="file" accept="image/jpeg,image/png,image/webp" required onChange={e => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <label>Descripción
        <textarea maxLength={1000} value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Describe la corrección ejecutada" />
      </label>
      <button type="submit" className={styles.button} disabled={busy || !file}>{busy ? "Guardando…" : "Adjuntar a esta respuesta"}</button>
    </form>}
    {error && <span className={styles.error} role="alert">{error}</span>}
    {success && <span className={styles.ok} role="status">{success}</span>}
  </div>;
}
