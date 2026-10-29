import { useCallback, useEffect, useState } from "react";

/** Carga datos con estado de carga y error; `recargar` vuelve a pedirlos. */
export function useDatos<T>(cargar: () => Promise<T>, deps: unknown[] = []) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const f = useCallback(cargar, deps);
  const recargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setDatos(await f());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar.");
    } finally {
      setCargando(false);
    }
  }, [f]);
  useEffect(() => {
    void recargar();
  }, [recargar]);
  return { datos, setDatos, error, cargando, recargar };
}
