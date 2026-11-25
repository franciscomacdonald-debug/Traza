"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import type { AccessLevel } from "@/lib/modules";
import styles from "./DocumentLibrary.module.css";

type Source = { id: string; project_id: string | null; source_scope: "central" | "project"; source_type: string; title: string; reference_code: string | null; issuing_authority: string | null; description: string | null; created_at: string };
type Version = { id: string; source_id: string; version_label: string; status: string; file_path: string | null; external_reference: string | null; publication_date: string | null; effective_from: string | null; effective_until: string | null; created_at: string; notes: string | null };
type AuditEvent = { id: number; entity_id: string | null; user_id: string | null; action: string; created_at: string; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null };
type SourceType = "legal_regulation" | "contract" | "technical_specification" | "pga" | "plan" | "procedure" | "rca" | "permit" | "resolution" | "mop_manual" | "technical_reference" | "other";
const types: { value: SourceType; label: string }[] = [
  { value: "legal_regulation", label: "Normativa legal" }, { value: "contract", label: "Contrato" }, { value: "technical_specification", label: "Especificaciones técnicas" },
  { value: "pga", label: "Plan de gestión ambiental" }, { value: "plan", label: "Plan" }, { value: "procedure", label: "Procedimiento" },
  { value: "rca", label: "RCA" }, { value: "permit", label: "Permiso" }, { value: "resolution", label: "Resolución" },
  { value: "mop_manual", label: "Manual MOP" }, { value: "technical_reference", label: "Referencia técnica" }, { value: "other", label: "Otro" },
];
const typeLabel = (value: string) => types.find(t => t.value === value)?.label || value;
const stateLabel: Record<string, string> = { draft: "Borrador", active: "Vigente", superseded: "Reemplazada", repealed: "Derogada", expired: "Vencida", archived: "Archivada" };
const initialSource = { title: "", source_type: "technical_specification" as SourceType, reference_code: "", issuing_authority: "", description: "" };
const BUCKET = "traza-documents";
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const initialVersion = { version_label: "", file_path: "", external_reference: "", publication_date: "", effective_from: "", effective_until: "", notes: "" };

