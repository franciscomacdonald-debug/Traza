"use client";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { AccessLevel, ModuleId } from "@/lib/modules";

type State = { status: "loading" | "allowed" | "denied"; message?: string; projectId?: string; accessLevel?: AccessLevel };
export default function ModuleGate({ moduleId, children }: { moduleId: ModuleId; children: (access: {projectId: string; accessLevel: AccessLevel}) => ReactNode }) {
  const router = useRouter();
  const search = useSearchParams();
  const projectId = search.get("project");
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    let active = true;
    const deny = (message: string) => active && setState({ status: "denied", message });
    async function check() {
      setState({ status: "loading" });
      if (!supabase || !projectId || !/^[a-f0-9-]{36}$/i.test(projectId)) { deny("Selecciona primero un contrato desde el inicio de TRAZA."); return; }
      const client = supabase;
      const { data: auth, error: authError } = await client.auth.getUser();
      if (!active) return;
      if (authError || !auth.user) { router.replace("/login"); return; }
      const today = new Date().toISOString().slice(0,10);
      const { data: members, error: memberError } = await client.from("project_members")
        .select("status, valid_from, valid_until")
        .eq("user_id", auth.user.id).eq("project_id", projectId).eq("status", "active");
      if (!active) return;
      if (memberError || !(members || []).some(m => (!m.valid_from || m.valid_from <= today) && (!m.valid_until || m.valid_until >= today))) {
        deny("No tienes una membresía activa y vigente para este contrato."); return;
      }
      const [activation, permission] = await Promise.all([
        client.from("project_modules").select("enabled").eq("project_id", projectId).eq("module_id", moduleId).maybeSingle(),
        client.from("project_module_permissions").select("access_level").eq("project_id", projectId).eq("user_id", auth.user.id).eq("module_id", moduleId).maybeSingle(),
      ]);
      if (!active) return;
      if (activation.error || permission.error) { deny("No fue posible verificar tus permisos. Acceso denegado por seguridad."); return; }
      const level = permission.data?.access_level;
      if (activation.data?.enabled !== true || !["view","edit","approve","admin"].includes(level || "")) {
        deny("Este módulo no está habilitado o no tienes autorización para ingresar."); return;
      }
      setState({ status: "allowed", projectId, accessLevel: level as AccessLevel });
    }
    void check();
    const { data: { subscription } } = supabase?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/login");
    }) ?? { data: { subscription: { unsubscribe() {} } } };
    return () => { active = false; subscription.unsubscribe(); };
  }, [moduleId, projectId, router]);
  if (state.status === "allowed" && state.projectId && state.accessLevel) return <>{children({projectId:state.projectId, accessLevel:state.accessLevel})}</>;
  return <main style={{minHeight:"85vh",display:"grid",placeItems:"center",background:"#f4f7fb",padding:24}}>
    <section style={{maxWidth:500,background:"white",padding:36,borderRadius:16,boxShadow:"0 8px 32px #102a4312",textAlign:"center"}}>
      <h1 style={{color:"#102a43"}}>{state.status === "loading" ? "Verificando acceso…" : "Acceso restringido"}</h1>
      <p style={{color:"#526477"}}>{state.status === "loading" ? "Consultando permisos de tu contrato." : state.message}</p>
      <button onClick={() => router.push("/")} style={{border:0,borderRadius:8,padding:"12px 18px",background:"#1664c0",color:"white",cursor:"pointer"}}>Volver al inicio de TRAZA</button>
    </section>
  </main>;
}
