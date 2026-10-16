"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

type Metric = {
  title: string;
  value: string;
  detail: string;
  tone: "blue" | "green" | "amber" | "red" | "gray";
};

type Profile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type WorkIdentity = {
  id: string;
  corporate_email: string;
  job_title: string | null;
  status: "pending" | "verified" | "inactive" | "rejected";
  verified_at: string | null;
  valid_from: string;
  valid_until: string | null;
};

type ProjectMember = {
  project_id: string;
  role:
    | "if_admin"
    | "aif_environmental"
    | "contractor_environmental"
    | "environmental_manager"
    | "viewer";
  job_title: string | null;
  status: "invited" | "active" | "temporarily_inactive" | "ended";
  valid_from: string;
  valid_until: string | null;
  work_identity_id: string | null;
};

type Project = {
  id: string;
  name: string;
  project_code: string | null;
  status: "draft" | "active" | "finished" | "archived";
  start_date: string | null;
  expected_end_date: string | null;
};

type ProjectAccess = Project & {
  membership: ProjectMember;
};

const baseMetrics: Metric[] = [
  { title: "Alertas", value: "6", detail: "2 críticas", tone: "red" },
  { title: "Hallazgos", value: "3", detail: "2 en gestión", tone: "amber" },
  { title: "Inspecciones", value: "12", detail: "este mes", tone: "blue" },
  { title: "Obligaciones", value: "4", detail: "2 próximas", tone: "amber" },
  { title: "Permisos", value: "8", detail: "1 próximo a vencer", tone: "amber" },
  { title: "Cierre mensual", value: "Septiembre", detail: "En revisión", tone: "blue" },
];

const nav = [
  ["Dashboard", "▣"],
  ["Alertas", "⚠"],
  ["Inspecciones", "▤"],
  ["Hallazgos", "●"],
  ["Requisitos", "✓"],
  ["Obligaciones", "✓"],
  ["Permisos", "▣"],
  ["Residuos", "♻"],
  ["Cierre mensual", "▤"],
  ["Informes", "▤"],
  ["Configuración", "⚙"],
];

const roleLabels: Record<ProjectMember["role"], string> = {
  if_admin: "Administrador IF",
  aif_environmental: "AIF Medio Ambiente",
  contractor_environmental: "Contratista Medio Ambiente",
  environmental_manager: "Encargado Ambiental",
  viewer: "Consulta",
};

