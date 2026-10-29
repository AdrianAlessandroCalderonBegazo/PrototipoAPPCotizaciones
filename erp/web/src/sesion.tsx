import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { alVencerSesion, api, guardarToken, tieneToken } from "./api";
import type { Usuario } from "./tipos";

type Sesion = {
  usuario: Usuario | null;
  cargando: boolean;
  entrar: (usuario: string, clave: string) => Promise<void>;
  salir: () => Promise<void>;
  /** Vuelve a pedir el usuario y sus permisos (después de cambiar la matriz). */
  refrescar: () => Promise<void>;
};

const Ctx = createContext<Sesion | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(tieneToken());

  const refrescar = useCallback(async () => {
    if (!tieneToken()) return setUsuario(null);
    try {
      setUsuario(await api<Usuario>("GET", "/yo"));
    } catch {
      // sin conexión o sesión vencida: el 401 ya limpió el token
    }
  }, []);

  useEffect(() => {
    alVencerSesion(() => setUsuario(null));
    if (tieneToken()) refrescar().finally(() => setCargando(false));
  }, [refrescar]);

  const entrar = async (u: string, clave: string) => {
    const r = await api<{ token: string; usuario: Usuario }>("POST", "/login", { cuerpo: { usuario: u.trim(), clave } });
    guardarToken(r.token);
    setUsuario(r.usuario);
  };

  const salir = async () => {
    try {
      await api("POST", "/logout");
    } catch {
      // aunque el servidor no responda, aquí se cierra
    }
    guardarToken(null);
    setUsuario(null);
  };

  return <Ctx.Provider value={{ usuario, cargando, entrar, salir, refrescar }}>{children}</Ctx.Provider>;
}

export function useSesion() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSesion fuera de ProveedorSesion");
  return s;
}
