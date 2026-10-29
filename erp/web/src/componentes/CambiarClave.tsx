import { useState } from "react";
import { api } from "../api";
import { useAvisos } from "./Avisos";
import { Modal } from "./Modal";

export function CambiarClave({ onCerrar }: { onCerrar: () => void }) {
  const avisar = useAvisos();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetir, setRepetir] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    if (nueva.length < 6) return setError("La clave nueva debe tener al menos 6 caracteres.");
    if (nueva !== repetir) return setError("Las dos claves nuevas no coinciden.");
    setGuardando(true);
    setError(null);
    try {
      await api("POST", "/yo/clave", { cuerpo: { actual, nueva } });
      avisar("Clave cambiada", "La próxima vez entra con la clave nueva.");
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar la clave.");
    } finally {
      setGuardando(false);
    }
  };
  return (
    <Modal titulo="Cambiar mi clave" icono="key" onCerrar={onCerrar} pie={<><button className="btn-secundario" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={guardando || !actual || !nueva} onClick={guardar}>{guardando ? "Guardando…" : "Cambiar clave"}</button></>}>
      <div className="flex flex-col gap-3.5">
        <label><span className="etiqueta">Clave actual</span><input className="campo" type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} /></label>
        <label><span className="etiqueta">Clave nueva (mínimo 6 caracteres)</span><input className="campo" type="password" autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} /></label>
        <label><span className="etiqueta">Repite la clave nueva</span><input className="campo" type="password" autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} /></label>
        {error ? <div className="rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] font-semibold text-danger">{error}</div> : null}
      </div>
    </Modal>
  );
}
