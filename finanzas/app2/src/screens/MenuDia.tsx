import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { C, card, kicker, t } from "../theme";
import { BottomBar, Chip, FieldLabel, Header, PrimaryButton, Screen } from "../components/ui";
import { horaActual, money, today } from "../lib/format";
import { r2 } from "../lib/fin/calc";
import { nuevoId } from "../lib/fin/ids";
import { store } from "../lib/fin/runtime";
import { cuentasActivas, type State } from "../lib/fin/store";

/** Menú del día: las personas que reciben menú (de la libreta), con su monto; se marcan quiénes y se registra todo junto. */
export function MenuDia({ caja, onClose, topInset, bottomInset }: { caja: State; onClose: () => void; topInset: number; bottomInset: number }) {
  const cuentas = cuentasActivas(caja);
  const hoy = today();
  const conMenu = caja.personas.filter((p) => p.activa && p.menu_monto > 0);
  const personas = conMenu.filter((p) => p.tipo !== "PROVEEDOR" && p.tipo !== "PLANILLA");
  const planilla = conMenu.filter((p) => p.tipo === "PLANILLA");
  // quien ya recibió su menú hoy aparece desmarcado
  const yaHoy = new Set(caja.movs.filter((m) => m.tipo === "EGRESO" && m.fecha === hoy && m.subcategoria === "Menú" && m.pagado_a_id).map((m) => m.pagado_a_id));
  const [sel, setSel] = useState<Record<string, boolean>>(() => Object.fromEntries(personas.map((p) => [p.id, !yaHoy.has(p.id)])));
  const [montos, setMontos] = useState<Record<string, string>>(() => Object.fromEntries(personas.map((p) => [p.id, String(p.menu_monto)])));
  const [cuentaId, setCuentaId] = useState(caja.miCuentaId || cuentas[0]?.id || "");

  const monto = (id: string) => parseFloat(montos[id] ?? "") || 0;
  const elegidas = personas.filter((p) => sel[p.id] && monto(p.id) > 0);
  const total = r2(elegidas.reduce((a, p) => a + monto(p.id), 0));

  const registrar = () => {
    if (!elegidas.length || !cuentaId) return;
    for (const p of elegidas)
      store.guardarMov({
        id: nuevoId(), tipo: "EGRESO", fecha: hoy, hora: horaActual(), cuenta_id: cuentaId, destino_id: "", monto: monto(p.id), categoria: "Viáticos", subcategoria: "Menú", concepto: "Menú",
        pagado_a: p.nombre, pagado_a_id: p.id, para: [], nro_operacion: "", origen: "MENU",
      });
    store.avisar(`Se registraron ${elegidas.length} ${elegidas.length === 1 ? "menú" : "menús"} por ${money(total)}.`, 4000);
    onClose();
  };

  return (
    <Screen>
      <Header kicker="MENÚ DEL DÍA" title="Registrar menús" sub="Marca a quiénes les yapeaste hoy" onBack={onClose} topInset={topInset} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 18 }} keyboardShouldPersistTaps="handled">
        <View>
          <FieldLabel>SALE DE</FieldLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {cuentas.map((c) => (
              <Chip key={c.id} label={c.nombre} active={cuentaId === c.id} onPress={() => setCuentaId(c.id)} />
            ))}
          </View>
        </View>

        {personas.length ? (
          <View style={[card(16), { overflow: "hidden" }]}>
            {personas.map((p, i) => {
              const on = !!sel[p.id];
              return (
                <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderTopColor: C.stripeA, opacity: on ? 1 : 0.55 }}>
                  <Pressable onPress={() => setSel((s) => ({ ...s, [p.id]: !on }))} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`Menú de ${p.nombre}`} style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                    <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: on ? C.teal : C.border, backgroundColor: on ? C.teal : C.card, alignItems: "center", justifyContent: "center" }}>
                      {on ? <Text style={t(14, 800, C.white, { marginTop: -1 })}>✓</Text> : null}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={t(13.5, 700)}>{p.nombre}</Text>
                      {yaHoy.has(p.id) ? <Text style={t(11, 700, C.red)}>Ya tiene su menú de hoy</Text> : null}
                    </View>
                  </Pressable>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Text style={t(12, 800, C.muted)}>S/</Text>
                    <TextInput value={montos[p.id]} onChangeText={(v) => setMontos((m) => ({ ...m, [p.id]: v.replace(/[^\d.]/g, "") }))} keyboardType="decimal-pad" accessibilityLabel={`Monto del menú de ${p.nombre}`} style={[t(15, 800), { width: 56, textAlign: "right", padding: 0, outlineWidth: 0, borderBottomWidth: 1, borderBottomColor: C.border }]} />
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={[card(16), { padding: 22, gap: 6 }]}>
            <Text style={t(13, 800)}>Todavía no hay personas con menú</Text>
            <Text style={t(12, 400, C.muted, { lineHeight: 17 })}>En Libreta › Personas, ponle a cada trabajador o practicante el monto de su menú (por ejemplo S/ 11) y aparecerá aquí.</Text>
          </View>
        )}
        {planilla.length ? <Text style={t(11.5, 600, C.muted, { lineHeight: 16 })}>En planilla, no reciben menú: {planilla.map((p) => p.nombre).join(", ")}.</Text> : null}
      </ScrollView>
      <BottomBar bottomInset={bottomInset}>
        <Text style={kicker(C.muted, 10)}>{elegidas.length ? `${elegidas.length} ${elegidas.length === 1 ? "PERSONA" : "PERSONAS"} · ${money(total)}` : " "}</Text>
        <PrimaryButton label={elegidas.length ? `REGISTRAR ${elegidas.length} ${elegidas.length === 1 ? "MENÚ" : "MENÚS"}` : "REGISTRAR"} onPress={registrar} />
      </BottomBar>
    </Screen>
  );
}
