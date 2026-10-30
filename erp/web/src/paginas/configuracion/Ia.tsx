// Configuración › Inteligencia artificial: estado de Ollama, modelo de chat y de búsqueda, e índice del catálogo.
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAvisos } from "../../componentes/Avisos";
import { Cargando } from "../../componentes/Estado";
import { Icono } from "../../componentes/Icono";
import { fechaHora } from "../../formato";
import { puede } from "../../modulos";
import { useSesion } from "../../sesion";
import type { EstadoIa } from "../../tipos";

export function Ia() {
  const { usuario } = useSesion();
  const avisar = useAvisos();
  const editar = puede(usuario, "configuracion", "completo");
  const [e, setE] = useState<EstadoIa | null>(null);
  const [f, setF] = useState({ modelo: "", modelo_embeddings: "", num_ctx: "8192" });
  const [trabajando, setTrabajando] = useState(false);
  const cargar = async () => {
    const x = await api<EstadoIa>("GET", "/ia/estado");
    setE(x);
    setF({ modelo: x.modelo, modelo_embeddings: x.modelo_embeddings, num_ctx: String(x.num_ctx) });
  };
  useEffect(() => void cargar().catch(() => null), []);
  if (!e) return <Cargando />;
  const guardar = async () => {
    setTrabajando(true);
    try {
      await api("PUT", "/ia/config", { cuerpo: { ...f, num_ctx: Number(f.num_ctx) } });
      avisar("Configuración de IA guardada", "Se usa desde la próxima consulta.");
      await cargar();
    } catch (x) {
      avisar("No se pudo guardar", x instanceof Error ? x.message : undefined, "error");
    } finally {
      setTrabajando(false);
    }
  };
  const reindexar = async () => {
    setTrabajando(true);
    try {
      const r = await api<{ total: number; indexados: number; nuevos: number }>("POST", "/ia/reindexar");
      avisar("Índice actualizado", `${r.indexados} de ${r.total} productos · ${r.nuevos} recalculados`);
      await cargar();
    } catch (x) {
      avisar("No se pudo actualizar el índice", x instanceof Error ? x.message : undefined, "error");
    } finally {
      setTrabajando(false);
    }
  };
  const ok = e.disponible;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="tarjeta flex flex-col gap-3 p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "var(--ai-soft)", color: "var(--ai)" }}><Icono n="memory" /></span>
          <div className="flex-1"><div className="titulo-seccion">Servidor de IA (Ollama)</div><div className={`text-[13px] font-semibold ${ok ? "text-success" : "text-warning"}`}>{e.detalle}{e.latencia_ms !== undefined && ok ? ` · responde en ${e.latencia_ms} ms` : ""}</div></div>
          <button className="btn-secundario h-9" onClick={() => void cargar()}><Icono n="refresh" t={18} />Probar</button>
        </div>
        {e.modelos?.length ? <div className="text-[12.5px] text-text-2">Modelos descargados: {e.modelos.join(", ")}</div> : null}
        {e.motivo === "no_instalada" ? <div className="rounded-xl bg-surface-2 p-3 text-[12.5px] text-text-2">Para instalarla, en el VPS: <code>./scripts/instalar_ia.sh</code> (ver DESPLIEGUE.md › IA).</div> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="etiqueta">Modelo de chat</span><input className="campo font-mono" disabled={!editar} value={f.modelo} onChange={(x) => setF({ ...f, modelo: x.target.value })} placeholder="qwen3:4b" /></label>
          <label><span className="etiqueta">Modelo de búsqueda (embeddings)</span><input className="campo font-mono" disabled={!editar} value={f.modelo_embeddings} onChange={(x) => setF({ ...f, modelo_embeddings: x.target.value })} placeholder="bge-m3" /></label>
          <label><span className="etiqueta">Memoria de conversación (tokens)</span><input className="campo num" disabled={!editar} inputMode="numeric" value={f.num_ctx} onChange={(x) => setF({ ...f, num_ctx: x.target.value })} /></label>
        </div>
        <p className="text-[12.5px] text-text-3">Para usar otro modelo, primero descárgalo en el VPS (<code>./scripts/instalar_ia.sh qwen3:8b</code>) y luego escríbelo aquí. Un modelo más grande responde mejor pero más lento.</p>
        {editar ? <button className="btn-primario w-fit" disabled={trabajando} onClick={() => void guardar()}><Icono n="save" t={18} />Guardar</button> : null}
      </section>
      <section className="tarjeta flex flex-col gap-3 p-5">
        <div className="titulo-seccion">Índice del catálogo</div>
        <p className="text-[13px] text-text-2">Para encontrar productos aunque se escriban distinto («inversor de 10 kilos» → «Inversor híbrido 10 kW»), la IA guarda una «huella de significado» de cada producto. Se actualiza sola al cambiar el catálogo.</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border p-3"><div className="text-[12px] text-text-3">Productos</div><div className="num text-[22px] font-extrabold">{e.indice.total}</div></div>
          <div className="rounded-xl border border-border p-3"><div className="text-[12px] text-text-3">En el índice</div><div className="num text-[22px] font-extrabold" style={{ color: e.indice.indexados >= e.indice.total ? "var(--success)" : "var(--warning)" }}>{e.indice.indexados}</div></div>
        </div>
        <div className="text-[12px] text-text-3">Modelo {e.indice.modelo} · última actualización {fechaHora(e.indice.actualizado_en)}</div>
        {editar ? <button className="btn-secundario w-fit" disabled={trabajando || !ok} onClick={() => void reindexar()}><Icono n="sync" t={18} />Actualizar ahora</button> : null}
        <div className="mt-2 rounded-xl bg-surface-2 p-3 text-[12.5px] text-text-2"><b>Regla:</b> la IA solo lee. Lo que propone (por ejemplo una cotización) lo revisa y guarda una persona.</div>
      </section>
    </div>
  );
}
