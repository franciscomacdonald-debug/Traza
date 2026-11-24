"use client";
import ModuleGate from "@/components/ModuleGate";
export default function Page() {
  return <ModuleGate moduleId="avances">{() => <main style={{padding:40}}><h1>TRAZA — Avances</h1><p>Módulo pendiente de desarrollo. No existen operaciones habilitadas.</p><a href="/">Volver al inicio</a></main>}</ModuleGate>;
}
