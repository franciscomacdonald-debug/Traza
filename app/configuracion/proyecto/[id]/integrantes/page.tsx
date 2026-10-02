"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import styles from "./integrantes.module.css";

type MemberRow = {
  id: string;
  user_id: string;
  organization_id: string;
  work_identity_id: string | null;
  role: string;
  job_title: string | null;
  status: string;
  valid_from: string;
  valid_until: string | null;
  designation_reason: string | null;
};

type CandidateRow = {
  work_identity_id: string;
  user_id: string;
  display_name: string;
  corporate_email: string;
  job_title: string | null;
  organization_id: string;
  organization_name: string;
};

const roleOptions = [
  { value: "aif_environmental", label: "Especialista Ambiental AIF" },
  { value: "contractor_environmental", label: "Responsable Ambiental Contratista" },
  { value: "environmental_manager", label: "Encargado Ambiental" },
  { value: "viewer", label: "Consulta" },
];

export default function IntegrantesProyectoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);

  const [userId, setUserId] = useState("");
  const [identityId, setIdentityId] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [role, setRole] = useState("aif_environmental");
  const [jobTitle, setJobTitle] = useState("");
  const [validFrom, setValidFrom] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");

  async function loadData() {
    if (!supabase) {
      setMessage("Falta configurar la conexión con Supabase.");
      setLoading(false);
      return;
    }

    const client = supabase!;

    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData.session) {
      router.replace("/login");
      return;
    }

    const [
      { data: membersData, error: membersError },
      { data: candidatesData, error: candidatesError },
    ] = await Promise.all([
      client
        .from("project_members")
        .select("id, user_id, organization_id, work_identity_id, role, job_title, status, valid_from, valid_until, designation_reason")
        .eq("project_id", projectId)
        .order("valid_from", { ascending: false }),

      client.rpc("get_project_member_candidates", {
        p_project_id: projectId,
      }),
    ]);

    if (membersError || candidatesError) {
      setMessage(
        membersError?.message ||
          candidatesError?.message ||
          "No fue posible cargar integrantes."
      );
      setLoading(false);
      return;
    }

    setMembers((membersData ?? []) as MemberRow[]);
    setCandidates((candidatesData ?? []) as CandidateRow[]);
    setLoading(false);
      return;
    }

    setMembers((membersData ?? []) as MemberRow[]);
    setIdentities((identitiesData ?? []) as IdentityRow[]);
    setProfiles((profilesData ?? []) as ProfileRow[]);
    setOrganizations((organizationsData ?? []) as OrganizationRow[]);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [projectId]);

  function getCandidateByUserId(id: string) {
    return candidates.find((candidate) => candidate.user_id === id);
  }

  function getProfileName(id: string) {
    return getCandidateByUserId(id)?.display_name ?? id;
  }

  function getOrganizationName(id: string) {
    return (
      candidates.find((candidate) => candidate.organization_id === id)
        ?.organization_name ?? id
    );
  }

  function selectIdentity(id: string) {
    setIdentityId(id);
    const identity = candidates.find(
      (candidate) => candidate.work_identity_id === id
    );

    if (!identity) {
      setUserId("");
      setOrganizationId("");
      setJobTitle("");
      return;
    }

    setUserId(identity.user_id);
    setOrganizationId(identity.organization_id);
    setJobTitle(identity.job_title ?? "");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSuccess("");

    if (!supabase) return;

    if (!identityId || !userId || !organizationId) {
      setMessage("Selecciona una identidad laboral verificada.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.rpc("add_project_member", {
      p_project_id: projectId,
      p_user_id: userId,
      p_organization_id: organizationId,
      p_work_identity_id: identityId,
      p_role: role,
      p_job_title: jobTitle.trim() || null,
      p_valid_from: validFrom,
      p_reason: reason.trim() || null,
    });

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setSuccess("Integrante agregado correctamente.");
    setIdentityId("");
    setUserId("");
    setOrganizationId("");
    setJobTitle("");
    setReason("");
    await loadData();
  }

  if (loading) {
    return <main className={styles.loading}>Cargando integrantes...</main>;
  }

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <button onClick={() => router.push("/")}>← Dashboard</button>
        <button onClick={() => router.push(`/configuracion/proyecto/${projectId}/activacion`)}>
          Preparación y activación
        </button>
      </div>

      <section className={styles.hero}>
        <span className={styles.eyebrow}>Equipo del proyecto</span>
        <h1>Integrantes y responsables</h1>
        <p>
          Agrega responsables usando identidades laborales verificadas.
        </p>
      </section>

      <section className={styles.grid}>
        <article className={styles.card}>
          <h2>Agregar integrante</h2>

          <form className={styles.form} onSubmit={handleSubmit}>
            <label>
              Identidad laboral verificada
              <select value={identityId} onChange={(e) => selectIdentity(e.target.value)}>
                <option value="">Seleccionar</option>
                {candidates.map((identity) => (
                  <option
                    key={identity.work_identity_id}
                    value={identity.work_identity_id}
                  >
                    {identity.display_name} · {identity.corporate_email} ·{" "}
                    {identity.organization_name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Organización
              <input
                value={organizationId ? getOrganizationName(organizationId) : ""}
                readOnly
                placeholder="Se completa desde la identidad laboral"
              />
            </label>

            <label>
              Rol en el proyecto
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                {roleOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Cargo
              <input
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="Cargo dentro del proyecto"
              />
            </label>

            <label>
              Vigente desde
              <input
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
              />
            </label>

            <label>
              Motivo de designación
              <textarea
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej. Designación inicial del Especialista Ambiental AIF"
              />
            </label>

            {message && <div className={styles.error}>{message}</div>}
            {success && <div className={styles.success}>{success}</div>}

            <button type="submit" disabled={saving}>
              {saving ? "Agregando..." : "Agregar integrante"}
            </button>
          </form>
        </article>

        <article className={styles.card}>
          <h2>Integrantes actuales</h2>

          <div className={styles.members}>
            {members.length === 0 ? (
              <p className={styles.empty}>Aún no hay integrantes registrados.</p>
            ) : (
              members.map((member) => (
                <div className={styles.member} key={member.id}>
                  <div>
                    <strong>{getProfileName(member.user_id)}</strong>
                    <span>{member.job_title || member.role}</span>
                    <small>{getOrganizationName(member.organization_id)}</small>
                  </div>

                  <div className={styles.memberMeta}>
                    <b>{member.status}</b>
                    <small>Desde {member.valid_from}</small>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
