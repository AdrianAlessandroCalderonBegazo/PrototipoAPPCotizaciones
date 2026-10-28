import { Pressable, ScrollView, Text, View } from "react-native";
import { C, card, kicker, t } from "../theme";
import { AvisoSync, Seccion } from "../components/fin";
import { MovFila } from "../components/MovFila";
import { PrimaryButton, SecondaryButton, TealGradient } from "../components/ui";
import { money } from "../lib/format";
import { saldoTotal } from "../lib/fin/calc";
import { store } from "../lib/fin/runtime";
import { cuentasActivas, porReponer, saldoDe, type State } from "../lib/fin/store";
import { TIPO_CUENTA_LABEL, type Cuenta, type Mov } from "../lib/fin/types";
import type { EstadoSync } from "../lib/fin/sync";

/** Inicio: saldo de la empresa, avisos de reposición, accesos rápidos, las cuentas y lo último registrado. */
export function Inicio({ caja, estado, onNuevo, onLote, onMenu, onEditar, onCuadre, onReposicion, topInset }: {
  caja: State;
  estado: EstadoSync;
  onNuevo: () => void;
  onLote: () => void;
  onMenu: () => void;
  onEditar: (m: Mov) => void;
  onCuadre: (c: Cuenta) => void;
  onReposicion: (c: Cuenta) => void;
  topInset: number;
}) {
  const cuentas = cuentasActivas(caja);
  const bajas = porReponer(caja);
  const recientes = [...caja.movs].sort((a, b) => (`${a.fecha} ${a.hora} ${a.creado}` < `${b.fecha} ${b.hora} ${b.creado}` ? 1 : -1)).slice(0, 8);
  const mi = cuentas.find((c) => c.id === caja.miCuentaId);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <TealGradient style={{ paddingTop: 18 + topInset, paddingHorizontal: 20, paddingBottom: 26 }}>
          <Text style={kicker("rgba(255,255,255,.9)", 11)}>ICR FINANZAS</Text>
          <Text style={kicker("rgba(255,255,255,.9)", 10.5)}>
            {"\n"}SALDO DE LA EMPRESA
          </Text>
          <Text style={t(36, 800, C.white, { letterSpacing: -0.72, marginTop: 4, fontVariant: ["tabular-nums"] })} numberOfLines={1} accessibilityLabel={`Saldo de la empresa ${money(saldoTotal(caja.cuentas, caja.movs))}`}>
            {money(saldoTotal(caja.cuentas, caja.movs))}
          </Text>
          <Text style={t(12, 400, "rgba(255,255,255,.88)", { marginTop: 2 })}>{cuentas.length} {cuentas.length === 1 ? "cuenta" : "cuentas"}{mi ? ` · tu cuenta: ${mi.nombre}` : ""}</Text>
        </TealGradient>

        <AvisoSync estado={estado} caja={caja} />

        <View style={{ padding: 16, gap: 18 }}>
          {bajas.map((c) => (
            <View key={c.id} style={{ backgroundColor: "#FBE9E9", borderRadius: 14, padding: 14, gap: 8 }} accessibilityRole="alert">
              <Text style={t(13, 800, C.red)}>{c.nombre}: saldo bajo</Text>
              <Text style={t(12, 400, C.ink, { lineHeight: 17 })}>Quedan {money(saldoDe(caja, c.id))} (aviso al bajar de {money(c.umbral)}). Pide la reposición para no quedarte sin fondo.</Text>
              <SecondaryButton label="Pedir reposición" onPress={() => onReposicion(c)} danger />
            </View>
          ))}

          {!caja.miCuentaId && cuentas.length ? (
            <View style={[card(14), { padding: 14, gap: 10 }]}>
              <Text style={t(13, 800)}>¿Cuál es tu cuenta?</Text>
              <Text style={t(12, 400, C.muted, { lineHeight: 17 })}>Es de donde saldrán los pagos que registres (por ejemplo, tu Yape). Se puede cambiar en Libreta › Cuentas.</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {cuentas.map((c) => (
                  <Pressable key={c.id} onPress={() => store.setMiCuenta(c.id)} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.card }}>
                    <Text style={t(12, 700)}>{c.nombre}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          <View style={{ gap: 10 }}>
            <PrimaryButton label="SUBIR CAPTURAS" onPress={onLote} />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <SecondaryButton label="+ Movimiento" onPress={onNuevo} />
              </View>
              <View style={{ flex: 1 }}>
                <SecondaryButton label="Menú del día" onPress={onMenu} />
              </View>
            </View>
          </View>

          <Seccion titulo="CUENTAS">
            {cuentas.length === 0 ? (
              <View style={[card(16), { padding: 26 }]}>
                <Text style={t(12, 400, C.muted, { textAlign: "center", lineHeight: 18 })}>Todavía no hay cuentas. Crea las del banco y los Yape en Libreta › Cuentas.</Text>
              </View>
            ) : (
              <View style={[card(16), { overflow: "hidden" }]}>
                {cuentas.map((c, i) => {
                  const saldo = saldoDe(caja, c.id);
                  const baja = c.umbral > 0 && saldo < c.umbral;
                  return (
                    <View key={c.id} style={{ padding: 14, gap: 8, borderTopWidth: i ? 1 : 0, borderTopColor: C.stripeA }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={t(13.5, 800)} numberOfLines={1}>{c.nombre}{c.id === caja.miCuentaId ? "  ·  tuya" : ""}</Text>
                          <Text style={t(11.5, 400, C.muted)} numberOfLines={1}>{[TIPO_CUENTA_LABEL[c.tipo], c.titular].filter(Boolean).join(" · ")}</Text>
                        </View>
                        <Text style={t(18, 800, baja || saldo < 0 ? C.red : C.ink, { fontVariant: ["tabular-nums"] })}>{money(saldo)}</Text>
                      </View>
                      <View style={{ flexDirection: "row", gap: 16 }}>
                        <Pressable onPress={() => onCuadre(c)} accessibilityRole="button" accessibilityLabel={`Cuadrar ${c.nombre}`}>
                          <Text style={t(12, 800, C.teal)}>Cuadrar ›</Text>
                        </Pressable>
                        {c.umbral > 0 ? (
                          <Pressable onPress={() => onReposicion(c)} accessibilityRole="button" accessibilityLabel={`Reposición de ${c.nombre}`}>
                            <Text style={t(12, 800, baja ? C.red : C.teal)}>{baja ? "Pedir reposición ›" : "Reposición ›"}</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </Seccion>

          <Seccion titulo="LO ÚLTIMO">
            <View style={[card(16), { overflow: "hidden" }]}>
              {recientes.map((m, i) => (
                <MovFila key={m.id} m={m} caja={caja} primero={i === 0} onPress={() => onEditar(m)} />
              ))}
              {!recientes.length ? <Text style={t(12, 400, C.muted, { padding: 26, textAlign: "center" })}>Aún no hay movimientos. Sube unas capturas para empezar.</Text> : null}
            </View>
          </Seccion>
        </View>
      </ScrollView>
    </View>
  );
}
