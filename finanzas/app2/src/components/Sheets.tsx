import { useState } from "react";
import { Linking, Platform, ScrollView, Text, View } from "react-native";
import { C, card, kicker, t } from "../theme";
import { Sheet } from "./Overlays";
import { PrimaryButton, SecondaryButton, TextField } from "./ui";
import { fdate, money, today } from "../lib/format";
import { reposicion } from "../lib/fin/calc";
import { enlaceTelegram, enlaceWhatsApp, textoReposicion } from "../lib/fin/reposicion";
import { store } from "../lib/fin/runtime";
import { saldoDe, type State } from "../lib/fin/store";
import type { Cuenta } from "../lib/fin/types";

/** Cuadre: se escribe el saldo que muestra el Yape (o el banco) y la app dice si cuadra o cuánto falta. */
export function CuadreSheet({ caja, cuenta, onClose, bottomInset }: { caja: State; cuenta: Cuenta; onClose: () => void; bottomInset: number }) {
  const [real, setReal] = useState("");
  const [nota, setNota] = useState("");
  const sistema = saldoDe(caja, cuenta.id);
  const escribio = real.trim() !== "" && !isNaN(parseFloat(real));
  const dif = escribio ? Math.round((parseFloat(real) - sistema) * 100) / 100 : 0;
  const ultimos = caja.cuadres.filter((c) => c.cuenta_id === cuenta.id).slice(-3).reverse();

  return (
    <Sheet onClose={onClose} bottomInset={bottomInset}>
      <Text style={kicker(C.muted, 10.5)}>CUADRE · {cuenta.nombre.toUpperCase()}</Text>
      <Text style={t(20, 800, C.ink, { marginTop: 6 })}>¿Cuánto dice el {cuenta.tipo === "YAPE" ? "Yape" : cuenta.tipo === "BANCO" ? "banco" : "efectivo contado"}?</Text>
      <Text style={t(12.5, 400, C.muted, { marginTop: 4, marginBottom: 12 })}>La app calcula {money(sistema)}.</Text>
      <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12 }}>
        <TextField value={real} onChangeText={(v) => setReal(v.replace(/[^\d.-]/g, ""))} placeholder="Saldo real, ej. 187.50" keyboardType="decimal-pad" accessibilityLabel="Saldo real" autoFocus />
        {escribio ? (
          <View style={{ backgroundColor: dif === 0 ? C.tint : "#FBE9E9", borderRadius: 12, padding: 12 }} accessibilityRole="alert">
            <Text style={t(13, 800, dif === 0 ? C.teal : C.red)}>{dif === 0 ? "✓ Cuadra" : dif < 0 ? `Faltan ${money(-dif)}` : `Sobran ${money(dif)}`}</Text>
            {dif !== 0 ? <Text style={t(12, 400, C.ink, { marginTop: 4, lineHeight: 17 })}>{dif < 0 ? "Hay plata que salió y no está registrada: revisa los yapeos del día." : "Entró plata que no está registrada."}</Text> : null}
          </View>
        ) : null}
        <TextField value={nota} onChangeText={setNota} placeholder="Nota (opcional)" accessibilityLabel="Nota del cuadre" />
        {ultimos.length ? (
          <View style={[card(14), { overflow: "hidden" }]}>
            {ultimos.map((c, i) => (
              <View key={c.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, padding: 10, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderTopColor: C.stripeA }}>
                <Text style={t(12, 600, C.muted)}>{fdate(c.fecha)}</Text>
                <Text style={t(12, 800, c.diferencia === 0 ? C.teal : C.red)}>{c.diferencia === 0 ? "Cuadró" : `${c.diferencia < 0 ? "Faltaban" : "Sobraban"} ${money(Math.abs(c.diferencia))}`}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
      <View style={{ gap: 10, marginTop: 14 }}>
        <PrimaryButton label="GUARDAR CUADRE" onPress={() => escribio && (store.crearCuadre({ cuenta_id: cuenta.id, fecha: today(), saldo_real: parseFloat(real), nota: nota.trim() }), onClose())} />
        <SecondaryButton label="Cancelar" onPress={onClose} />
      </View>
    </Sheet>
  );
}

/** Solicitud de reposición: el texto listo para mandar por WhatsApp o Telegram, o copiar. */
export function ReposicionSheet({ caja, cuenta, onClose, bottomInset }: { caja: State; cuenta: Cuenta; onClose: () => void; bottomInset: number }) {
  const [copiado, setCopiado] = useState(false);
  const r = reposicion(cuenta, caja.movs);
  const texto = textoReposicion(cuenta, r, today());
  const abrir = (url: string) => void Linking.openURL(url);
  const copiar = async () => {
    try {
      await (globalThis as { navigator?: { clipboard?: { writeText(s: string): Promise<void> } } }).navigator?.clipboard?.writeText(texto);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };
  return (
    <Sheet onClose={onClose} bottomInset={bottomInset}>
      <Text style={kicker(C.red, 10.5)}>{r.bajoUmbral ? "SALDO BAJO" : "REPOSICIÓN"} · {cuenta.nombre.toUpperCase()}</Text>
      <Text style={t(26, 800, C.ink, { marginTop: 6, fontVariant: ["tabular-nums"] })}>Reponer {money(r.sugerido)}</Text>
      <Text style={t(12.5, 400, C.muted, { marginTop: 4, marginBottom: 12 })}>Saldo {money(r.saldo)}. Quien autoriza puede cambiar el monto.</Text>
      <ScrollView style={{ maxHeight: 220, flexGrow: 0 }}>
        <View style={[card(14), { padding: 12 }]}>
          <Text style={t(12, 400, C.ink, { lineHeight: 17 })}>{texto}</Text>
        </View>
      </ScrollView>
      <View style={{ gap: 10, marginTop: 14 }}>
        <PrimaryButton label={cuenta.aviso_whatsapp ? "ENVIAR POR WHATSAPP" : "WHATSAPP (ELEGIR CONTACTO)"} onPress={() => abrir(enlaceWhatsApp(cuenta.aviso_whatsapp, texto))} />
        <SecondaryButton label="Enviar por Telegram" onPress={() => abrir(enlaceTelegram(texto))} />
        {Platform.OS === "web" ? <SecondaryButton label={copiado ? "✓ Copiado" : "Copiar el texto"} onPress={() => void copiar()} /> : null}
        <SecondaryButton label="Cerrar" onPress={onClose} />
      </View>
    </Sheet>
  );
}
