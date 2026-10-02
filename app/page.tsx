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

const metrics: Metric[] = [
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

  const statusText = useMemo(
    () =>
      "3 hallazgos abiertos · 2 obligaciones próximas · 1 permiso próximo a vencer",
    []
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
            <button className={styles.bell}>🔔</button>
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
          {metrics.map((metric) => (
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
              <span>Septiembre 2026</span>
              <strong>En revisión</strong>
              <div className={styles.progress}>
                <i />
              </div>
              <small>
                Los indicadores ambientales todavía son datos de demostración.
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