export default function DocumentLibrary({ projectId, projectName, accessLevel }: { projectId: string; projectName: string; accessLevel: AccessLevel }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditMessage, setAuditMessage] = useState("");
  const [showHistory, setShowHistory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modal, setModal] = useState<"source" | "version" | "edit" | null>(null);
  const [editingVersion, setEditingVersion] = useState<Version | null>(null);
  const [sourceForm, setSourceForm] = useState(initialSource);
  const [versionForm, setVersionForm] = useState(initialVersion);
  const [activeSource, setActiveSource] = useState<Source | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [selectedPdf, setSelectedPdf] = useState<File | null>(null);
  const canEdit = accessLevel === "edit" || accessLevel === "admin";
  const canApprove = accessLevel === "approve" || accessLevel === "admin";

  const refresh = useCallback(async () => {
    if (!supabase) { setError("Falta la configuración de Supabase."); setLoading(false); return; }
    setLoading(true);
    setError("");
    const { data: docs, error: sourceError } = await supabase.from("environmental_sources")
      .select("id,project_id,source_scope,source_type,title,reference_code,issuing_authority,description,created_at")
      .or(`source_scope.eq.central,project_id.eq.${projectId}`)
      .order("created_at", { ascending: false });
    if (sourceError) { setError(`No se pudieron consultar las fuentes: ${sourceError.message}`); setLoading(false); return; }
    const found = (docs || []) as Source[];
    setSources(found);
    if (!found.length) { setVersions([]); setAuditEvents([]); setLoading(false); return; }
    const { data: revs, error: versionError } = await supabase.from("environmental_source_versions")
      .select("id,source_id,version_label,status,file_path,external_reference,publication_date,effective_from,effective_until,created_at,notes")
      .in("source_id", found.map(s => s.id))
      .order("created_at", { ascending: false });
    if (versionError) { setError(`No se pudieron consultar las versiones: ${versionError.message}`); setVersions([]); }
    else setVersions((revs || []) as Version[]);
    // La auditoría tiene una política RLS independiente (administradores del proyecto).
    // Un usuario sin acceso al historial conserva la biblioteca funcional.
    const ids = (revs || []).map(v => v.id);
    if (ids.length) {
      const { data: events, error: auditError } = await supabase.from("audit_log")
        .select("id,entity_id,user_id,action,created_at,old_data,new_data")
        .eq("project_id", projectId)
        .eq("entity_type", "environmental_source_version")
        .in("entity_id", ids)
        .order("created_at", { ascending: false })
        .limit(200);
      if (auditError) { setAuditEvents([]); setAuditMessage("Historial disponible solo para responsables autorizados del proyecto."); }
      else { setAuditEvents((events || []) as AuditEvent[]); setAuditMessage(""); }
    } else { setAuditEvents([]); setAuditMessage(""); }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void refresh(); }, [refresh]);
  const versionMap = useMemo(() => {
    const map = new Map<string, Version[]>();
    for (const version of versions) map.set(version.source_id, [...(map.get(version.source_id) || []), version]);
    return map;
  }, [versions]);
  const filtered = useMemo(() => sources.filter(s => {
    const matchesText = [s.title, s.reference_code, s.issuing_authority].some(v => (v || "").toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()));
    return matchesText && (scope === "all" || s.source_scope === scope) && (typeFilter === "all" || s.source_type === typeFilter);
  }), [sources, query, scope, typeFilter]);
  const activeCount = versions.filter(v => v.status === "active").length;
  const draftCount = versions.filter(v => v.status === "draft").length;

  async function createSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !canEdit || saving) return;
    setSaving(true); setError(""); setNotice("");
    const { data, error: rpcError } = await supabase.rpc("create_project_environmental_source", {
      p_project_id: projectId,
      p_source_type: sourceForm.source_type,
      p_title: sourceForm.title.trim(),
      p_reference_code: sourceForm.reference_code.trim() || null,
      p_issuing_authority: sourceForm.issuing_authority.trim() || null,
      p_description: sourceForm.description.trim() || null,
    });
    setSaving(false);
    if (rpcError) { setError(`No se pudo registrar el documento: ${rpcError.message}`); return; }
    setModal(null); setSourceForm(initialSource); setNotice("Documento registrado correctamente.");
    if (typeof data === "string") setExpanded(data);
    await refresh();
  }
  function validatePdf(file: File): string | null {
    if (!file.name.toLowerCase().endsWith(".pdf") || file.type && file.type !== "application/pdf") return "Selecciona un archivo PDF válido.";
    if (file.size === 0) return "El archivo está vacío.";
    if (file.size > MAX_PDF_BYTES) return "El PDF supera los 20 MB permitidos.";
    return null;
  }

  async function uploadPdf(source: Source, version: Version, file: File): Promise<string> {
    if (!supabase || source.source_scope !== "project" || source.project_id !== projectId || version.source_id !== source.id || version.status !== "draft") {
      throw new Error("La versión no está disponible para recibir archivos.");
    }
    const invalid = validatePdf(file);
    if (invalid) throw new Error(invalid);
    const filePath = `${projectId}/ambiental/${source.id}/${version.id}/${crypto.randomUUID()}.pdf`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(filePath, file, {
      contentType: "application/pdf", upsert: false, cacheControl: "3600",
    });
    if (uploadError) throw new Error(`No se pudo subir el PDF: ${uploadError.message}`);
    const { error: linkError } = await supabase.rpc("attach_project_environmental_source_version_file", {
      p_version_id: version.id, p_file_path: filePath,
    });
    if (linkError) throw new Error(`PDF subido, pero no vinculado: ${linkError.message}. Contacta al administrador indicando la versión ${version.id}.`);
    return filePath;
  }

  async function uploadExistingVersion(source: Source, version: Version, file: File | undefined) {
    if (!file || !canEdit || saving || uploadingId) return;
    setUploadingId(version.id); setError(""); setNotice("");
    try {
      await uploadPdf(source, version, file);
      setNotice(`PDF cargado y vinculado a la versión ${version.version_label}.`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No fue posible subir el PDF.");
    } finally { setUploadingId(null); }
  }

  async function openPdf(source: Source, version: Version) {
    if (!supabase || !version.file_path) return;
    const prefix = `${projectId}/ambiental/${source.id}/${version.id}/`;
    if (!version.file_path.startsWith(prefix) || !version.file_path.toLowerCase().endsWith(".pdf")) {
      setError("Esta versión tiene una ruta antigua o externa, no un PDF guardado en TRAZA Storage.");
      return;
    }
    const { data, error: signedError } = await supabase.storage.from(BUCKET).createSignedUrl(version.file_path, 60);
    if (signedError || !data?.signedUrl) { setError(`No se pudo abrir el PDF: ${signedError?.message || "Archivo no disponible"}`); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function createVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !canEdit || !activeSource || saving) return;
    const source = activeSource;
    const file = selectedPdf;
    if (file) { const issue = validatePdf(file); if (issue) { setError(issue); return; } }
    setSaving(true); setError(""); setNotice("");
    try {
      const { data, error: rpcError } = await supabase.rpc("create_project_environmental_source_version", {
        p_source_id: source.id, p_version_label: versionForm.version_label.trim(),
        p_file_path: null,
        p_external_reference: versionForm.external_reference.trim() || null,
        p_publication_date: versionForm.publication_date || null,
        p_effective_from: versionForm.effective_from || null,
        p_effective_until: versionForm.effective_until || null,
        p_notes: versionForm.notes.trim() || null,
      });
      if (rpcError || typeof data !== "string") throw new Error(`No se pudo crear la versión: ${rpcError?.message || "ID no recibido"}`);
      let message = "Versión creada como borrador.";
      if (file) {
        try {
  await uploadPdf(source, {
  id: data,
  source_id: source.id,
  version_label: versionForm.version_label,
  status: "draft",
  file_path: null,
  external_reference: null,
  publication_date: null,
  effective_from: null,
  effective_until: null,
  created_at: "",
  notes: null
}, file);

          message = "Versión creada y PDF guardado en Storage.";
        } catch (e) {
          message = `Versión creada, pero no se pudo vincular el PDF: ${e instanceof Error ? e.message : "error desconocido"}. Puedes reintentar desde el borrador.`;
        }
      }
      setModal(null); setActiveSource(null); setVersionForm(initialVersion); setSelectedPdf(null);
      setNotice(message); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "No fue posible crear la versión."); }
    finally { setSaving(false); }
  }
  function openDraftEditor(source: Source, version: Version) {
    setActiveSource(source);
    setEditingVersion(version);
    setVersionForm({
      version_label: version.version_label,
      file_path: "",
      external_reference: version.external_reference || "",
      publication_date: version.publication_date || "",
      effective_from: version.effective_from || "",
      effective_until: version.effective_until || "",
      notes: version.notes || "",
    });
    setError(""); setModal("edit");
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !editingVersion || !canEdit || saving) return;
    setSaving(true); setError(""); setNotice("");
    const { error: rpcError } = await supabase.rpc("update_project_environmental_source_draft", {
      p_version_id: editingVersion.id,
      p_version_label: versionForm.version_label.trim(),
      p_publication_date: versionForm.publication_date || null,
      p_effective_from: versionForm.effective_from || null,
      p_effective_until: versionForm.effective_until || null,
      p_external_reference: versionForm.external_reference.trim() || null,
      p_notes: versionForm.notes.trim() || null,
    });
    setSaving(false);
    if (rpcError) { setError(`No se pudo editar el borrador: ${rpcError.message}`); return; }
    setModal(null); setEditingVersion(null); setNotice("Borrador actualizado y cambio registrado en auditoría.");
    await refresh();
  }

  function describeAudit(event: AuditEvent) {
    const actions: Record<string, string> = {
      environmental_source_version_activated: "Versión activada",
      environmental_source_version_file_attached: "PDF vinculado",
      environmental_source_version_draft_updated: "Borrador editado",
    };
    return actions[event.action] || event.action.replaceAll("_", " ");
  }

  async function activateVersion(version: Version) {
    if (!supabase || !canApprove || saving) return;
    if (!window.confirm(`¿Confirmas activar la versión ${version.version_label}? La versión vigente anterior será reemplazada.`)) return;
    setSaving(true); setError(""); setNotice("");
    const { error: rpcError } = await supabase.rpc("activate_project_environmental_source_version", { p_version_id: version.id });
    setSaving(false);
    if (rpcError) { setError(`No fue posible activar la versión: ${rpcError.message}`); return; }
    setNotice(`Versión ${version.version_label} activada correctamente.`); await refresh();
  }

  return <section className={styles.root}>
    <div className={styles.heading}>
      <div><span className={styles.eyebrow}>Medio Ambiente · Biblioteca</span><h2>Gestión documental ambiental</h2><p>{projectName} · Fuentes del proyecto y referencias centrales</p></div>
      {canEdit && <button className={styles.primary} onClick={() => { setError(""); setSourceForm(initialSource); setModal("source"); }}>+ Nuevo documento</button>}
    </div>
    <div className={styles.metrics}>
      <article><span>Fuentes disponibles</span><strong>{sources.length}</strong></article>
      <article><span>Versiones vigentes</span><strong>{activeCount}</strong></article>
      <article><span>Borradores</span><strong>{draftCount}</strong></article>
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    <div className={styles.toolbar}>
      <input aria-label="Buscar documentos" placeholder="Buscar por documento, código o autoridad..." value={query} onChange={e => setQuery(e.target.value)} />
      <select aria-label="Ámbito documental" value={scope} onChange={e => setScope(e.target.value)}><option value="all">Todos los ámbitos</option><option value="project">De este proyecto</option><option value="central">Centrales</option></select>
      <select aria-label="Tipo de documento" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}><option value="all">Todos los tipos</option>{types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
      <button className={styles.secondary} onClick={() => void refresh()} disabled={loading}>Actualizar</button>
    </div>
    {loading ? <p className={styles.empty}>Cargando documentos desde Supabase…</p> : filtered.length === 0 ? <div className={styles.empty}><strong>No hay documentos para mostrar.</strong><p>Puedes registrar la primera fuente del proyecto, si tienes permiso de edición.</p></div> :
      <div className={styles.list}>{filtered.map(source => {
        const revs = versionMap.get(source.id) || [];
        const official = revs.find(v => v.status === "active");
        return <article className={styles.document} key={source.id}>
          <button type="button" className={styles.documentHeading} aria-expanded={expanded === source.id} onClick={() => setExpanded(expanded === source.id ? null : source.id)}>
            <span className={styles.documentIcon}>▤</span><span className={styles.documentTitle}><strong>{source.title}</strong><small>{typeLabel(source.source_type)} · {source.reference_code || "Sin código"} · {source.source_scope === "central" ? "Fuente central" : "Fuente del proyecto"}</small></span>
            <span className={official ? styles.active : styles.muted}>{official ? `Vigente ${official.version_label}` : revs.length ? "Sin versión vigente" : "Sin versiones"}</span><span className={styles.chevron}>{expanded === source.id ? "−" : "+"}</span>
          </button>
          {expanded === source.id && <div className={styles.details}>
            {source.description && <p>{source.description}</p>}
            {source.issuing_authority && <p><strong>Autoridad:</strong> {source.issuing_authority}</p>}
            <div className={styles.detailsHeading}><strong>Versiones ({revs.length})</strong>{source.source_scope === "project" && canEdit && <button className={styles.secondary} onClick={() => { setActiveSource(source); setVersionForm(initialVersion); setSelectedPdf(null); setError(""); setModal("version"); }}>+ Agregar versión</button>}</div>
            {!revs.length ? <p className={styles.hint}>Aún no hay versiones de este documento.</p> : <div className={styles.versions}>{revs.map(version => <div key={version.id} className={styles.version}>
              <div><strong>{version.version_label}</strong><span className={version.status === "active" ? styles.active : styles.muted}>{stateLabel[version.status] || version.status}</span><small>{version.file_path ? (version.file_path.startsWith(`${projectId}/ambiental/${source.id}/${version.id}/`) ? "PDF almacenado en TRAZA" : `Ruta antigua (no verificada): ${version.file_path}`) : version.external_reference ? `Referencia: ${version.external_reference}` : "Sin archivo asociado"}</small></div>
              <div className={styles.versionActions}>
                {source.source_scope === "project" && version.status === "draft" && canEdit && <button type="button" className={styles.secondary} onClick={() => openDraftEditor(source, version)}>Editar borrador</button>}
                {version.file_path?.startsWith(`${projectId}/ambiental/${source.id}/${version.id}/`) && <button type="button" className={styles.secondary} onClick={() => void openPdf(source, version)}>Ver PDF</button>}
                {version.external_reference && /^https:\/\//i.test(version.external_reference) && <a className={styles.secondary} href={version.external_reference} target="_blank" rel="noopener noreferrer">Ver enlace</a>}
                {source.source_scope === "project" && version.status === "draft" && canEdit && !version.file_path && <label className={styles.uploadLabel}>{uploadingId === version.id ? "Subiendo…" : "Subir PDF"}<input type="file" accept=".pdf,application/pdf" disabled={!!uploadingId || saving} onChange={e => { void uploadExistingVersion(source, version, e.target.files?.[0]); e.target.value = ""; }}/></label>}
                {source.source_scope === "project" && version.status === "draft" && canApprove && <button className={styles.secondary} onClick={() => void activateVersion(version)} disabled={saving || !!uploadingId || (!version.file_path?.startsWith(`${projectId}/ambiental/${source.id}/${version.id}/`) && !/^https:\/\//i.test(version.external_reference || ""))}>Activar</button>}
              </div>
            </div>)}</div>}
            <div className={styles.detailsHeading}>
              <strong>Historial de actividad</strong>
              <button type="button" className={styles.secondary} onClick={() => setShowHistory(showHistory === source.id ? null : source.id)}>
                {showHistory === source.id ? "Ocultar historial" : "Ver historial"}
              </button>
            </div>
            {showHistory === source.id && <div className={styles.history}>
              {auditMessage && <p className={styles.hint}>{auditMessage}</p>}
              {auditEvents.filter(event => revs.some(v => v.id === event.entity_id)).length === 0
                ? <p className={styles.hint}>No hay actividades disponibles para estas versiones.</p>
                : auditEvents.filter(event => revs.some(v => v.id === event.entity_id)).map(event => {
                  const version = revs.find(v => v.id === event.entity_id);
                  return <div className={styles.historyItem} key={event.id}>
                    <strong>{describeAudit(event)} · {version?.version_label || "Versión"}</strong>
                    <small>{new Date(event.created_at).toLocaleString("es-CL")} · Usuario: {event.user_id || "Sin identificación"}</small>
                    {event.action === "environmental_source_version_draft_updated" && <small>Metadatos del borrador actualizados</small>}
                  </div>;
                })}
            </div>}
            <p className={styles.hint}>Los PDF nuevos se guardan en Storage privado. Las rutas antiguas no representan archivos disponibles y deben regularizarse.</p>
          </div>}
        </article>;
      })}</div>}
    {modal && <div className={styles.overlay} role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !saving) setModal(null); }}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className={styles.modalHead}><h3 id="modal-title">{modal === "source" ? "Nuevo documento ambiental" : modal === "edit" ? `Editar borrador · ${activeSource?.title}` : `Nueva versión · ${activeSource?.title}`}</h3><button type="button" aria-label="Cerrar" onClick={() => setModal(null)} disabled={saving}>✕</button></div>
        <form onSubmit={modal === "source" ? createSource : modal === "edit" ? saveDraft : createVersion} className={styles.form}>
          {error && <p className={styles.error} role="alert">{error}</p>}
          {modal === "source" ? <>
            <label>Título del documento *<input required maxLength={200} value={sourceForm.title} onChange={e => setSourceForm({ ...sourceForm, title: e.target.value })}/></label>
            <label>Tipo de documento *<select value={sourceForm.source_type} onChange={e => setSourceForm({ ...sourceForm, source_type: e.target.value as SourceType })}>{types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
            <label>Código de referencia<input value={sourceForm.reference_code} onChange={e => setSourceForm({ ...sourceForm, reference_code: e.target.value })}/></label>
            <label>Autoridad emisora<input value={sourceForm.issuing_authority} onChange={e => setSourceForm({ ...sourceForm, issuing_authority: e.target.value })}/></label>
            <label>Descripción<textarea rows={3} value={sourceForm.description} onChange={e => setSourceForm({ ...sourceForm, description: e.target.value })}/></label>
          </> : <>
            <label>Etiqueta de versión *<input required placeholder="Ej. V1, Rev. 02" value={versionForm.version_label} onChange={e => setVersionForm({ ...versionForm, version_label: e.target.value })}/></label>
            {modal === "version" && <label>Subir archivo PDF (opcional)<input type="file" accept=".pdf,application/pdf" onChange={e => setSelectedPdf(e.target.files?.[0] || null)}/><span className={styles.hint}>Máximo 20 MB. El PDF se subirá al bucket privado traza-documents.</span></label>}
            <label>Referencia externa<input value={versionForm.external_reference} onChange={e => setVersionForm({ ...versionForm, external_reference: e.target.value })}/></label>
            <div className={styles.dateGrid}><label>Publicación<input type="date" value={versionForm.publication_date} onChange={e => setVersionForm({ ...versionForm, publication_date: e.target.value })}/></label><label>Vigente desde<input type="date" value={versionForm.effective_from} onChange={e => setVersionForm({ ...versionForm, effective_from: e.target.value })}/></label><label>Vigente hasta<input type="date" min={versionForm.effective_from || undefined} value={versionForm.effective_until} onChange={e => setVersionForm({ ...versionForm, effective_until: e.target.value })}/></label></div>
            <label>Notas<textarea rows={3} value={versionForm.notes} onChange={e => setVersionForm({ ...versionForm, notes: e.target.value })}/></label>
            <p className={styles.hint}>{modal === "edit" ? "Solo se editan metadatos del borrador. El PDF ya asociado no se reemplaza desde aquí." : "La nueva versión se crea como borrador. Puedes subir el PDF ahora o después. Para activarla necesita un archivo guardado en TRAZA o una referencia HTTPS."}</p>
          </>}
          <div className={styles.actions}><button type="button" className={styles.secondary} onClick={() => setModal(null)} disabled={saving}>Cancelar</button><button className={styles.primary} type="submit" disabled={saving}>{saving ? "Guardando…" : modal === "source" ? "Registrar documento" : modal === "edit" ? "Guardar cambios" : "Crear borrador"}</button></div>
        </form>
      </section>
    </div>}
  </section>;
} 
