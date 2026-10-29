import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { useAvisos } from "../../componentes/Avisos";
import { Cargando, ErrorCarga } from "../../componentes/Estado";
import { Icono } from "../../componentes/Icono";
import { useSesion } from "../../sesion";
import type { Catalogo, Matriz as TMatriz, Nivel, Rol } from "../../tipos";
import { useDatos } from "../../usarDatos";
import { cambiosMatriz, siguienteNivel } from "./matrizLogica";

const NIVEL: Record<Nivel, { l: string; bg: string; fg: string }> = {
  ninguno: { l: "Sin acceso", bg: "var(--surface-2)", fg: "var(--text-3)" },
  lectura: { l: "Solo lectura", bg: "var(--primary-soft)", fg: "var(--primary-ink)" },
  completo: { l: "Completo", bg: "var(--success-soft)", fg: "var(--success)" },
};

export function Matriz() {
  const { usuario, refrescar } = useSesion();
  const avisar = useAvisos();
  const soyAdmin = usuario?.rol === "admin";
  const { datos, error, cargando, recargar } = useDatos(async () => {
    const [catalogo, matriz] = await Promise.all([api<Catalogo>("GET", "/permisos/catalogo"), api<TMatriz>("GET", "/permisos/matriz")]);
    return { catalogo, matriz };
  });
  const [m, setM] = useState<TMatriz | null>(null);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => setM(datos ? structuredClone(datos.matriz) : null), [datos]);
  const cambios = useMemo(() => (datos && m ? cambiosMatriz(datos.matriz, m) : 0), [datos, m]);

  if (cargando && !datos) return <Cargando />;
  if (error) return <ErrorCarga mensaje={error} reintentar={recargar} />;
  if (!datos || !m) return null;

  const tocar = (rol: Rol, modulo: keyof TMatriz[Rol]) => {
    if (!soyAdmin || rol === "admin") return;
    setM({ ...m, [rol]: { ...m[rol], [modulo]: siguienteNivel(m[rol][modulo]) } });
  };
  const guardar = async () => {
    setGuardando(true);
    try {
      await api("PUT", "/permisos/matriz", { cuerpo: { matriz: m } });
      avisar("Permisos guardados", "Cada persona los ve al recargar su pantalla. El servidor ya los aplica.");
      await Promise.all([recargar(), refrescar()]);
    } catch (e) {
      avisar("No se pudieron guardar", e instanceof Error ? e.message : undefined, "error");
    } finally {
      setGuardando(false);
    }
  };

  const grupos = [...new Set(datos.catalogo.modulos.map((x) => x.grupo))];
  return (
    <section className="tarjeta overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <div className="titulo-seccion">Matriz de permisos por módulo</div>
          <div className="mt-0.5 text-[13px] text-text-2">
            {soyAdmin ? "Haz clic en una celda para cambiar el nivel. El administrador siempre tiene acceso completo." : "Solo un administrador puede cambiar la matriz."}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(NIVEL) as Nivel[]).map((n) => (
            <span key={n} className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-bold" style={{ background: NIVEL[n].bg, color: NIVEL[n].fg }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: NIVEL[n].fg }} />
              {NIVEL[n].l}
            </span>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-left text-[13.5px]">
          <thead>
            <tr className="border-b border-border text-[12px] font-bold uppercase tracking-wide text-text-3">
              <th className="px-5 py-2.5">Módulo</th>
              {datos.catalogo.roles.map((r) => (
                <th key={r.clave} className="w-[150px] px-2 py-2.5 text-center">{r.nombre}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) =>
              datos.catalogo.modulos.filter((x) => x.grupo === g).map((mod, i) => (
                <tr key={mod.clave} className="border-b border-border last:border-0">
                  <td className="px-5 py-2.5">
                    {i === 0 ? <div className="mb-0.5 text-[10.5px] font-bold uppercase tracking-[0.09em] text-text-3">{g}</div> : null}
                    <div className="font-bold">{mod.nombre}</div>
                    <div className="mt-0.5 text-[12px] leading-snug text-text-3" title={`Completo: ${mod.completo}`}>Lectura: {mod.lectura}{mod.completo !== mod.lectura ? ` · Completo: ${mod.completo}` : ""}</div>
                  </td>
                  {datos.catalogo.roles.map((r) => {
                    const n = m[r.clave][mod.clave];
                    const fijo = r.clave === "admin" || !soyAdmin;
                    const cambiado = datos.matriz[r.clave][mod.clave] !== n;
                    return (
                      <td key={r.clave} className="px-2 py-2.5 text-center">
                        <button
                          disabled={fijo}
                          onClick={() => tocar(r.clave, mod.clave)}
                          title={r.clave === "admin" ? "El administrador siempre tiene acceso completo" : undefined}
                          className={`inline-flex h-8 w-[128px] items-center justify-center gap-1 rounded-[9px] text-[12.5px] font-bold ${fijo ? "cursor-not-allowed" : "cursor-pointer hover:brightness-95"} ${cambiado ? "ring-2 ring-primary-line" : ""}`}
                          style={{ background: NIVEL[n].bg, color: NIVEL[n].fg, opacity: r.clave === "admin" ? 0.75 : 1 }}
                        >
                          {r.clave === "admin" ? <Icono n="lock" t={14} /> : null}
                          {NIVEL[n].l}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
      {soyAdmin ? (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-5 py-3.5">
          <span className="text-[13px] text-text-3">{cambios ? `${cambios} ${cambios === 1 ? "cambio" : "cambios"} sin guardar · el menú de cada rol se actualiza al guardar` : "Sin cambios"}</span>
          {cambios ? <button className="btn-secundario" onClick={() => setM(structuredClone(datos.matriz))}>Descartar</button> : null}
          <button className="btn-primario" disabled={!cambios || guardando} onClick={guardar}>{guardando ? "Guardando…" : "Guardar permisos"}</button>
        </div>
      ) : null}
    </section>
  );
}
