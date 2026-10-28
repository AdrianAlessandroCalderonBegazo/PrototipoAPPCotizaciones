import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { C, card, kicker, t } from "../theme";
import { AvisoSync, Seccion } from "../components/fin";
import { MovFila } from "../components/MovFila";
import { Chip, DateField, TealGradient, TextField } from "../components/ui";
import { fdateLarga, money, today } from "../lib/format";
import { norm } from "../lib/fin/captura";
import { ordenMov, r2, resumenMov } from "../lib/fin/calc";
import { cuentasActivas, type State } from "../lib/fin/store";
import { TIPO_MOV_LABEL, TIPOS_MOV, type Mov, type TipoMov } from "../lib/fin/types";
import { PRESETS, rangoPreset, type Preset } from "../lib/reportes/periodo";
import type { EstadoSync } from "../lib/fin/sync";

/** Libro: todos los movimientos, con filtros por período, cuenta, tipo y texto. Tocar uno lo abre para corregirlo. */
export function Libro({ caja, estado, onEditar, topInset }: { caja: State; estado: EstadoSync; onEditar: (m: Mov) => void; topInset: number }) {
  const [preset, setPreset] = useState<Preset>("mes");
  const [otro, setOtro] = useState(() => ({ desde: today(), hasta: today() }));
  const [cuenta, setCuenta] = useState("");
  const [tipo, setTipo] = useState<TipoMov | "">("");
  const [q, setQ] = useState("");
  const { desde, hasta } = preset === "otro" ? otro : rangoPreset(preset, today());
  const cuentas = cuentasActivas(caja);

  const lista = useMemo(() => {
    const k = norm(q);
    return caja.movs
      .filter((m) => m.fecha >= desde && m.fecha <= hasta)
      .filter((m) => !cuenta || m.cuenta_id === cuenta || m.destino_id === cuenta)
      .filter((m) => !tipo || m.tipo === tipo)
      .filter((m) => !k || norm(`${resumenMov(m)} ${m.pagado_a} ${m.concepto} ${m.categoria} ${m.subcategoria} ${m.nro_operacion}`).includes(k))
      .sort((a, b) => -ordenMov(a, b));
  }, [caja.movs, desde, hasta, cuenta, tipo, q]);

  const grupos = useMemo(() => {
    const out: { fecha: string; items: Mov[] }[] = [];
    for (const m of lista) {
      const g = out[out.length - 1];
      if (g && g.fecha === m.fecha) g.items.push(m);
      else out.push({ fecha: m.fecha, items: [m] });
    }
    return out;
  }, [lista]);

  const ingresos = r2(lista.filter((m) => m.tipo === "INGRESO").reduce((a, m) => a + m.monto, 0));
  const egresos = r2(lista.filter((m) => m.tipo === "EGRESO").reduce((a, m) => a + m.monto, 0));

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <TealGradient style={{ paddingTop: 18 + topInset, paddingHorizontal: 20, paddingBottom: 26 }}>
          <Text style={kicker("rgba(255,255,255,.9)", 11)}>LIBRO</Text>
          <Text style={t(26, 800, C.white, { letterSpacing: -0.5, marginTop: 6 })}>Movimientos</Text>
          <Text style={t(12, 400, "rgba(255,255,255,.88)", { marginTop: 2 })}>{lista.length} {lista.length === 1 ? "movimiento" : "movimientos"} · ingresos {money(ingresos)} · egresos {money(egresos)}</Text>
        </TealGradient>

        <AvisoSync estado={estado} caja={caja} />

        <View style={{ padding: 16, gap: 16 }}>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {PRESETS.filter((p) => p.id !== "hoy" || true).map((p) => (
              <Chip key={p.id} label={p.label} active={preset === p.id} onPress={() => setPreset(p.id)} />
            ))}
          </View>
          {preset === "otro" ? (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <DateField value={otro.desde} onChange={(v) => setOtro((o) => ({ ...o, desde: v }))} />
              </View>
              <View style={{ flex: 1 }}>
                <DateField value={otro.hasta} onChange={(v) => setOtro((o) => ({ ...o, hasta: v }))} />
              </View>
            </View>
          ) : null}
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <Chip label="Todas las cuentas" active={!cuenta} onPress={() => setCuenta("")} />
            {cuentas.map((c) => (
              <Chip key={c.id} label={c.nombre} active={cuenta === c.id} onPress={() => setCuenta(cuenta === c.id ? "" : c.id)} />
            ))}
          </View>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <Chip label="Todos" active={!tipo} onPress={() => setTipo("")} />
            {TIPOS_MOV.map((x) => (
              <Chip key={x} label={TIPO_MOV_LABEL[x]} active={tipo === x} onPress={() => setTipo(tipo === x ? "" : x)} />
            ))}
          </View>
          <TextField value={q} onChangeText={setQ} placeholder="Buscar: nombre, concepto, categoría, operación…" accessibilityLabel="Buscar en el libro" />

          {grupos.map((g) => (
            <Seccion key={g.fecha} titulo={fdateLarga(g.fecha).toUpperCase()}>
              <View style={[card(16), { overflow: "hidden" }]}>
                {g.items.map((m, i) => (
                  <MovFila key={m.id} m={m} caja={caja} primero={i === 0} onPress={() => onEditar(m)} cuentaVista={cuenta || undefined} />
                ))}
              </View>
            </Seccion>
          ))}
          {!grupos.length ? (
            <View style={[card(16), { padding: 26 }]}>
              <Text style={t(12, 400, C.muted, { textAlign: "center", lineHeight: 18 })}>No hay movimientos con esos filtros.</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
