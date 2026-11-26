"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "./NotificationCenter.module.css";

type AlertRow = {
  id: string;
  alert_type: string;
  priority: string;
  title: string;
  message: string | null;
  related_entity_id: string | null;
  due_date: string | null;
  created_at: string;
};

type ReadRow = { alert_id: string };

const AMBIENTAL_TYPES = ["obligation_due", "obligation_overdue"];

function displayDate(value: string | null): string {
  if (!value) return "Sin fecha";
  const d = value.slice(0, 10);
  const parts = d.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
}

export default function NotificationCenter({ projectId, onSelectObligation }: {
  projectId: string;
  onSelectObligation: (id: string) => void;
}) {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [onlyUnread, setOnlyUnread] = useState(true);
  const [loading, setLoading] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!supabase || !projectId) return;
    setLoading(true);
    setError("");
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!auth.user) {
        setAlerts([]);
        setReadIds([]);
        throw new Error("Inicia sesión para consultar las notificaciones.");
      }

      // La política RLS de project_alerts decide qué alertas son visibles.
      const { data: rows, error: alertsError } = await supabase
        .from("project_alerts")
        .select("id,alert_type,priority,title,message,related_entity_id,due_date,created_at")
        .eq("project_id", projectId)
        .in("alert_type", AMBIENTAL_TYPES)
        .in("status", ["unread", "read"])
        .order("created_at", { ascending: false })
        .limit(100);
      if (alertsError) throw alertsError;
      const visible = (rows ?? []) as AlertRow[];
      setAlerts(visible);

      if (visible.length === 0) { setReadIds([]); return; }
      const { data: reads, error: readsError } = await supabase
        .from("project_alert_user_reads")
        .select("alert_id")
        .eq("user_id", auth.user.id)
        .in("alert_id", visible.map(a => a.id));
      if (readsError) throw readsError;
      setReadIds(((reads ?? []) as ReadRow[]).map(row => row.alert_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron consultar las notificaciones.");
    } finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const readSet = useMemo(() => new Set(readIds), [readIds]);
  const unreadCount = alerts.filter(a => !readSet.has(a.id)).length;
  const displayed = onlyUnread ? alerts.filter(a => !readSet.has(a.id)) : alerts;

  async function markRead(id: string) {
    if (!supabase || markingId) return;
    setMarkingId(id);
    setError("");
    try {
      const { error: rpcError } = await supabase.rpc("mark_project_alert_read", { p_alert_id: id });
      if (rpcError) throw rpcError;
      setReadIds(previous => previous.includes(id) ? previous : [...previous, id]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo marcar como leída.");
    } finally { setMarkingId(null); }
  }

  return <section className={styles.center} aria-label="Centro de notificaciones ambientales">
    <div className={styles.toolbar}>
      <button type="button" className={styles.bell} onClick={() => setExpanded(v => !v)} aria-expanded={expanded} aria-controls="traza-notification-list">
        <span aria-hidden="true">🔔</span> Notificaciones {unreadCount > 0 && <span className={styles.count}>{unreadCount} sin leer</span>}
      </button>
      <button type="button" className={styles.refresh} onClick={() => void refresh()} disabled={loading}>{loading ? "Consultando…" : "Actualizar notificaciones"}</button>
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {expanded && <div id="traza-notification-list" className={styles.content}>
      <div className={styles.filters}>
        <strong>Notificaciones del proyecto</strong>
        <label><input type="checkbox" checked={onlyUnread} onChange={e => setOnlyUnread(e.target.checked)} /> Solo sin leer</label>
      </div>
      {displayed.length === 0 ? <p className={styles.empty}>No hay notificaciones {onlyUnread ? "sin leer" : "activas"}.</p> :
        <ul className={styles.list}>{displayed.map(alert => <li key={alert.id} className={styles.item}>
          <div className={styles.text}>
            <strong>{alert.title}</strong>
            <span>{alert.message || "Sin descripción"}</span>
            <small>Vence: {displayDate(alert.due_date)} · Prioridad: {alert.priority} · {readSet.has(alert.id) ? "Leída" : "Sin leer"}</small>
          </div>
          <div className={styles.actions}>
            {alert.related_entity_id && <button type="button" onClick={() => {
              onSelectObligation(alert.related_entity_id!);
              document.getElementById("obligation-select")?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}>Abrir obligación</button>}
            {!readSet.has(alert.id) && <button type="button" onClick={() => void markRead(alert.id)} disabled={markingId !== null}>{markingId === alert.id ? "Guardando…" : "Marcar como leída"}</button>}
          </div>
        </li>)}</ul>}
      <p className={styles.note}>La lectura es individual: no modifica la alerta global del proyecto. Esta primera versión muestra avisos de obligaciones ambientales.</p>
    </div>}
  </section>;
}
