"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AccessLevel } from "@/lib/modules";
import styles from "./InspectionPhotos.module.css";

type Photo = {
  id: string;
  original_file_path: string;
  description: string | null;
  captured_at: string;
  uploaded_by: string;
};
type PhotoWithUrl = Photo & { signedUrl: string | null };

export default function InspectionPhotos({ projectId, inspectionId, inspectorUserId, inspectionStatus, accessLevel }: {
  projectId: string;
  inspectionId: string;
  inspectorUserId: string;
  inspectionStatus: string;
  accessLevel: AccessLevel;
}) {
  const [photos, setPhotos] = useState<PhotoWithUrl[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const canUpload = (accessLevel === "edit" || accessLevel === "approve" || accessLevel === "admin")
    && currentUserId === inspectorUserId && (inspectionStatus === "draft" || inspectionStatus === "in_progress");

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError("");
    const client = supabase;
    const result = await client.from("evidence_photos")
      .select("id, original_file_path, description, captured_at, uploaded_by")
      .eq("project_id", projectId)
      .eq("inspection_id", inspectionId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (result.error) {
      setError(`No se pudieron consultar las fotografías: ${result.error.message}`);
      setLoading(false);
      return;
    }
    const records = (result.data ?? []) as Photo[];
    const urls = await Promise.all(records.map(async (photo) => {
      const signed = await client.storage.from("traza-documents")
        .createSignedUrl(photo.original_file_path, 900);
      return { ...photo, signedUrl: signed.error ? null : signed.data?.signedUrl ?? null };
    }));
    setPhotos(urls);
    setLoading(false);
  }, [projectId, inspectionId]);

  useEffect(() => {
    let active = true;
    if (supabase) void supabase.auth.getUser().then(({ data }) => {
      if (active) setCurrentUserId(data.user?.id ?? "");
    });
    void load();
    return () => { active = false; };
  }, [load]);

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !canUpload || !file || uploading) return;
    setError(""); setMessage("");
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const allowed: Record<string, string[]> = {
      jpg: ["image/jpeg"], jpeg: ["image/jpeg"], png: ["image/png"], webp: ["image/webp"],
    };
    if (!allowed[extension]?.includes(file.type)) {
      setError("Selecciona una fotografía JPG, PNG o WEBP."); return;
    }
    if (file.size > 10 * 1024 * 1024 || file.size === 0) {
      setError("La fotografía debe pesar entre 1 byte y 10 MB."); return;
    }
    setUploading(true);
    const client = supabase;
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user || auth.user.id !== inspectorUserId) {
      setError("La sesión no permite subir fotografías a esta inspección.");
      setUploading(false); return;
    }
    const uuid = crypto.randomUUID();
    const path = `${projectId}/inspecciones/${inspectionId}/${uuid}.${extension}`;
    const stored = await client.storage.from("traza-documents").upload(path, file, {
      upsert: false, contentType: file.type, cacheControl: "3600",
    });
    if (stored.error) {
      setError(`No se pudo subir la imagen: ${stored.error.message}`);
      setUploading(false); return;
    }
    const orientation = "unknown";
    const inserted = await client.from("evidence_photos").insert({
      project_id: projectId,
      inspection_id: inspectionId,
      uploaded_by: auth.user.id,
      evidence_type: "inspection",
      description: description.trim() || null,
      original_file_path: path,
      orientation,
    });
    if (inserted.error) {
      setError(`La fotografía se subió al almacenamiento, pero no se pudo registrar: ${inserted.error.message}. Conserva este identificador para revisión: ${path}`);
    } else {
      setMessage("Fotografía incorporada a la inspección.");
      setDescription(""); setFile(null);
      const input = document.getElementById(`photo-file-${inspectionId}`) as HTMLInputElement | null;
      if (input) input.value = "";
      await load();
    }
    setUploading(false);
  }

  return <section className={styles.wrap} aria-label="Fotografías de inspección">
    <div className={styles.actions} style={{ justifyContent: "space-between" }}>
      <h4 className={styles.title}>Fotografías ({photos.length})</h4>
      <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => void load()} disabled={loading || uploading}>
        {loading ? "Cargando…" : "Actualizar fotografías"}
      </button>
    </div>
    {canUpload && <form onSubmit={(e) => void upload(e)} className={styles.wrap}>
      <label className={styles.field}>Seleccionar fotografía (JPG, PNG o WEBP; máximo 10 MB)
        <input id={`photo-file-${inspectionId}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
      </label>
      <label className={styles.field}>Descripción
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={1000} placeholder="Ej.: Almacenamiento de residuos en sector norte" />
      </label>
      <div className={styles.actions}>
        <button className={styles.button} type="submit" disabled={!file || uploading}>{uploading ? "Subiendo…" : "Adjuntar fotografía"}</button>
        <span className={styles.note}>Solo el inspector puede agregar fotos mientras la inspección esté abierta.</span>
      </div>
    </form>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {message && <p className={styles.success} role="status">{message}</p>}
    {!loading && photos.length === 0 && <p className={styles.note}>Esta inspección aún no tiene fotografías.</p>}
    <div className={styles.grid}>
      {photos.map((photo) => <article key={photo.id} className={styles.photo}>
        {photo.signedUrl ? <a href={photo.signedUrl} target="_blank" rel="noopener noreferrer">
          <img src={photo.signedUrl} alt={photo.description ?? "Fotografía de inspección"} loading="lazy" />
        </a> : <p className={styles.error}>No fue posible generar un enlace privado.</p>}
        <span className={styles.note}>{photo.description || "Sin descripción"}</span>
        <span className={styles.note}>{new Date(photo.captured_at).toLocaleString("es-CL")}</span>
      </article>)}
    </div>
  </section>;
}
