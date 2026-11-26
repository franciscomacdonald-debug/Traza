"use client";

import { useMemo, useState } from "react";
import styles from "./ObligationDashboard.module.css";

type Obligation = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  due_date: string | null;
};

type Filter = "all" | "completed" | "active" | "overdue" | "excluded";

const labels: Record<string, string> = {
  pending: "Pendiente",
  upcoming: "Próxima",
  in_progress: "En curso",
  completed: "Cumplida",
  overdue: "Vencida",
  not_applicable: "No aplica",
  cancelled: "Cancelada",
};

function todayLocal(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getCategory(o: Obligation, today: string): Exclude<Filter, "all"> {
  if (o.status === "completed") return "completed";
  if (o.status === "not_applicable" || o.status === "cancelled") return "excluded";
  if (o.status === "overdue" || (o.due_date !== null && o.due_date < today)) return "overdue";
  return "active";
}

export default function ObligationDashboard({ obligations, onSelect, selectedId }: {
  obligations: Obligation[];
  onSelect: (id: string) => void;
  selectedId: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const today = todayLocal();

  const metrics = useMemo(() => {
    const completed = obligations.filter(o => getCategory(o, today) === "completed").length;
    const active = obligations.filter(o => getCategory(o, today) === "active").length;
    const overdue = obligations.filter(o => getCategory(o, today) === "overdue").length;
    const excluded = obligations.filter(o => getCategory(o, today) === "excluded").length;
    const denominator = obligations.length - excluded;
    return { completed, active, overdue, excluded, denominator,
      percentage: denominator ? Math.round((10000 * completed) / denominator) / 100 : 0 };
  }, [obligations, today]);

  const matches = obligations.filter(o =>
    (filter === "all" || getCategory(o, today) === filter) &&
    `${o.title} ${o.description ?? ""}`.toLocaleLowerCase("es-CL")
      .includes(search.trim().toLocaleLowerCase("es-CL"))
  );

  const cards: { key: Filter; title: string; value: number }[] = [
    { key: "all", title: "Total de obligaciones", value: obligations.length },
    { key: "completed", title: "Cumplidas", value: metrics.completed },
    { key: "active", title: "Pendientes y en curso", value: metrics.active },
    { key: "overdue", title: "Vencidas", value: metrics.overdue },
  ];

  return <section className={styles.dashboard} aria-label="Indicadores de cumplimiento ambiental">
    <div className={styles.heading}>
      <div><h3>Indicadores de cumplimiento</h3><p>Datos del proyecto seleccionado, actualizados desde Supabase.</p></div>
      <span className={styles.note}>Se excluyen canceladas y no aplicables del porcentaje.</span>
    </div>
    <div className={styles.cards}>
      {cards.map(card => <button type="button" key={card.key}
        className={`${styles.metric} ${filter === card.key ? styles.activeMetric : ""}`}
        aria-pressed={filter === card.key} onClick={() => setFilter(card.key)}>
        <span>{card.title}</span><strong>{card.value}</strong>
      </button>)}
    </div>
    <div className={styles.progressHead}>
      <strong>Porcentaje de cumplimiento</strong><strong>{metrics.percentage.toLocaleString("es-CL", {maximumFractionDigits: 2})} %</strong>
    </div>
    <div className={styles.progressTrack} role="progressbar" aria-label="Cumplimiento ambiental"
      aria-valuenow={metrics.percentage} aria-valuemin={0} aria-valuemax={100}>
      <div className={styles.progressFill} style={{width: `${metrics.percentage}%`}} />
    </div>
    <div className={styles.filters}>
      <label htmlFor="traza-obligation-filter-search">Buscar obligación</label>
      <input id="traza-obligation-filter-search" value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Título o descripción" />
      <label htmlFor="traza-obligation-filter-status">Filtrar estado</label>
      <select id="traza-obligation-filter-status" value={filter}
        onChange={e => setFilter(e.target.value as Filter)}>
        <option value="all">Todas</option>
        <option value="completed">Cumplidas</option>
        <option value="active">Pendientes y en curso</option>
        <option value="overdue">Vencidas</option>
        <option value="excluded">Canceladas y no aplicables</option>
      </select>
    </div>
    <div className={styles.list} aria-live="polite">
      {matches.length === 0 ? <p className={styles.empty}>No hay obligaciones que coincidan con el filtro.</p> :
        matches.map(o => <button type="button" key={o.id}
          className={`${styles.item} ${selectedId === o.id ? styles.selectedItem : ""}`}
          onClick={() => { onSelect(o.id); document.getElementById("obligation-select")?.scrollIntoView({behavior:"smooth",block:"center"}); }}>
          <span className={styles.itemTitle}>{o.title}</span>
          <span className={styles.itemMeta}>
            <span>{getCategory(o, today) === "overdue" ? "Vencida" : labels[o.status] ?? o.status}</span>
            {o.due_date && <span>Vence: {o.due_date.split("-").reverse().join("/")}</span>}
          </span>
        </button>)}
    </div>
    <p className={styles.disclaimer}>El porcentaje indica estados registrados en TRAZA; no constituye una certificación del cumplimiento ambiental de la obra.</p>
  </section>;
}
