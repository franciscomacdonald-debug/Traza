"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AccessLevel } from "@/lib/modules";
import styles from "./ObligationDocuments.module.css";

type Obligation = { id: string; title: string; description: string | null; status: string; due_date: string | null };
type Source = { id: string; title: string; reference_code: string | null; source_scope: string };
type Link = { id: string; obligation_id: string; source_id: string; notes: string | null };
type Version = { id: string; source_id: string; version_label: string; status: string; file_path: string | null; external_reference: string | null };
const BUCKET = "traza-documents";
const statusLabel: Record<string, string> = { pending: "Pendiente", upcoming: "Próxima", in_progress: "En curso", completed: "Cumplida", overdue: "Vencida", not_applicable: "No aplica", cancelled: "Cancelada" };

export default function ObligationDocuments({ projectId, accessLevel }: { projectId: string; accessLevel: AccessLevel }) {
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
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
