import { useState } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { C, card, kicker, t } from "../theme";
import { AvisoSync, Etiqueta } from "../components/fin";
import { Sheet } from "../components/Overlays";
import { Chip, FieldLabel, PrimaryButton, SecondaryButton, TealGradient, TextField } from "../components/ui";
import { apiJson } from "../lib/api";
import { money } from "../lib/format";
import { norm } from "../lib/fin/captura";
import { nuevoId } from "../lib/fin/ids";
import { store } from "../lib/fin/runtime";
import { errorDe, saldoDe, sinEnviar, type State } from "../lib/fin/store";
import { TIPO_CUENTA_LABEL, TIPO_PERSONA_LABEL, TIPOS_CUENTA, TIPOS_PERSONA, type Cuenta, type Persona, type TipoCuenta, type TipoPersona } from "../lib/fin/types";
import type { EstadoSync } from "../lib/fin/sync";

type Vista = "personas" | "cuentas";

/** Libreta: las personas (equipo, practicantes, proveedores) y las cuentas (bancos, Yape, efectivo). */
export function Libreta({ caja, estado, topInset, bottomInset }: { caja: State; estado: EstadoSync; topInset: number; bottomInset: number }) {
  const [vista, setVista] = useState<Vista>("personas");
  const [persona, setPersona] = useState<Persona | "nueva" | null>(null);
  const [cuenta, setCuenta] = useState<Cuenta | "nueva" | null>(null);
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState<TipoPersona | "">("");

  const personas = caja.personas
    .filter((p) => !tipo || p.tipo === tipo)
    .filter((p) => !norm(q) || norm(p.nombre).includes(norm(q)) || p.alias.some((a) => norm(a).includes(norm(q))))
    .sort((a, b) => Number(b.activa) - Number(a.activa) || a.nombre.localeCompare(b.nombre));
  const cuentas = [...caja.cuentas].sort((a, b) => Number(b.activa) - Number(a.activa) || a.orden - b.orden);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <TealGradient style={{ paddingTop: 18 + topInset, paddingHorizontal: 20, paddingBottom: 26 }}>
          <Text style={kicker("rgba(255,255,255,.9)", 11)}>LIBRETA</Text>
          <Text style={t(26, 800, C.white, { letterSpacing: -0.5, marginTop: 6 })}>{vista === "personas" ? "Personas" : "Cuentas"}</Text>
          <Text style={t(12, 400, "rgba(255,255,255,.88)", { marginTop: 2 })}>{vista === "personas" ? "Equipo, practicantes y proveedores" : "Bancos, Yape y efectivo"}</Text>
        </TealGradient>
        <AvisoSync estado={estado} caja={caja} />

        <View style={{ padding: 16, gap: 16 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Chip label="Personas" active={vista === "personas"} onPress={() => setVista("personas")} />
            <Chip label="Cuentas" active={vista === "cuentas"} onPress={() => setVista("cuentas")} />
          </View>

          {vista === "personas" ? (
            <>
              <PrimaryButton label="+ AGREGAR PERSONA" onPress={() => setPersona("nueva")} />
              <TextField value={q} onChangeText={setQ} placeholder="Buscar por nombre o alias" accessibilityLabel="Buscar persona" />
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                <Chip label="Todos" active={!tipo} onPress={() => setTipo("")} />
                {TIPOS_PERSONA.map((x) => (
                  <Chip key={x} label={TIPO_PERSONA_LABEL[x]} active={tipo === x} onPress={() => setTipo(tipo === x ? "" : x)} />
                ))}
              </View>
              <View style={[card(16), { overflow: "hidden" }]}>
                {personas.map((p, i) => (
                  <Pressable key={p.id} onPress={() => setPersona(p)} accessibilityLabel={`Editar ${p.nombre}`} style={({ pressed }) => ({ padding: 14, gap: 3, borderTopWidth: i ? 1 : 0, borderTopColor: C.stripeA, backgroundColor: pressed ? C.bg : C.card, opacity: p.activa ? 1 : 0.5 })}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                      <Text numberOfLines={1} style={t(13.5, 800, C.ink, { flex: 1 })}>{p.nombre}</Text>
                      {p.menu_monto > 0 ? <Text style={t(12, 800, C.teal)}>Menú {money(p.menu_monto)}</Text> : null}
                    </View>
                    <Text numberOfLines={1} style={t(11.5, 400, C.muted)}>{[TIPO_PERSONA_LABEL[p.tipo], p.alias.length ? `sale como: ${p.alias.join(", ")}` : null, p.activa ? null : "archivado"].filter(Boolean).join(" · ")}</Text>
                    {errorDe(caja, p.id) ? <Text style={t(11, 600, C.red)}>No se guardó: {errorDe(caja, p.id)}</Text> : sinEnviar(caja, p.id) ? <Etiqueta texto="SIN ENVIAR" tono="info" /> : null}
                  </Pressable>
                ))}
                {!personas.length ? <Text style={t(12, 400, C.muted, { padding: 26, textAlign: "center", lineHeight: 18 })}>{caja.personas.length ? "Nadie coincide con ese filtro." : "La libreta está vacía. Agrega a los trabajadores, practicantes y proveedores a quienes les pagas."}</Text> : null}
              </View>
            </>
          ) : (
            <>
              <PrimaryButton label="+ AGREGAR CUENTA" onPress={() => setCuenta("nueva")} />
              <View style={[card(16), { overflow: "hidden" }]}>
                {cuentas.map((c, i) => (
                  <Pressable key={c.id} onPress={() => setCuenta(c)} accessibilityLabel={`Editar ${c.nombre}`} style={({ pressed }) => ({ padding: 14, gap: 3, borderTopWidth: i ? 1 : 0, borderTopColor: C.stripeA, backgroundColor: pressed ? C.bg : C.card, opacity: c.activa ? 1 : 0.5 })}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                      <Text numberOfLines={1} style={t(13.5, 800, C.ink, { flex: 1 })}>{c.nombre}{c.id === caja.miCuentaId ? "  ·  tuya" : ""}</Text>
                      <Text style={t(13, 800, C.ink, { fontVariant: ["tabular-nums"] })}>{money(saldoDe(caja, c.id))}</Text>
                    </View>
                    <Text numberOfLines={1} style={t(11.5, 400, C.muted)}>{[TIPO_CUENTA_LABEL[c.tipo], c.titular, c.referencia ? `termina en ${c.referencia}` : null, c.umbral > 0 ? `aviso bajo ${money(c.umbral)}` : null, c.activa ? null : "archivada"].filter(Boolean).join(" · ")}</Text>
                    {errorDe(caja, c.id) ? <Text style={t(11, 600, C.red)}>No se guardó: {errorDe(caja, c.id)}</Text> : sinEnviar(caja, c.id) ? <Etiqueta texto="SIN ENVIAR" tono="info" /> : null}
                  </Pressable>
                ))}
                {!cuentas.length ? <Text style={t(12, 400, C.muted, { padding: 26, textAlign: "center", lineHeight: 18 })}>Crea las cuentas de la empresa: cada banco, el Yape de Diego, el de Milagros…</Text> : null}
              </View>
              <Text style={t(11, 400, C.muted, { lineHeight: 16 })}>Crear o cambiar cuentas requiere un usuario con permiso de administración; si no lo tienes, el servidor avisará.</Text>
            </>
          )}
        </View>
      </ScrollView>
      {persona ? <PersonaSheet persona={persona === "nueva" ? undefined : persona} onClose={() => setPersona(null)} bottomInset={bottomInset} /> : null}
      {cuenta ? <CuentaSheet caja={caja} cuenta={cuenta === "nueva" ? undefined : cuenta} onClose={() => setCuenta(null)} bottomInset={bottomInset} /> : null}
    </View>
  );
}

const Fila = ({ titulo, detalle, value, onValueChange }: { titulo: string; detalle?: string; value: boolean; onValueChange: (v: boolean) => void }) => (
  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
    <View style={{ flex: 1 }}>
      <Text style={t(13, 700)}>{titulo}</Text>
      {detalle ? <Text style={t(11.5, 400, C.muted, { marginTop: 2, lineHeight: 16 })}>{detalle}</Text> : null}
    </View>
    <Switch value={value} onValueChange={onValueChange} trackColor={{ false: C.border, true: C.teal }} thumbColor={C.white} accessibilityLabel={titulo} />
  </View>
);

function PersonaSheet({ persona, onClose, bottomInset }: { persona?: Persona; onClose: () => void; bottomInset: number }) {
  const [nombre, setNombre] = useState(persona?.nombre ?? "");
  const [tipo, setTipo] = useState<TipoPersona>(persona?.tipo ?? "OBRA");
  const [alias, setAlias] = useState((persona?.alias ?? []).join(", "));
  const [menu, setMenu] = useState(persona?.menu_monto ? String(persona.menu_monto) : "");
  const [activa, setActiva] = useState(persona?.activa ?? true);
  const [err, setErr] = useState("");

  const guardar = () => {
    if (!nombre.trim()) return setErr("Escribe el nombre.");
    store.guardarPersona({ id: persona?.id ?? nuevoId(), nombre: nombre.trim(), tipo, alias: alias.split(",").map((a) => a.trim()).filter(Boolean), menu_monto: tipo === "PLANILLA" || tipo === "PROVEEDOR" ? 0 : parseFloat(menu) || 0, activa });
    onClose();
  };
  return (
    <Sheet onClose={onClose} bottomInset={bottomInset}>
      <Text style={kicker(C.muted, 10.5)}>{persona ? "EDITAR PERSONA" : "NUEVA PERSONA"}</Text>
      <ScrollView style={{ marginTop: 10 }} contentContainerStyle={{ gap: 14, paddingBottom: 6 }} keyboardShouldPersistTaps="handled">
        <View>
          <FieldLabel>NOMBRE</FieldLabel>
          <TextField value={nombre} onChangeText={setNombre} placeholder="Nombre completo" accessibilityLabel="Nombre de la persona" />
        </View>
        <View>
          <FieldLabel>TIPO</FieldLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {TIPOS_PERSONA.map((x) => (
              <Chip key={x} label={TIPO_PERSONA_LABEL[x]} active={tipo === x} onPress={() => setTipo(x)} />
            ))}
          </View>
        </View>
        <View>
          <FieldLabel optional>COMO SALE EN LAS CAPTURAS</FieldLabel>
          <TextField value={alias} onChangeText={setAlias} placeholder="Ricardo Coa*, Ricardo C" accessibilityLabel="Alias" />
          <Text style={t(11, 400, C.muted, { marginTop: 6, lineHeight: 15 })}>Separados por coma. Ayuda a reconocerlo cuando el nombre sale cortado.</Text>
        </View>
        {tipo === "OBRA" || tipo === "PRACTICANTE" || tipo === "OTRO" ? (
          <View>
            <FieldLabel optional>MONTO DEL MENÚ</FieldLabel>
            <TextField value={menu} onChangeText={(v) => setMenu(v.replace(/[^\d.]/g, ""))} placeholder="Ej. 11 (vacío = no recibe menú)" keyboardType="decimal-pad" accessibilityLabel="Monto del menú" />
          </View>
        ) : (
          <Text style={t(11.5, 400, C.muted, { lineHeight: 16 })}>{tipo === "PLANILLA" ? "Las personas en planilla no reciben menú." : "A los proveedores se les paga, pero el gasto se carga a quien corresponda."}</Text>
        )}
        <Fila titulo="Activa" detalle="Si se va, archívala: queda su historial pero deja de aparecer." value={activa} onValueChange={setActiva} />
        {err ? <Text style={t(12, 600, C.red)}>{err}</Text> : null}
      </ScrollView>
      <View style={{ gap: 10, marginTop: 12 }}>
        <PrimaryButton label="GUARDAR" onPress={guardar} />
        <SecondaryButton label="Cancelar" onPress={onClose} />
      </View>
    </Sheet>
  );
}

function CuentaSheet({ caja, cuenta, onClose, bottomInset }: { caja: State; cuenta?: Cuenta; onClose: () => void; bottomInset: number }) {
  const [nombre, setNombre] = useState(cuenta?.nombre ?? "");
  const [tipo, setTipo] = useState<TipoCuenta>(cuenta?.tipo ?? "YAPE");
  const [titular, setTitular] = useState(cuenta?.titular ?? "");
  const [ref, setRef] = useState(cuenta?.referencia ?? "");
  const [saldo, setSaldo] = useState(cuenta ? String(cuenta.saldo_inicial) : "");
  const [umbral, setUmbral] = useState(cuenta?.umbral ? String(cuenta.umbral) : "");
  const [wa, setWa] = useState(cuenta?.aviso_whatsapp ?? "");
  const [tg, setTg] = useState(cuenta?.aviso_telegram ?? "");
  const [activa, setActiva] = useState(cuenta?.activa ?? true);
  const [mia, setMia] = useState(!!cuenta && caja.miCuentaId === cuenta.id);
  const [err, setErr] = useState("");
  const [prueba, setPrueba] = useState("");

  const guardar = () => {
    if (!nombre.trim()) return setErr("Escribe el nombre de la cuenta.");
    const id = cuenta?.id ?? nuevoId();
    store.guardarCuenta({ id, nombre: nombre.trim(), tipo, titular: titular.trim(), referencia: ref.replace(/\D/g, "").slice(-4), saldo_inicial: parseFloat(saldo.replace(/,/g, "")) || 0, umbral: parseFloat(umbral) || 0, aviso_whatsapp: wa.trim(), aviso_telegram: tg.trim(), activa });
    if (mia) store.setMiCuenta(id);
    else if (caja.miCuentaId === id) store.setMiCuenta("");
    onClose();
  };
  const probar = async () => {
    if (!cuenta) return;
    setPrueba("Enviando…");
    try {
      await apiJson("POST", `/v2/cuentas/${cuenta.id}/aviso-prueba`);
      setPrueba("✓ Mensaje enviado: revisa Telegram.");
    } catch (e) {
      setPrueba(e instanceof Error ? e.message : "No se pudo enviar.");
    }
  };

  return (
    <Sheet onClose={onClose} bottomInset={bottomInset}>
      <Text style={kicker(C.muted, 10.5)}>{cuenta ? "EDITAR CUENTA" : "NUEVA CUENTA"}</Text>
      <ScrollView style={{ marginTop: 10 }} contentContainerStyle={{ gap: 14, paddingBottom: 6 }} keyboardShouldPersistTaps="handled">
        <View>
          <FieldLabel>NOMBRE</FieldLabel>
          <TextField value={nombre} onChangeText={setNombre} placeholder="Ej. Yape Diego, Cta. cte. 2000" accessibilityLabel="Nombre de la cuenta" />
        </View>
        <View>
          <FieldLabel>TIPO</FieldLabel>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {TIPOS_CUENTA.map((x) => (
              <Chip key={x} label={TIPO_CUENTA_LABEL[x]} active={tipo === x} onPress={() => setTipo(x)} />
            ))}
          </View>
        </View>
        <View>
          <FieldLabel optional>QUIÉN LA MANEJA</FieldLabel>
          <TextField value={titular} onChangeText={setTitular} placeholder="Ej. Diego" accessibilityLabel="Titular" />
        </View>
        {tipo === "BANCO" ? (
          <View>
            <FieldLabel optional>ÚLTIMOS 4 DÍGITOS</FieldLabel>
            <TextField value={ref} onChangeText={setRef} placeholder="2000" keyboardType="number-pad" accessibilityLabel="Últimos 4 dígitos" />
            <Text style={t(11, 400, C.muted, { marginTop: 6, lineHeight: 15 })}>Así una captura del BCP («Desde ****2000») se asigna sola a esta cuenta.</Text>
          </View>
        ) : null}
        <View>
          <FieldLabel>SALDO INICIAL</FieldLabel>
          <TextField value={saldo} onChangeText={(v) => setSaldo(v.replace(/[^\d.-]/g, ""))} placeholder="Lo que tiene hoy, ej. 300" keyboardType="decimal-pad" accessibilityLabel="Saldo inicial" />
        </View>
        <View>
          <FieldLabel optional>AVISAR SI BAJA DE</FieldLabel>
          <TextField value={umbral} onChangeText={(v) => setUmbral(v.replace(/[^\d.]/g, ""))} placeholder="Ej. 40 (vacío = sin aviso)" keyboardType="decimal-pad" accessibilityLabel="Umbral de reposición" />
        </View>
        {umbral ? (
          <>
            <View>
              <FieldLabel optional>WHATSAPP DE QUIEN REPONE</FieldLabel>
              <TextField value={wa} onChangeText={setWa} placeholder="51999888777" keyboardType="phone-pad" accessibilityLabel="WhatsApp" />
            </View>
            <View>
              <FieldLabel optional>CHAT DE TELEGRAM (AVISO AUTOMÁTICO)</FieldLabel>
              <TextField value={tg} onChangeText={setTg} placeholder="Número de chat, ej. 123456789" accessibilityLabel="Chat de Telegram" />
              {cuenta && tg ? (
                <Pressable onPress={() => void probar()} style={{ marginTop: 8 }} accessibilityRole="button">
                  <Text style={t(12, 800, C.teal)}>Enviar mensaje de prueba ›</Text>
                </Pressable>
              ) : null}
              {prueba ? <Text style={t(11.5, 600, prueba.startsWith("✓") ? C.teal : C.red, { marginTop: 6 })}>{prueba}</Text> : null}
            </View>
          </>
        ) : null}
        <Fila titulo="Es mi cuenta" detalle="De aquí saldrán los pagos que yo registre." value={mia} onValueChange={setMia} />
        <Fila titulo="Activa" detalle="Archívala si ya no se usa: queda su historial." value={activa} onValueChange={setActiva} />
        {err ? <Text style={t(12, 600, C.red)}>{err}</Text> : null}
      </ScrollView>
      <View style={{ gap: 10, marginTop: 12 }}>
        <PrimaryButton label="GUARDAR" onPress={guardar} />
        <SecondaryButton label="Cancelar" onPress={onClose} />
      </View>
    </Sheet>
  );
}
