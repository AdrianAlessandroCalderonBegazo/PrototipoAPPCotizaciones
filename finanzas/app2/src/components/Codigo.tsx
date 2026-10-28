import { useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { C, kicker, t } from "../theme";
import { Sheet } from "./Overlays";
import { PrimaryButton, SecondaryButton, TextField } from "./ui";
import { bloqueo } from "../lib/fin/runtime";

/** Cuadro para escribir el código que habilita corregir días anteriores. */
export function CodigoSheet({ motivo, onOk, onClose, bottomInset }: { motivo: string; onOk: () => void; onClose: () => void; bottomInset: number }) {
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");

  const probar = () => {
    const r = bloqueo.desbloquear(codigo);
    if (r.ok) return onOk();
    setCodigo("");
    setError(r.razon === "espera" ? `Demasiados intentos. Espera ${Math.ceil(r.esperaMs / 1000)} s.` : `Código incorrecto. Te ${r.intentosRestantes === 1 ? "queda 1 intento" : `quedan ${r.intentosRestantes} intentos`}.`);
  };

  return (
    <Sheet onClose={onClose} bottomInset={bottomInset}>
      <Text style={kicker(C.muted, 10.5)}>DÍA ANTERIOR</Text>
      <Text style={t(20, 800, C.ink, { marginTop: 6 })}>Escribe el código</Text>
      <Text style={t(12.5, 400, C.muted, { marginTop: 4, marginBottom: 14, lineHeight: 18 })}>{motivo} Queda habilitado 10 minutos.</Text>
      <TextField value={codigo} onChangeText={(v) => (setCodigo(v.replace(/\s/g, "")), setError(""))} placeholder="Código" secureTextEntry keyboardType="number-pad" autoFocus onSubmitEditing={probar} accessibilityLabel="Código de edición" />
      {error ? <Text style={t(12, 600, C.red, { marginTop: 8 })} accessibilityRole="alert">{error}</Text> : null}
      <View style={{ gap: 10, marginTop: 16 }}>
        <PrimaryButton label="DESBLOQUEAR" onPress={probar} />
        <SecondaryButton label="Cancelar" onPress={onClose} />
      </View>
    </Sheet>
  );
}

/**
 * Puerta para cambios que reescriben el historial: `pedir(true, accion)` ejecuta la acción de inmediato si el
 * candado está abierto; si no, pide el código y la ejecuta al acertar. `pedir(false, …)` (el día de hoy) no pregunta.
 */
export function usePuerta(bottomInset: number) {
  const [pendiente, setPendiente] = useState<{ accion: () => void; motivo: string } | null>(null);
  const pedir = (necesita: boolean, accion: () => void, motivo = "Para corregir un día anterior hace falta el código.") =>
    !necesita || bloqueo.abierto() ? accion() : setPendiente({ accion, motivo });
  const modal: ReactNode = pendiente ? (
    <CodigoSheet
      motivo={pendiente.motivo}
      bottomInset={bottomInset}
      onClose={() => setPendiente(null)}
      onOk={() => {
        const f = pendiente.accion;
        setPendiente(null);
        f();
      }}
    />
  ) : null;
  return { pedir, modal };
}
