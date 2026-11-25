"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import styles from "./home.module.css";

import { TRAZA_MODULES as modules } from "@/lib/modules";
import { getSelectedProject, saveSelectedProject, clearSelectedProject } from "@/lib/selectedProject";

type Membership = { project_id: string; role: string; status: string; valid_from: string | null; valid_until: string | null };
type Project = { id: string; name: string; project_code: string | null };
type Permission = { project_id: string; module_id: string; access_level: string };
type Activation = { project_id: string; module_id: string; enabled: boolean };

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [selected, setSelected] = useState("");
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [activations, setActivations] = useState<Activation[]>([]);
  const [permissionSetup, setPermissionSetup] = useState(false);

  useEffect(() => {
    let alive = true;
    const client = supabase;
    if (!client) { setError("Faltan las variables de conexión de Supabase."); setLoading(false); return; }
    const load = async () => {
      const { data: auth, error: authError } = await client.auth.getUser();
      if (!alive) return;
      if (authError || !auth.user) { router.replace("/login"); return; }
      setEmail(auth.user.email || "Usuario TRAZA");
      setUserId(auth.user.id);
      const { data: members, error: memberError } = await client.from("project_members")
        .select("project_id, role, status, valid_from, valid_until")
        .eq("user_id", auth.user.id).eq("status", "active");
      if (!alive) return;
      if (memberError) { setError(memberError.message); setLoading(false); return; }
      const today = new Date().toISOString().slice(0, 10);
      const active = ((members || []) as Membership[]).filter(m => (!m.valid_from || m.valid_from <= today) && (!m.valid_until || m.valid_until >= today));
      setMemberships(active);
      if (active.length === 0) { setLoading(false); return; }
      const ids = [...new Set(active.map(m => m.project_id))];
      const { data: p, error: pError } = await client.from("projects").select("id, name, project_code").in("id", ids).order("name");
      if (!alive) return;
      if (pError) { setError(pError.message); setLoading(false); return; }
      setProjects((p || []) as Project[]);
      const projectList = (p || []) as Project[];
      const savedProject = getSelectedProject(auth.user.id);
      const initialProject = projectList.some(item => item.id === savedProject) ? savedProject! : (projectList[0]?.id || "");
      setSelected(initialProject);
      if (initialProject) saveSelectedProject(auth.user.id, initialProject);
      // Fail closed: without readable permission tables every module stays locked.
      const [permResult, activationResult] = await Promise.all([
        client.from("project_module_permissions").select("project_id, module_id, access_level").eq("user_id", auth.user.id).in("project_id", ids),
        client.from("project_modules").select("project_id, module_id, enabled").in("project_id", ids),
      ]);
      if (!alive) return;
      if (permResult.error || activationResult.error) {
        setError("No se pudieron verificar los permisos de módulos; todos los accesos permanecen bloqueados.");
      } else {
        setPermissionSetup(true);
        setPermissions((permResult.data || []) as Permission[]);
        setActivations((activationResult.data || []) as Activation[]);
      }
      setLoading(false);
    };
    void load();
    const { data: { subscription } } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/login");
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, [router]);

  const membership = memberships.find(m => m.project_id === selected);
  const available = useMemo(() => modules.map(m => {
    const enabled = permissionSetup && activations.some(a => a.project_id === selected && a.module_id === m.id && a.enabled);
    const granted = permissionSetup && permissions.some(p => p.project_id === selected && p.module_id === m.id && ["view", "edit", "approve", "admin"].includes(p.access_level));
    // Only the existing environmental route is implemented in this phase.
    return { ...m, enabled, granted, ready: m.id === "ambiental", accessible: enabled && granted && m.id === "ambiental" };
  }), [activations, membership, permissionSetup, permissions, selected]);

  const chooseProject = (id: string) => {
    setSelected(id);
    if (userId) saveSelectedProject(userId, id);
  };
  const logout = async () => { if (userId) clearSelectedProject(userId); if (supabase) await supabase.auth.signOut(); router.replace("/login"); };
  if (loading) return <main className={styles.center}>Cargando TRAZA…</main>;
  return <main className={styles.shell}>
    <header className={styles.top}>
      <div><div className={styles.brand}>TRAZA</div><div className={styles.subbrand}>Gestión integral de obras</div></div>
      <div className={styles.account}><span>{email}</span><button onClick={logout}>Salir</button></div>
    </header>
    <div className={styles.content}>
      <div className={styles.intro}><div><span className={styles.eyebrow}>PORTAL DE ESPECIALIDADES</span><h1>Inicio</h1><p>Selecciona la especialidad autorizada para tu contrato.</p></div></div>
      {error && <div className={styles.error} role="alert">{error}</div>}
      <section className={styles.projectBox}>
        <label htmlFor="project">Contrato / proyecto activo</label>
        <select id="project" value={selected} onChange={e => chooseProject(e.target.value)} disabled={!projects.length}>
          {!projects.length && <option value="">Sin proyectos activos asignados</option>}
          {projects.map(p => <option key={p.id} value={p.id}>{p.project_code ? `${p.project_code} — ` : ""}{p.name}</option>)}
        </select>
        {membership && <small>Rol asignado en este contrato: {membership.role}</small>}
      </section>
      <section className={styles.section}>
        <div className={styles.sectionHead}><h2>Especialidades</h2><span>{available.filter(m => m.accessible).length} acceso(s) operativos</span></div>
        <div className={styles.grid}>{available.map(m =>
          <button type="button" key={m.id} disabled={!m.accessible} className={`${styles.card} ${!m.accessible ? styles.locked : ""}`} onClick={() => router.push(`${m.path}?project=${encodeURIComponent(selected)}`)}>
            <span className={styles.icon} aria-hidden="true">{m.icon}</span><strong>{m.name}</strong><span className={styles.desc}>{m.desc}</span>
            <span className={styles.status}>{m.accessible ? "Ingresar →" : !m.enabled ? "No habilitado" : !m.granted ? "🔒 Sin autorización" : "Próximamente"}</span>
          </button>
        )}</div>
      </section>
      <div className={styles.note}>Los módulos sin autorización no permiten ingresar. El control definitivo también debe aplicarse en la base de datos mediante RLS, no solo en esta pantalla.</div>
    </div>
  </main>;
}
