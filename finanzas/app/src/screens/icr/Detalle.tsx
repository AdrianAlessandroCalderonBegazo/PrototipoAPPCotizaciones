/** Detalle de un movimiento: datos, fotos, corregir, agregar foto y anular (con motivo; un depósito se anula también en el ERP). */
import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { C, kicker, t } from "../../theme";
import { Sheet } from "../../components/Overlays";
import { PrimaryButton, SecondaryButton, TextField } from "../../components/ui";
import { FotosGuardadas, Franja } from "../../components/icr";
import { fdate } from "../../lib/format";
import * as icr from "../../lib/icr/api";
import { soles } from "../../lib/icr/dinero";
import { elegirFoto, FotoError } from "../../lib/icr/foto";
import { catTexto, COMPROBANTE_LABEL, MEDIO_LABEL, ORIGEN_LABEL, type Mov } from "../../lib/icr/tipos";

export function Detalle({ mov, escribir, esAdmin, onCerrar, onEditar, onCambio, bottomInset }: {
  mov: Mov; escribir: boolean; esAdmin: boolean; onCerrar: () => void; onEditar: (m: Mov) => void; onCambio: (mensaje: string) => void; bottomInset: number;
}) {
  const [m, setM] = useState(mov);
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entra = m.tipo === "INGRESO";
  const puede = escribir && !m.anulado && (m.origen !== "AJUSTE" || esAdmin);
  const filas: [string, string][] = [
    ["Fecha", fdate(m.fecha)], ["Tipo", ORIGEN_LABEL[m.origen]], ["Medio", MEDIO_LABEL[m.medio]], ["Categoría", catTexto(m)],
    ...(m.persona ? [["Persona", m.persona] as [string, string]] : []), ...(m.destinatario ? [["Se pagó a", m.destinatario] as [string, string]] : []),
    ...(m.operacion ? [["N.º de operación", m.operacion] as [string, string]] : []), ...(m.comprobante ? [["Comprobante", COMPROBANTE_LABEL[m.comprobante]] as [string, string]] : []),
    ...(m.proyecto ? [["Proyecto", m.proyecto] as [string, string]] : []),
    ["Registrado por", `${m.creado_por ?? "Sin dato"} · ${m.creado_en.slice(0, 16).replace("T", " ")}`],
    ...(m.anulado ? [["Anulado", `${m.anulado_motivo ?? ""} · ${m.anulado_por ?? ""}`] as [string, string]] : []),
  ];
  const agregarFoto = async () => {
    setError(null);
    try {
      const uri = await elegirFoto("galeria");
      if (!uri) return;
      setOcupado(true);
      await icr.subirFoto(m.id, uri);
      setM(await icr.movimiento(m.id));
      onCambio("Foto agregada.");
    } catch (e) {
      setError(e instanceof FotoError || e instanceof Error ? e.message : "No se pudo subir la foto.");
    } finally {
      setOcupado(false);
    }
  };
  const anular = async () => {
    if (!motivo.trim()) return setError("Escribe por qué se anula.");
    setOcupado(true);
    setError(null);
    try {
      setM(await icr.anular(m.id, motivo.trim()));
      setAnulando(false);
      onCambio(m.origen === "DEPOSITO" ? "Depósito anulado: también se anuló en la cuenta principal del ERP." : "Movimiento anulado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo anular.");
    } finally {
      setOcupado(false);
    }
  };
  return (
    <Sheet onClose={onCerrar} bottomInset={bottomInset}>
      <ScrollView contentContainerStyle={{ gap: 14 }}>
        <Text style={kicker()}>{ORIGEN_LABEL[m.origen].toUpperCase()}</Text>
        <Text style={t(17, 800)}>{m.descripcion}</Text>
        <Text style={t(28, 800, m.anulado ? C.muted : entra ? C.teal : C.ink, m.anulado ? { textDecorationLine: "line-through" } : {})}>{entra ? "+" : "−"}{soles(m.monto)}</Text>
        <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 14 }}>
          {filas.map(([a, b], i) => (
            <View key={a} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 9, paddingHorizontal: 12, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
              <Text style={t(12.5, 500, C.muted)}>{a}</Text>
              <Text style={t(12.5, 700, C.ink, { flexShrink: 1, textAlign: "right" })}>{b}</Text>
            </View>
          ))}
        </View>
        {m.origen === "FONDO" ? <Franja texto="Fondos enviados desde la cuenta principal del ERP. Si hay un error, se anula en el ERP (Contabilidad)." /> : null}
        {m.origen === "DEPOSITO" ? <Franja texto="Este dinero pasó a la cuenta principal del ERP. Si lo anulas aquí, también se anula allá." /> : null}
        <FotosGuardadas ids={m.adjuntos} />
        {m.origen === "GASTO" && !m.adjuntos.length && !m.anulado ? <Franja tono="alerta" texto="Este gasto no tiene foto del recibo." /> : null}
        {error ? <Franja tono="error" texto={error} /> : null}
        {ocupado ? <ActivityIndicator color={C.teal} /> : anulando ? (
          <View style={{ gap: 10 }}>
            <TextField value={motivo} onChangeText={setMotivo} placeholder="¿Por qué se anula? (queda en el historial)" autoFocus maxLength={500} />
            <SecondaryButton label="ANULAR MOVIMIENTO" danger onPress={() => void anular()} />
            <SecondaryButton label="VOLVER" onPress={() => setAnulando(false)} />
          </View>
        ) : puede ? (
          <View style={{ gap: 10 }}>
            <PrimaryButton label="CORREGIR" onPress={() => onEditar(m)} />
            {m.origen !== "FONDO" ? <SecondaryButton label="AGREGAR FOTO" onPress={() => void agregarFoto()} /> : null}
            {m.origen !== "FONDO" ? <SecondaryButton label="ANULAR…" danger onPress={() => setAnulando(true)} /> : null}
          </View>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}
