import { useState, type FormEvent } from "react";
import { Icono } from "../componentes/Icono";
import { useSesion } from "../sesion";

export function Login() {
  const { entrar } = useSesion();
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setEntrando(true);
    try {
      await entrar(usuario, clave);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo entrar.");
    } finally {
      setEntrando(false);
    }
  };

  return (
    <div className="grid min-h-full place-items-center bg-bg p-4">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex items-center gap-3">
          <div className="relative grid h-12 w-12 place-items-center rounded-[14px] bg-navy text-[15px] font-extrabold text-white">
            ICR
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-solar" />
          </div>
          <div>
            <div className="text-[20px] font-extrabold tracking-tight">ICR ERP</div>
            <div className="text-[13px] text-text-3">Inversiones ICR · Arequipa</div>
          </div>
        </div>
        <form onSubmit={enviar} className="tarjeta flex flex-col gap-4 p-6">
          <div>
            <h1 className="text-[22px] font-extrabold tracking-tight">Ingresar</h1>
            <p className="mt-1 text-[13.5px] text-text-2">Usa el mismo usuario y clave de Logística y Finanzas.</p>
          </div>
          <label>
            <span className="etiqueta">Usuario</span>
            <input className="campo" autoFocus autoComplete="username" autoCapitalize="none" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
          </label>
          <label>
            <span className="etiqueta">Clave</span>
            <div className="relative">
              <input className="campo pr-11" type={ver ? "text" : "password"} autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} />
              <button type="button" onClick={() => setVer(!ver)} title={ver ? "Ocultar clave" : "Ver clave"} className="absolute right-1 top-1 grid h-8 w-9 place-items-center rounded-lg text-text-3 hover:bg-surface-2">
                <Icono n={ver ? "visibility_off" : "visibility"} t={19} />
              </button>
            </div>
          </label>
          {error ? <div className="rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] font-semibold text-danger">{error}</div> : null}
          <button className="btn-primario h-11" disabled={entrando || !usuario || !clave}>
            {entrando ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <p className="mt-4 text-center text-[12.5px] text-text-3">¿Olvidaste tu clave? Pídele a un administrador que te asigne una nueva.</p>
      </div>
    </div>
  );
}
