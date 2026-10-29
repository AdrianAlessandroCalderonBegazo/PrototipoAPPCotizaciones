import { useState } from "react";
import { api } from "../../api";
import { useAvisos } from "../../componentes/Avisos";
import { Cargando, ErrorCarga } from "../../componentes/Estado";
import { Icono } from "../../componentes/Icono";
import { Modal } from "../../componentes/Modal";
import { Pildora } from "../../componentes/Pildora";
import { cuando, iniciales } from "../../formato";
import { puede } from "../../modulos";
import { useSesion } from "../../sesion";
import type { Rol, UsuarioLista } from "../../tipos";
import { useDatos } from "../../usarDatos";

export const ROLES: { k: Rol; l: string; d: string }[] = [
  { k: "admin", l: "Administrador", d: "Todo, incluidos usuarios y permisos" },
  { k: "ventas", l: "Ventas", d: "Cotiza; pide materiales en Logística" },
  { k: "contabilidad", l: "Contabilidad", d: "Caja chica completa; ve cotizaciones" },
  { k: "tecnico", l: "Técnico", d: "Logística completa: aprueba, alista, salidas" },
];
const etiqueta = (r: string) => ROLES.find((x) => x.k === r)?.l ?? r;

function NuevoUsuario({ soyAdmin, onCerrar, onCreado }: { soyAdmin: boolean; onCerrar: () => void; onCreado: () => void }) {
  const avisar = useAvisos();
  const [f, setF] = useState({ nombre: "", usuario: "", clave: "", rol: "tecnico" as Rol });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const crear = async () => {
    setGuardando(true);
    setError(null);
    try {
      await api("POST", "/usuarios", { cuerpo: f });
      avisar("Usuario creado", `${f.nombre} ya puede entrar con «${f.usuario.trim().toLowerCase()}».`);
      onCreado();
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear.");
    } finally {
      setGuardando(false);
    }
  };
  return (
    <Modal titulo="Nuevo usuario" icono="person_add" onCerrar={onCerrar} pie={<><button className="btn-secundario" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={guardando || !f.nombre || !f.usuario || !f.clave} onClick={crear}>{guardando ? "Creando…" : "Crear usuario"}</button></>}>
      <div className="flex flex-col gap-3.5">
        <label><span className="etiqueta">Nombre</span><input className="campo" autoFocus placeholder="Ej. Andrea Huanca" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></label>
        <label><span className="etiqueta">Usuario (para entrar)</span><input className="campo" autoCapitalize="none" placeholder="Ej. ahuanca" value={f.usuario} onChange={(e) => setF({ ...f, usuario: e.target.value })} /></label>
        <label><span className="etiqueta">Clave inicial (mínimo 6 caracteres)</span><input className="campo" type="password" autoComplete="new-password" value={f.clave} onChange={(e) => setF({ ...f, clave: e.target.value })} /></label>
        <label>
          <span className="etiqueta">Rol</span>
          <select className="campo" value={f.rol} onChange={(e) => setF({ ...f, rol: e.target.value as Rol })}>
            {ROLES.filter((r) => soyAdmin || r.k !== "admin").map((r) => (
              <option key={r.k} value={r.k}>{r.l} — {r.d}</option>
            ))}
          </select>
        </label>
        {error ? <div className="rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] font-semibold text-danger">{error}</div> : null}
      </div>
    </Modal>
  );
}

function NuevaClave({ u, onCerrar }: { u: UsuarioLista; onCerrar: () => void }) {
  const avisar = useAvisos();
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const guardar = async () => {
    try {
      await api("PUT", `/usuarios/${u.id}`, { cuerpo: { clave } });
      avisar("Clave cambiada", `${u.nombre} debe volver a entrar con la clave nueva.`);
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar.");
    }
  };
  return (
    <Modal titulo={`Nueva clave para ${u.nombre}`} icono="key" onCerrar={onCerrar} pie={<><button className="btn-secundario" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={clave.length < 6} onClick={guardar}>Guardar clave</button></>}>
      <label><span className="etiqueta">Clave nueva (mínimo 6 caracteres)</span><input className="campo" autoFocus type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} /></label>
      <p className="mt-2 text-[12.5px] text-text-3">Se cierran sus sesiones abiertas en todos los equipos.</p>
      {error ? <div className="mt-3 rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] font-semibold text-danger">{error}</div> : null}
    </Modal>
  );
}

