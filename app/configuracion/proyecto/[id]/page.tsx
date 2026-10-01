"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import styles from "./proyecto.module.css";

type ProjectRow = {
  id: string;
  name: string;
  project_code: string | null;
  status: string;
};

type SettingsRow = {
  contract_number: string | null;
  contract_type: string | null;
  safi_code: string | null;
  region: string | null;
  commune: string | null;
  general_location: string | null;
  contracting_authority: string | null;
  inspection_entity: string | null;
  has_rca: boolean;
  monthly_closure_target_day: number;
  report_code_prefix: string | null;
  report_template_name: string | null;
  notes: string | null;
};

export default function ConfigurarProyectoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");

  const [contractNumber, setContractNumber] = useState("");
  const [contractType, setContractType] = useState("");
  const [safiCode, setSafiCode] = useState("");
  const [region, setRegion] = useState("");
  const [commune, setCommune] = useState("");
  const [generalLocation, setGeneralLocation] = useState("");
  const [contractingAuthority, setContractingAuthority] = useState("");
  const [inspectionEntity, setInspectionEntity] = useState("");
  const [hasRca, setHasRca] = useState(false);
  const [monthlyClosureTargetDay, setMonthlyClosureTargetDay] = useState("5");
  const [reportCodePrefix, setReportCodePrefix] = useState("INF-MA");
  const [reportTemplateName, setReportTemplateName] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!supabase) {
      setChecking(false);
      return;
    }

    const client = supabase!;

    async function load() {
      const { data: sessionData } = await client.auth.getSession();

      if (!sessionData.session) {
        router.replace("/login");
        return;
      }

      const { data: projectData, error: projectError } = await client
        .from("projects")
        .select("id, name, project_code, status")
        .eq("id", projectId)
        .single();

      if (projectError) {
        setMessage(projectError.message);
        setChecking(false);
        return;
      }

      setProject(projectData as ProjectRow);

      const { data: settingsData, error: settingsError } = await client
        .from("project_environmental_settings")
        .select(
          "contract_number, contract_type, safi_code, region, commune, general_location, contracting_authority, inspection_entity, has_rca, monthly_closure_target_day, report_code_prefix, report_template_name, notes"
        )
        .eq("project_id", projectId)
        .maybeSingle();

      if (settingsError) {
        setMessage(settingsError.message);
        setChecking(false);
        return;
      }

      if (settingsData) {
        const s = settingsData as SettingsRow;
        setContractNumber(s.contract_number ?? "");
        setContractType(s.contract_type ?? "");
        setSafiCode(s.safi_code ?? "");
        setRegion(s.region ?? "");
        setCommune(s.commune ?? "");
        setGeneralLocation(s.general_location ?? "");
        setContractingAuthority(s.contracting_authority ?? "");
        setInspectionEntity(s.inspection_entity ?? "");
        setHasRca(Boolean(s.has_rca));
        setMonthlyClosureTargetDay(String(s.monthly_closure_target_day ?? 5));
        setReportCodePrefix(s.report_code_prefix ?? "INF-MA");
        setReportTemplateName(s.report_template_name ?? "");
        setNotes(s.notes ?? "");
      }

      setChecking(false);
    }

    load();
  }, [projectId, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSuccess("");

    if (!supabase) {
      setMessage("Falta configurar la conexión con Supabase.");
      return;
    }

    const targetDay = Number(monthlyClosureTargetDay);

    if (!Number.isInteger(targetDay) || targetDay < 1 || targetDay > 31) {
      setMessage("El día objetivo de cierre debe estar entre 1 y 31.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.rpc("configure_traza_project", {
      p_project_id: projectId,
      p_contract_number: contractNumber.trim() || null,
      p_contract_type: contractType || null,
      p_safi_code: safiCode.trim() || null,
      p_region: region.trim() || null,
      p_commune: commune.trim() || null,
      p_general_location: generalLocation.trim() || null,
      p_contracting_authority: contractingAuthority.trim() || null,
      p_inspection_entity: inspectionEntity.trim() || null,
      p_has_rca: hasRca,
      p_monthly_closure_target_day: targetDay,
      p_report_code_prefix: reportCodePrefix.trim() || null,
      p_report_template_name: reportTemplateName.trim() || null,
      p_notes: notes.trim() || null,
    });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setSuccess("Configuración guardada correctamente.");
  }

  if (checking) {
    return <main className={styles.loading}>Cargando configuración...</main>;
  }

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <button onClick={() => router.push("/")}>← Dashboard</button>
        <button onClick={() => router.push("/configuracion")}>Configuración</button>
      </div>

      <section className={styles.hero}>
        <span className={styles.eyebrow}>Configuración del proyecto</span>
        <h1>{project?.name ?? "Proyecto TRAZA"}</h1>
        <p>
          {project?.project_code ? `Código ${project.project_code} · ` : ""}
          Estado: <strong>{project?.status ?? "—"}</strong>
        </p>
      </section>

      <form className={styles.form} onSubmit={handleSubmit}>
        <section className={styles.card}>
          <h2>Datos del contrato</h2>

          <div className={styles.grid}>
            <label>
              Número de contrato
              <input
                value={contractNumber}
                onChange={(e) => setContractNumber(e.target.value)}
                placeholder="Ej. AIF-CSRC-03"
              />
            </label>

            <label>
              Tipo de contrato
              <select
                value={contractType}
                onChange={(e) => setContractType(e.target.value)}
              >
                <option value="">Seleccionar</option>
                <option value="aif">AIF</option>
                <option value="construction">Construcción</option>
                <option value="consulting">Consultoría</option>
                <option value="other">Otro</option>
              </select>
            </label>

            <label>
              Código SAFI
              <input
                value={safiCode}
                onChange={(e) => setSafiCode(e.target.value)}
                placeholder="Opcional"
              />
            </label>

            <label>
              Autoridad contratante
              <input
                value={contractingAuthority}
                onChange={(e) => setContractingAuthority(e.target.value)}
                placeholder="Ej. MOP / DOH"
              />
            </label>

            <label>
              Entidad de inspección
              <input
                value={inspectionEntity}
                onChange={(e) => setInspectionEntity(e.target.value)}
                placeholder="Ej. AIF"
              />
            </label>
          </div>
        </section>

        <section className={styles.card}>
          <h2>Ubicación</h2>

          <div className={styles.grid}>
            <label>
              Región
              <input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="Ej. Valparaíso"
              />
            </label>

            <label>
              Comuna
              <input
                value={commune}
                onChange={(e) => setCommune(e.target.value)}
                placeholder="Ej. San Antonio"
              />
            </label>

            <label className={styles.full}>
              Ubicación general
              <input
                value={generalLocation}
                onChange={(e) => setGeneralLocation(e.target.value)}
                placeholder="Descripción general del emplazamiento"
              />
            </label>
          </div>
        </section>

        <section className={styles.card}>
          <h2>Gestión ambiental</h2>

          <div className={styles.grid}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={hasRca}
                onChange={(e) => setHasRca(e.target.checked)}
              />
              El proyecto cuenta con RCA
            </label>

            <label>
              Día objetivo de cierre mensual
              <input
                type="number"
                min="1"
                max="31"
                value={monthlyClosureTargetDay}
                onChange={(e) => setMonthlyClosureTargetDay(e.target.value)}
              />
            </label>
          </div>
        </section>

        <section className={styles.card}>
          <h2>Informes</h2>

          <div className={styles.grid}>
            <label>
              Prefijo de informes
              <input
                value={reportCodePrefix}
                onChange={(e) => setReportCodePrefix(e.target.value)}
                placeholder="INF-MA"
              />
            </label>

            <label>
              Plantilla de informe
              <input
                value={reportTemplateName}
                onChange={(e) => setReportTemplateName(e.target.value)}
                placeholder="Nombre de plantilla"
              />
            </label>

            <label className={styles.full}>
              Notas
              <textarea
                rows={5}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observaciones generales del proyecto"
              />
            </label>
          </div>
        </section>

        {message && <div className={styles.error}>{message}</div>}
        {success && <div className={styles.success}>{success}</div>}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => router.push("/")}
          >
            Cancelar
          </button>

          <button type="submit" disabled={loading}>
            {loading ? "Guardando..." : "Guardar configuración"}
          </button>
        </div>
      </form>
    </main>
  );
}