export default function Home() {
  const router = useRouter();

  const [active, setActive] = useState("Dashboard");
  const [area, setArea] = useState("Medio Ambiente");

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [workIdentity, setWorkIdentity] = useState<WorkIdentity | null>(null);
  const [projects, setProjects] = useState<ProjectAccess[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [unreadAlertCount, setUnreadAlertCount] = useState(0);
  const [criticalAlertCount, setCriticalAlertCount] = useState(0);
  const [openFindingCount, setOpenFindingCount] = useState(0);
  const [managedFindingCount, setManagedFindingCount] = useState(0);
  const [monthlyInspectionCount, setMonthlyInspectionCount] = useState(0);
  const [openObligationCount, setOpenObligationCount] = useState(0);
  const [urgentObligationCount, setUrgentObligationCount] = useState(0);
  const [permitCount, setPermitCount] = useState(0);
  const [expiringPermitCount, setExpiringPermitCount] = useState(0);
  const [closureLabel, setClosureLabel] = useState("Sin cierre");
  const [closureDetail, setClosureDetail] = useState("Sin período registrado");

  const [checkingSession, setCheckingSession] = useState(true);
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState("");

  useEffect(() => {
    if (!supabase) {
      setCheckingSession(false);
      setLoadingData(false);
      return;
    }

    const client = supabase!;

    async function initialize() {
      const { data: sessionData } = await client.auth.getSession();

      if (!sessionData.session) {
        router.replace("/login");
        return;
      }

      const currentUser = sessionData.session.user;
      setUser(currentUser);
      setCheckingSession(false);

      const [
        { data: profileData, error: profileError },
        { data: identitiesData, error: identitiesError },
        { data: membershipsData, error: membershipsError },
      ] = await Promise.all([
        client
          .from("profiles")
          .select("id, first_name, last_name, display_name, avatar_url")
          .eq("id", currentUser.id)
          .maybeSingle(),

        client
          .from("work_identities")
          .select(
            "id, corporate_email, job_title, status, verified_at, valid_from, valid_until"
          )
          .eq("user_id", currentUser.id)
          .order("verified_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false }),

        client
          .from("project_members")
          .select(
            "project_id, role, job_title, status, valid_from, valid_until, work_identity_id"
          )
          .eq("user_id", currentUser.id)
          .in("status", ["active", "temporarily_inactive"])
          .order("valid_from", { ascending: false }),
      ]);

      if (profileError || identitiesError || membershipsError) {
        setDataError(
          profileError?.message ||
            identitiesError?.message ||
            membershipsError?.message ||
            "No fue posible cargar tus datos de TRAZA."
        );
        setLoadingData(false);
        return;
      }

      setProfile((profileData as Profile | null) ?? null);

      const identities = (identitiesData ?? []) as WorkIdentity[];
      const verifiedIdentity =
        identities.find((identity) => identity.status === "verified") ??
        identities[0] ??
        null;
      setWorkIdentity(verifiedIdentity);

      const memberships = (membershipsData ?? []) as ProjectMember[];

      if (memberships.length === 0) {
        setProjects([]);
        setSelectedProjectId("");
        setLoadingData(false);
        return;
      }

      const projectIds = [...new Set(memberships.map((item) => item.project_id))];

      const { data: projectsData, error: projectsError } = await client
        .from("projects")
        .select(
          "id, name, project_code, status, start_date, expected_end_date"
        )
        .in("id", projectIds)
        .order("name", { ascending: true });

      if (projectsError) {
        setDataError(projectsError.message);
        setLoadingData(false);
        return;
      }

      const projectRows = (projectsData ?? []) as Project[];

      const accessRows: ProjectAccess[] = projectRows.map((project) => {
        const membership =
          memberships.find(
            (membership) =>
              membership.project_id === project.id &&
              membership.status === "active"
          ) ??
          memberships.find(
            (membership) => membership.project_id === project.id
          )!;

        return {
          ...project,
          membership,
        };
      });

      setProjects(accessRows);
      setSelectedProjectId(accessRows[0]?.id ?? "");
      setLoadingData(false);
    }

    initialize();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace("/login");
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!supabase || !selectedProjectId) {
      setUnreadAlertCount(0);
      setCriticalAlertCount(0);
      setOpenFindingCount(0);
      setManagedFindingCount(0);
      setMonthlyInspectionCount(0);
      setOpenObligationCount(0);
      setUrgentObligationCount(0);
      setPermitCount(0);
      setExpiringPermitCount(0);
      setClosureLabel("Sin cierre");
      setClosureDetail("Sin período registrado");
      return;
    }

    const client = supabase!;
    let cancelled = false;

    async function loadDashboardData() {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const monthStart = `${year}-${month}-01`;
      const nextMonth = new Date(year, now.getMonth() + 1, 1);
      const nextMonthStart = `${nextMonth.getFullYear()}-${String(
        nextMonth.getMonth() + 1
      ).padStart(2, "0")}-01`;

      const today = now.toISOString().slice(0, 10);
      const thirtyDays = new Date(now);
      thirtyDays.setDate(thirtyDays.getDate() + 30);
      const thirtyDaysFromNow = thirtyDays.toISOString().slice(0, 10);

      const [
        { data: unreadData, error: unreadError },
        { count: criticalCount, error: criticalError },
        { count: findingsCount, error: findingsError },
        { count: managedCount, error: managedError },
        { count: inspectionsCount, error: inspectionsError },
        { count: obligationsCount, error: obligationsError },
        { count: urgentObligationsCount, error: urgentObligationsError },
        { count: permitsTotal, error: permitsError },
        { count: expiringPermits, error: expiringPermitsError },
        { data: closureData, error: closureError },
      ] = await Promise.all([
        client.rpc("get_unread_alert_count", {
          p_project_id: selectedProjectId,
        }),

        client
          .from("project_alerts")
          .select("id", { count: "exact", head: true })
          .eq("project_id", selectedProjectId)
          .eq("status", "unread")
          .eq("priority", "critical"),

        client
          .from("findings")
          .select("id", { count: "exact", head: true })
          .eq("project_id", selectedProjectId)
          .not("status", "in", '("closed","cancelled")'),

        client
          .from("findings")
          .select("id", { count: "exact", head: true })
          .eq("project_id", selectedProjectId)
          .eq("status", "in_management"),

        client
          .from("inspections")
          .select("id", { count: "exact", head: true })
          .eq("project_id", selectedProjectId)
          .gte("inspection_date", monthStart)
          .lt("inspection_date", nextMonthStart),

        client
          .from("environmental_obligations")
          .select("id", { count: "exact", head: true })
          .eq("project_id", selectedProjectId)
          .in("status", ["pending", "upcoming", "in_progress", "overdue"]),

        client
          .from("environmental_obligations")
          .select("id", { count: "exact", head: true })
          .eq("project_id", selectedProjectId)
          .in("status", ["upcoming", "overdue"]),

        client
          .from("environmental_permits")
          .select("id", { count: "exact", head: true })
          .eq("project_id", selectedProjectId)
          .not("status", "in", '("not_applicable","rejected")'),

        client
          .from("environmental_permits")
          .select("id", { count: "exact", head: true })
          .eq("project_id", selectedProjectId)
          .eq("status", "valid")
          .gte("valid_until", today)
          .lte("valid_until", thirtyDaysFromNow),

        client
          .from("monthly_closures")
          .select("period_month, status")
          .eq("project_id", selectedProjectId)
          .order("period_month", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      const firstError =
        unreadError ||
        criticalError ||
        findingsError ||
        managedError ||
        inspectionsError ||
        obligationsError ||
        urgentObligationsError ||
        permitsError ||
        expiringPermitsError ||
        closureError;

      if (firstError) {
        setDataError(firstError.message || "No fue posible cargar el Dashboard.");
        return;
      }

      setUnreadAlertCount(Number(unreadData ?? 0));
      setCriticalAlertCount(criticalCount ?? 0);
      setOpenFindingCount(findingsCount ?? 0);
      setManagedFindingCount(managedCount ?? 0);
      setMonthlyInspectionCount(inspectionsCount ?? 0);
      setOpenObligationCount(obligationsCount ?? 0);
      setUrgentObligationCount(urgentObligationsCount ?? 0);
      setPermitCount(permitsTotal ?? 0);
      setExpiringPermitCount(expiringPermits ?? 0);

      if (closureData) {
        const [closureYear, closureMonth] = closureData.period_month.split("-");
        const monthNames = [
          "Enero",
          "Febrero",
          "Marzo",
          "Abril",
          "Mayo",
          "Junio",
          "Julio",
          "Agosto",
          "Septiembre",
          "Octubre",
          "Noviembre",
          "Diciembre",
        ];
        const monthIndex = Number(closureMonth) - 1;
        setClosureLabel(
          `${monthNames[monthIndex] ?? closureMonth} ${closureYear}`
        );

        const closureStatusLabels: Record<string, string> = {
          open: "Abierto",
          under_review: "En revisión",
          pending_contractor: "Pendiente contratista",
          pending_aif: "Pendiente AIF",
          ready_to_close: "Listo para cerrar",
          closed: "Cerrado",
          reopened: "Reabierto",
        };

        setClosureDetail(
          closureStatusLabels[closureData.status] ?? closureData.status
        );
      } else {
        setClosureLabel("Sin cierre");
        setClosureDetail("Sin período registrado");
      }
    }

    loadDashboardData();

    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  const dashboardMetrics = useMemo(
    () =>
      baseMetrics.map((metric) => {
        if (metric.title === "Alertas") {
          return {
            ...metric,
            value: String(unreadAlertCount),
            detail: `${criticalAlertCount} críticas`,
          };
        }

        if (metric.title === "Hallazgos") {
          return {
            ...metric,
            value: String(openFindingCount),
            detail: `${managedFindingCount} en gestión`,
          };
        }

        if (metric.title === "Inspecciones") {
          return {
            ...metric,
            value: String(monthlyInspectionCount),
            detail: "este mes",
          };
        }

        if (metric.title === "Obligaciones") {
          return {
            ...metric,
            value: String(openObligationCount),
            detail: `${urgentObligationCount} próximas/vencidas`,
          };
        }

        if (metric.title === "Permisos") {
          return {
            ...metric,
            value: String(permitCount),
            detail: `${expiringPermitCount} próximos a vencer`,
          };
        }

        if (metric.title === "Cierre mensual") {
          return {
            ...metric,
            value: closureLabel,
            detail: closureDetail,
          };
        }

        return metric;
      }),
    [
      unreadAlertCount,
      criticalAlertCount,
      openFindingCount,
      managedFindingCount,
      monthlyInspectionCount,
      openObligationCount,
      urgentObligationCount,
      permitCount,
      expiringPermitCount,
      closureLabel,
      closureDetail,
    ]
  );

  const statusText = useMemo(
    () =>
      `${openFindingCount} hallazgos abiertos · ${urgentObligationCount} obligaciones próximas/vencidas · ${expiringPermitCount} permisos próximos a vencer`,
    [openFindingCount, urgentObligationCount, expiringPermitCount]
  );

  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? null;

  const userLabel =
    profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email ||
    "Usuario TRAZA";

  const workLabel =
    selectedProject?.membership.job_title ||
    workIdentity?.job_title ||
    (selectedProject
      ? roleLabels[selectedProject.membership.role]
      : "Sin proyecto activo");

  async function handleLogout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (checkingSession || loadingData) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f4f7fb",
          color: "#102a43",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        Cargando TRAZA...
      </main>
    );
  }

  if (!supabase) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "#f4f7fb",
          color: "#102a43",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        Falta configurar la conexión con Supabase.
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.brandMark}>T</div>
          <div>
            <strong>TRAZA</strong>
            <span>Gestión de proyectos</span>
          </div>
        </div>

        <nav className={styles.nav}>
          {nav.map(([label, icon]) => (
            <button
              key={label}
              className={`${styles.navItem} ${
                active === label ? styles.navActive : ""
              }`}
              onClick={() => {
                if (label === "Configuración") {
                  router.push("/configuracion");
                  return;
                }
                setActive(label);
              }}
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <span>TRAZA v1</span>
          <small>Área inicial: Medio Ambiente</small>
        </div>
      </aside>

      <section className={styles.content}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>Proyecto activo</span>
            <h1>{active}</h1>
          </div>

          <div className={styles.userBox}>
            <button className={styles.bell} title="Alertas no leídas">
              🔔{unreadAlertCount > 0 ? ` ${unreadAlertCount}` : ""}
            </button>
            <div>
              <strong>{userLabel}</strong>
              <span>{workLabel}</span>
            </div>
            <button
              onClick={handleLogout}
              style={{
                border: "1px solid #d9e2ec",
                background: "white",
                color: "#486581",
                padding: "9px 12px",
                borderRadius: 10,
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Salir
            </button>
          </div>
        </header>

        {dataError && (
          <section
            style={{
              background: "#fff5f5",
              border: "1px solid #ffd2d2",
              color: "#b42318",
              borderRadius: 12,
              padding: 14,
              marginBottom: 18,
            }}
          >
            No fue posible cargar tus datos: {dataError}
          </section>
        )}

        <section className={styles.filters}>
          <label>
            Proyecto
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              disabled={projects.length === 0}
            >
              {projects.length === 0 ? (
                <option value="">Sin proyectos asignados</option>
              ) : (
                projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.project_code
                      ? `${project.project_code} — ${project.name}`
                      : project.name}
                  </option>
                ))
              )}
            </select>
          </label>

          <label>
            Área
            <select value={area} onChange={(e) => setArea(e.target.value)}>
              <option>Medio Ambiente</option>
              <option disabled>Prevención de Riesgos</option>
              <option disabled>Calidad</option>
              <option disabled>Terreno</option>
              <option disabled>Laboratorio</option>
            </select>
          </label>
        </section>

        {selectedProject && (
          <section
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              marginBottom: 18,
              color: "#627d98",
              fontSize: 13,
            }}
          >
            <span>
              Estado proyecto: <strong>{selectedProject.status}</strong>
            </span>
            <span>·</span>
            <span>
              Rol:{" "}
              <strong>{roleLabels[selectedProject.membership.role]}</strong>
            </span>
            <span>·</span>
            <span>
              Membresía:{" "}
              <strong>{selectedProject.membership.status}</strong>
            </span>
            {workIdentity && (
              <>
                <span>·</span>
                <span>
                  Identidad laboral: <strong>{workIdentity.status}</strong>
                </span>
              </>
            )}
          </section>
        )}

        <section className={styles.statusPanel}>
          <div>
            <span className={styles.statusLabel}>
              Estado ambiental del proyecto
            </span>
            <div className={styles.statusTitle}>
              <span className={styles.statusDot} />
              ATENCIÓN
            </div>
            <p>{statusText}</p>
          </div>
          <button className={styles.primaryButton}>Ver alertas</button>
        </section>

        <section className={styles.metrics}>
          {dashboardMetrics.map((metric) => (
            <article key={metric.title} className={styles.metricCard}>
              <div className={`${styles.tone} ${styles[metric.tone]}`} />
              <span>{metric.title}</span>
              <strong>{metric.value}</strong>
              <small>{metric.detail}</small>
            </article>
          ))}
        </section>

        <section className={styles.lowerGrid}>
          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.eyebrow}>Seguimiento</span>
                <h2>Actividad reciente</h2>
              </div>
              <button>Ver todo</button>
            </div>

            <div className={styles.activity}>
              <div>
                <span className={styles.ok}>✓</span>
                <p>
                  <strong>Inspección ambiental completada</strong>
                  <small>Registro actualizado</small>
                </p>
                <time>Hoy</time>
              </div>
              <div>
                <span className={styles.warn}>!</span>
                <p>
                  <strong>Hallazgo N°024 actualizado</strong>
                  <small>En gestión por contratista</small>
                </p>
                <time>Hoy</time>
              </div>
              <div>
                <span className={styles.info}>↗</span>
                <p>
                  <strong>Evidencia incorporada</strong>
                  <small>Fotografía asociada a inspección</small>
                </p>
                <time>Ayer</time>
              </div>
              <div>
                <span className={styles.warn}>!</span>
                <p>
                  <strong>Permiso próximo a vencer</strong>
                  <small>Revisión requerida</small>
                </p>
                <time>2 días</time>
              </div>
            </div>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.eyebrow}>Período actual</span>
                <h2>Cierre mensual</h2>
              </div>
            </div>

            <div className={styles.closureBox}>
              <span>{closureLabel}</span>
              <strong>{closureDetail}</strong>
              <div className={styles.progress}>
                <i />
              </div>
              <small>
                Información obtenida desde el proyecto seleccionado.
              </small>
            </div>
          </article>
        </section>

        <footer className={styles.note}>
          TRAZA v1 — Usuario, identidad laboral y proyectos conectados a Supabase.
        </footer>
      </section>
    </main>
  );
}