export function Usuarios() {
  const { usuario: yo } = useSesion();
  const avisar = useAvisos();
  const { datos, error, cargando, recargar } = useDatos(() => api<UsuarioLista[]>("GET", "/usuarios"));
  const [nuevo, setNuevo] = useState(false);
  const [clave, setClave] = useState<UsuarioLista | null>(null);
  const editar = puede(yo, "configuracion", "completo");
  const soyAdmin = yo?.rol === "admin";

  const cambiar = async (u: UsuarioLista, cambio: Partial<Pick<UsuarioLista, "rol" | "activo">>, mensaje: string) => {
    try {
      await api("PUT", `/usuarios/${u.id}`, { cuerpo: cambio });
      avisar(mensaje);
      await recargar();
    } catch (e) {
      avisar("No se pudo guardar", e instanceof Error ? e.message : undefined, "error");
    }
  };

  return (
    <section className="tarjeta overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="titulo-seccion">
          Usuarios <span className="font-medium text-text-3">· {datos?.length ?? 0}</span>
        </div>
        {editar ? (
          <button className="btn-primario" onClick={() => setNuevo(true)}>
            <Icono n="person_add" t={19} />
            Nuevo usuario
          </button>
        ) : null}
      </div>
      {cargando && !datos ? <Cargando /> : error ? <div className="p-4"><ErrorCarga mensaje={error} reintentar={recargar} /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-border text-[12px] font-bold uppercase tracking-wide text-text-3">
                <th className="px-5 py-2.5">Usuario</th><th className="px-3 py-2.5">Rol</th><th className="px-3 py-2.5">Último acceso</th><th className="px-3 py-2.5">Estado</th><th className="px-5 py-2.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(datos ?? []).map((u) => {
                const yoMismo = u.id === yo?.id;
                const bloqueado = !editar || yoMismo || (u.rol === "admin" && !soyAdmin);
                return (
                  <tr key={u.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-[10px] bg-primary-soft text-[12.5px] font-extrabold text-primary-ink">{iniciales(u.nombre)}</span>
                        <div className="min-w-0">
                          <div className="font-bold">{u.nombre}{yoMismo ? <span className="ml-1.5 text-[12px] font-medium text-text-3">(tú)</span> : null}</div>
                          <div className="text-[12.5px] text-text-3">{u.usuario}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        className="campo h-9 w-[170px]"
                        value={u.rol}
                        disabled={bloqueado}
                        title={yoMismo ? "No puedes cambiar tu propio rol" : undefined}
                        onChange={(e) => void cambiar(u, { rol: e.target.value as Rol }, `${u.nombre} ahora es ${etiqueta(e.target.value)}`)}
                      >
                        {ROLES.filter((r) => soyAdmin || r.k !== "admin" || u.rol === "admin").map((r) => (
                          <option key={r.k} value={r.k}>{r.l}</option>
                        ))}
                      </select>
                    </td>
                    <td className="num px-3 py-3 text-text-2">{cuando(u.ultimo_acceso)}</td>
                    <td className="px-3 py-3">{u.activo ? <Pildora tono="exito">Activo</Pildora> : <Pildora tono="neutro">Desactivado</Pildora>}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <button disabled={bloqueado} onClick={() => setClave(u)} title="Asignar una clave nueva" className="grid h-9 w-9 place-items-center rounded-[10px] text-text-2 hover:bg-surface-2 disabled:opacity-40">
                          <Icono n="key" t={19} />
                        </button>
                        <button
                          disabled={bloqueado}
                          onClick={() => void cambiar(u, { activo: !u.activo }, u.activo ? `${u.nombre} ya no puede entrar` : `${u.nombre} puede entrar de nuevo`)}
                          title={u.activo ? "Quitar acceso" : "Devolver acceso"}
                          className={`grid h-9 w-9 place-items-center rounded-[10px] disabled:opacity-40 ${u.activo ? "text-danger hover:bg-danger-soft" : "text-success hover:bg-success-soft"}`}
                        >
                          <Icono n={u.activo ? "person_remove" : "person_check"} t={19} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {nuevo ? <NuevoUsuario soyAdmin={soyAdmin} onCerrar={() => setNuevo(false)} onCreado={recargar} /> : null}
      {clave ? <NuevaClave u={clave} onCerrar={() => setClave(null)} /> : null}
    </section>
  );
}
