"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import type { AccessLevel } from "@/lib/modules";
import styles from "./ObligationDocuments.module.css";

type Obligation = { id: string; title: string; description: string | null; status: string; due_date: string | null };
type Source = { id: string; title: string; reference_code: string | null; source_scope: string };
type Link = { id: string; obligation_id: string; source_id: string; notes: string | null };
type Evidence = { id: string; obligation_id: string; file_path: string | null; description: string | null; uploaded_by: string | null; created_at: string };
type Version = { id: string; source_id: string; version_label: string; status: string; file_path: string | null; external_reference: string | null };
const BUCKET = "traza-documents";
const statusLabel: Record<string, string> = { pending: "Pendiente", upcoming: "Próxima", in_progress: "En curso", completed: "Cumplida", overdue: "Vencida", not_applicable: "No aplica", cancelled: "Cancelada" };

export default function ObligationDocuments({ projectId, accessLevel }: { projectId: string; accessLevel: AccessLevel }) {
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [evidences, setEvidences] = useState<Evidence[]>([]);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceDescription, setEvidenceDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const [sourceToAdd, setSourceToAdd] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const canEdit = accessLevel === "edit" || accessLevel === "admin";

  const load = useCallback(async () => {
    if (!supabase) { setError("Falta configurar Supabase."); setLoading(false); return; }
    setLoading(true);
    setError("");
    const [ob, docs, joined] = await Promise.all([
      supabase.from("environmental_obligations").select("id,title,description,status,due_date").eq("project_id", projectId).order("created_at", { ascending: false }),
      supabase.from("environmental_sources").select("id,title,reference_code,source_scope").or(`project_id.eq.${projectId},and(source_scope.eq.central,project_id.is.null)`).order("title"),
      supabase.from("environmental_obligation_documents").select("id,obligation_id,source_id,notes").eq("project_id", projectId),
    ]);
    if (ob.error || docs.error || joined.error) {
      setError(ob.error?.message || docs.error?.message || joined.error?.message || "No se pudieron cargar las obligaciones.");
      setLoading(false);
      return;
    }
    const obligationRows = (ob.data ?? []) as Obligation[];
    const sourceRows = (docs.data ?? []) as Source[];
    setObligations(obligationRows);
    setSources(sourceRows);
    setLinks((joined.data ?? []) as Link[]);
    setSelected(previous => obligationRows.some(o => o.id === previous) ? previous : obligationRows[0]?.id ?? "");
    if (obligationRows.length) {
      const res = await supabase.from("obligation_evidence")
        .select("id,obligation_id,file_path,description,uploaded_by,created_at")
        .in("obligation_id", obligationRows.map(o => o.id))
        .order("created_at", { ascending: false });
      if (res.error) setError(res.error.message);
      setEvidences((res.data ?? []) as Evidence[]);
    } else setEvidences([]);
    if (sourceRows.length) {
      const revisionResult = await supabase.from("environmental_source_versions")
        .select("id,source_id,version_label,status,file_path,external_reference")
        .in("source_id", sourceRows.map(s => s.id)).eq("status", "active");
      if (revisionResult.error) setError(revisionResult.error.message);
      setVersions((revisionResult.data ?? []) as Version[]);
    } else setVersions([]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setSourceToAdd(""); }, [selected]);

  async function addLink() {
    if (!supabase || !canEdit || !selected || !sourceToAdd || saving) return;
    setSaving(true); setError(""); setMessage("");
    const { error: insertError } = await supabase.from("environmental_obligation_documents")
      .insert({ project_id: projectId, obligation_id: selected, source_id: sourceToAdd });
    if (insertError) setError(`No se pudo vincular: ${insertError.message}`);
    else { setMessage("Documento vinculado correctamente."); setSourceToAdd(""); await load(); }
    setSaving(false);
  }

  async function removeLink(link: Link) {
    if (!supabase || !canEdit || saving) return;
    if (!window.confirm("¿Desvincular este documento? El PDF y sus versiones no se eliminarán.")) return;
    setSaving(true); setError(""); setMessage("");
    const { error: deleteError } = await supabase.from("environmental_obligation_documents")
      .delete().eq("id", link.id).eq("project_id", projectId);
    if (deleteError) setError(`No se pudo desvincular: ${deleteError.message}`);
    else { setMessage("Vínculo eliminado. El documento original se conserva."); await load(); }
    setSaving(false);
  }

  async function openPdf(version: Version) {
    if (!supabase || !version.file_path) return;
    setError("");
    const { data, error: urlError } = await supabase.storage.from(BUCKET).createSignedUrl(version.file_path, 60);
    if (urlError || !data?.signedUrl) { setError(urlError?.message || "No se pudo abrir el PDF."); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  const chosen = obligations.find(o => o.id === selected);
  const chosenEvidences = evidences.filter(e => e.obligation_id === selected);
  const MAX_BYTES = 10 * 1024 * 1024;
  const acceptedMime: Record<string, string> = {
    "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png"
  };

  async function uploadEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !canEdit || !selected || !evidenceFile || uploading) return;
    setError(""); setMessage("");
    const extension = acceptedMime[evidenceFile.type];
    if (!extension) { setError("Solo se permiten archivos PDF, JPG o PNG."); return; }
    if (evidenceFile.size === 0 || evidenceFile.size > MAX_BYTES) {
      setError("El archivo debe tener contenido y pesar como máximo 10 MB."); return;
    }
    setUploading(true);
    // Se usa un nombre único y no se permite sobrescribir archivos.
    const objectPath = `${projectId}/evidencias/${selected}/${crypto.randomUUID()}.${extension}`;
    try {
      const { error: uploadError } = await supabase.storage.from(BUCKET)
        .upload(objectPath, evidenceFile, { contentType: evidenceFile.type, upsert: false });
      if (uploadError) throw new Error(`No se pudo subir el archivo: ${uploadError.message}`);
      const { error: rpcError } = await supabase.rpc("register_obligation_evidence", {
        p_obligation_id: selected,
        p_file_path: objectPath,
        p_description: evidenceDescription.trim() || null
      });
      if (rpcError) throw new Error(`El archivo se subió, pero no se pudo registrar la evidencia: ${rpcError.message}. Comunica este error al administrador para revisar el archivo sin registrar.`);
      setEvidenceFile(null);
      setEvidenceDescription("");
      const fileInput = document.getElementById("traza-evidence-file") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";
      setMessage("Evidencia registrada correctamente.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ocurrió un error durante la carga.");
    } finally {
      setUploading(false);
    }
  }

  async function openEvidence(evidence: Evidence, download: boolean) {
    if (!supabase || !evidence.file_path) return;
    setError("");
    const filename = evidence.file_path.split("/").at(-1) || "evidencia";
    const { data, error: urlError } = await supabase.storage.from(BUCKET).createSignedUrl(
      evidence.file_path, 60, download ? { download: filename } : undefined
    );
    if (urlError || !data?.signedUrl) {
      setError(urlError?.message || "No se pudo obtener el archivo."); return;
    }
    // Se abre una URL temporal privada, nunca un enlace público permanente.
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  const linked = links.filter(l => l.obligation_id === selected);
  const eligible = sources.filter(s => !linked.some(l => l.source_id === s.id));

  return <div className={styles.container}>
    <div className={styles.header}><div><h2>Obligaciones ambientales</h2><p>Consulta el respaldo documental y su versión vigente.</p></div><button type="button" onClick={() => void load()} disabled={loading || saving}>Actualizar</button></div>
    {error && <div className={styles.error} role="alert">{error}</div>}
    {message && <div className={styles.message} role="status">{message}</div>}
    {loading ? <p>Cargando obligaciones…</p> : obligations.length === 0 ? <p>Aún no existen obligaciones ambientales en este proyecto.</p> : <>
      <label className={styles.selectLabel} htmlFor="obligation-select">Seleccionar obligación</label>
      <select id="obligation-select" value={selected} onChange={e => setSelected(e.target.value)} className={styles.select}>
        {obligations.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
      </select>
      {chosen && <article className={styles.card}><div className={styles.cardHead}><h3>{chosen.title}</h3><span className={styles.badge}>{statusLabel[chosen.status] || chosen.status}</span></div><p>{chosen.description || "Sin descripción."}</p><h4>Documentos asociados</h4>
        {linked.length === 0 ? <p className={styles.muted}>Esta obligación aún no tiene documentos vinculados.</p> : linked.map(link => {
          const source = sources.find(s => s.id === link.source_id);
          const version = versions.find(v => v.source_id === link.source_id);
          return <div className={styles.document} key={link.id}><div className={styles.documentText}>
            <strong>{source?.title || "Documento no disponible"}</strong>
            <span>{source?.reference_code || "Sin código"} · {version ? `Versión vigente: ${version.version_label}` : "Sin versión vigente"}</span>
            {link.notes && <small>{link.notes}</small>}
          </div><div className={styles.actions}>
            {version?.file_path && <button type="button" onClick={() => void openPdf(version)}>Ver PDF</button>}
            {version?.external_reference && !version.file_path && <a href={version.external_reference} target="_blank" rel="noopener noreferrer">Referencia</a>}
            {canEdit && <button type="button" className={styles.danger} disabled={saving} onClick={() => void removeLink(link)}>Desvincular</button>}
          </div></div>;
        })}
        <section className={styles.evidences} aria-label="Evidencias de cumplimiento">
          <h4>Evidencias de cumplimiento</h4>
          <p className={styles.muted}>Fotografías y certificados asociados a esta obligación. Cargar una evidencia no marca la obligación como cumplida ni supone su aprobación.</p>
          {chosenEvidences.length === 0 ? <p className={styles.muted}>Todavía no se han registrado evidencias.</p> : chosenEvidences.map(e => (
            <div className={styles.document} key={e.id}>
              <div className={styles.documentText}>
                <strong>{e.description || e.file_path?.split("/").at(-1) || "Evidencia"}</strong>
                <span>{new Date(e.created_at).toLocaleString("es-CL")} · Registro de evidencia</span>
              </div>
              <div className={styles.actions}>
                {e.file_path && <>
                  <button type="button" onClick={() => void openEvidence(e, false)}>Ver</button>
                  <button type="button" onClick={() => void openEvidence(e, true)}>Descargar</button>
                </>}
              </div>
            </div>
          ))}
          {canEdit && <form onSubmit={e => void uploadEvidence(e)} className={styles.evidenceForm}>
            <h4>Agregar evidencia</h4>
            <label htmlFor="traza-evidence-file">Archivo PDF, JPG o PNG (máx. 10 MB)</label>
            <input id="traza-evidence-file" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required
              onChange={e => setEvidenceFile(e.target.files?.[0] || null)} disabled={uploading} />
            <label htmlFor="traza-evidence-description">Descripción</label>
            <textarea id="traza-evidence-description" value={evidenceDescription}
              onChange={e => setEvidenceDescription(e.target.value)} maxLength={1000} rows={3}
              placeholder="Ej.: Certificado de disposición final de residuos, noviembre 2026" disabled={uploading} />
            <button type="submit" disabled={uploading || !evidenceFile}>{uploading ? "Subiendo evidencia…" : "Subir evidencia"}</button>
          </form>}
        </section>
        {canEdit && <div className={styles.add}><label htmlFor="doc-add">Vincular otro documento</label><div className={styles.addRow}>
          <select id="doc-add" className={styles.select} value={sourceToAdd} onChange={e => setSourceToAdd(e.target.value)}>
            <option value="">Selecciona un documento</option>
            {eligible.map(s => <option key={s.id} value={s.id}>{s.title}{s.reference_code ? ` (${s.reference_code})` : ""}</option>)}
          </select><button type="button" disabled={!sourceToAdd || saving} onClick={() => void addLink()}>{saving ? "Guardando…" : "Vincular"}</button>
        </div></div>}
      </article>}
    </>}
  </div>;
}
