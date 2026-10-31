/** Piezas visuales de la Caja ICR: pestañas, menú lateral, filas de movimientos y fotos. */
import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Image, Modal, Pressable, Text, View } from "react-native";
import { C, card, kicker, t } from "../theme";
import { urlFoto } from "../lib/icr/api";
import { soles } from "../lib/icr/dinero";
import { catTexto, MEDIO_LABEL, ORIGEN_LABEL, type Mov } from "../lib/icr/tipos";
import { fdate } from "../lib/format";

// ---- pestañas ----------------------------------------------------------------------------------

export type Pestana = "inicio" | "historial" | "preguntar" | "reportes";

function Icono({ tipo, color }: { tipo: Pestana; color: string }) {
  const borde = { borderWidth: 2, borderColor: color };
  if (tipo === "inicio")
    return (
      <View style={[{ width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" }, borde]}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      </View>
    );
  if (tipo === "preguntar")
    return (
      <View style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
        <View style={[{ width: 22, height: 17, borderRadius: 7, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 2.5 }, borde]}>
          {[0, 1, 2].map((i) => <View key={i} style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: color }} />)}
        </View>
        <View style={{ position: "absolute", bottom: 1, left: 5, width: 0, height: 0, borderLeftWidth: 4, borderRightWidth: 4, borderTopWidth: 5, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: color }} />
      </View>
    );
  if (tipo === "historial")
    return (
      <View style={[{ width: 24, height: 24, borderRadius: 6, paddingHorizontal: 4, justifyContent: "center", gap: 3 }, borde]}>
        <View style={{ height: 2, backgroundColor: color, borderRadius: 1 }} />
        <View style={{ height: 2, width: "60%", backgroundColor: color, borderRadius: 1 }} />
      </View>
    );
  return (
    <View style={{ width: 24, height: 24, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 2 }}>
      {[10, 18, 14].map((h, i) => <View key={i} style={{ width: 5, height: h, borderRadius: 1.5, backgroundColor: color }} />)}
    </View>
  );
}

const PESTANAS: { id: Pestana; label: string }[] = [
  { id: "inicio", label: "Caja ICR" },
  { id: "historial", label: "Historial" },
  { id: "preguntar", label: "Preguntar" },
  { id: "reportes", label: "Reportes" },
];

export function TabBar({ activa, onPick, bottomInset }: { activa: Pestana; onPick: (p: Pestana) => void; bottomInset: number }) {
  return (
    <View style={{ flexDirection: "row", backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line, paddingBottom: bottomInset }} accessibilityRole="tablist">
      {PESTANAS.map((p) => {
        const on = p.id === activa;
        const color = on ? C.teal : C.placeholder;
        return (
          <Pressable key={p.id} onPress={() => onPick(p.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ flex: 1, alignItems: "center", paddingBottom: 9 }}>
            <View style={{ width: 30, height: 3, borderRadius: 2, backgroundColor: on ? C.teal : "transparent", marginBottom: 9 }} />
            <Icono tipo={p.id} color={color} />
            <Text style={t(10.5, on ? 800 : 600, color, { marginTop: 5 })}>{p.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Menú lateral para la computadora: el mismo contenido que la barra de abajo del teléfono. */
export function MenuLateral({ activa, onPick, nombre, rol, onSalir }: { activa: Pestana; onPick: (p: Pestana) => void; nombre: string; rol: string; onSalir: () => void }) {
  return (
    <View style={{ width: 240, backgroundColor: C.card, borderRightWidth: 1, borderRightColor: C.line, paddingVertical: 22, paddingHorizontal: 14 }} accessibilityRole="tablist">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 8, marginBottom: 26 }}>
        <Image source={require("../../assets/icon.png")} style={{ width: 38, height: 38, borderRadius: 10 }} accessibilityLabel="ICR" />
        <View>
          <Text style={t(15, 800, C.ink)}>ICR Finanzas</Text>
          <Text style={t(11, 400, C.muted)}>Caja ICR</Text>
        </View>
      </View>
      <View style={{ gap: 4 }}>
        {PESTANAS.map((p) => {
          const on = p.id === activa;
          return (
            <Pressable
              key={p.id} onPress={() => onPick(p.id)} accessibilityRole="tab" accessibilityState={{ selected: on }}
              style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, backgroundColor: on ? C.tint : pressed || hovered ? C.bg : "transparent" })}
            >
              <Icono tipo={p.id} color={on ? C.teal : C.muted} />
              <Text style={t(13.5, on ? 800 : 600, on ? C.teal : C.ink)}>{p.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flex: 1 }} />
      <View style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: 14, paddingHorizontal: 8, gap: 2 }}>
        <Text style={t(13, 800, C.ink)} numberOfLines={1}>{nombre}</Text>
        <Text style={t(11.5, 400, C.muted)}>{rol}</Text>
        <Pressable onPress={onSalir} accessibilityRole="button" style={{ marginTop: 8, alignSelf: "flex-start" }}>
          <Text style={t(12, 800, C.teal)}>Cerrar sesión</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---- piezas ------------------------------------------------------------------------------------

export function Seccion({ titulo, children, derecha }: { titulo: string; children: ReactNode; derecha?: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={kicker(C.ink, 11.5)}>{titulo}</Text>
        {derecha}
      </View>
      {children}
    </View>
  );
}

export function Etiqueta({ texto, tono = "info" }: { texto: string; tono?: "info" | "error" }) {
  const e = tono === "error";
  return (
    <View style={{ alignSelf: "flex-start", paddingVertical: 2, paddingHorizontal: 7, borderRadius: 5, backgroundColor: e ? "#FBE9E9" : C.tint }}>
      <Text style={t(9.5, 800, e ? C.red : C.teal, { letterSpacing: 0.4 })}>{texto}</Text>
    </View>
  );
}

/** Aviso en una franja (información o error). */
export function Franja({ texto, tono = "info" }: { texto: string; tono?: "info" | "error" | "alerta" }) {
  const fondo = tono === "error" ? "#FBE9E9" : tono === "alerta" ? "#FFF4DE" : C.tint;
  const color = tono === "error" ? C.red : tono === "alerta" ? "#8A5A00" : C.teal;
  return (
    <View style={{ borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: fondo }}>
      <Text style={t(12, 600, color, { lineHeight: 17 })}>{texto}</Text>
    </View>
  );
}

/** Un movimiento en una lista: descripción, categoría · medio, monto con signo. */
export function MovFila({ m, onPress, conFecha = false }: { m: Mov; onPress: () => void; conFecha?: boolean }) {
  const entra = m.tipo === "INGRESO";
  const sub = [conFecha ? fdate(m.fecha) : null, m.origen === "GASTO" || m.origen === "CAPTURA" || m.origen === "VENTA" ? catTexto(m) : ORIGEN_LABEL[m.origen], MEDIO_LABEL[m.medio], m.persona].filter(Boolean).join(" · ");
  const sinFoto = m.origen === "GASTO" && !m.adjuntos.length && !m.anulado;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [card(14), { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, opacity: m.anulado ? 0.55 : 1 }, pressed && { backgroundColor: C.bg }]}>
      <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: entra ? C.tint : C.outIcon }}>
        <Text style={t(16, 800, entra ? C.teal : C.navy)}>{entra ? "↓" : "↑"}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={t(13.5, 700, C.ink, m.anulado ? { textDecorationLine: "line-through" } : {})} numberOfLines={1}>{m.descripcion}</Text>
        <Text style={t(11.5, 400, C.muted)} numberOfLines={1}>{sub}</Text>
        {m.anulado ? <Etiqueta texto="ANULADO" tono="error" /> : sinFoto ? <Etiqueta texto="SIN FOTO" tono="error" /> : null}
      </View>
      <Text style={t(14, 800, entra ? C.teal : C.ink)}>{entra ? "+" : "−"}{soles(m.monto)}</Text>
    </Pressable>
  );
}

// ---- fotos -------------------------------------------------------------------------------------

function Ampliada({ fuente, onCerrar }: { fuente: { uri: string; headers?: Record<string, string> } | null; onCerrar: () => void }) {
  return (
    <Modal visible={!!fuente} transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable onPress={onCerrar} accessibilityLabel="Cerrar foto" style={{ flex: 1, backgroundColor: "rgba(13,34,51,.92)", alignItems: "center", justifyContent: "center", padding: 16 }}>
        {fuente ? <Image source={fuente} style={{ width: "100%", height: "88%" }} resizeMode="contain" /> : null}
        <Text style={t(12, 700, C.white, { marginTop: 10 })}>Toca para cerrar</Text>
      </Pressable>
    </Modal>
  );
}

function Mini({ fuente, onVer, onQuitar }: { fuente: { uri: string; headers?: Record<string, string> } | null; onVer: () => void; onQuitar?: () => void }) {
  return (
    <View style={{ width: 72, height: 72 }}>
      <Pressable onPress={onVer} accessibilityLabel="Ver foto" style={{ width: 72, height: 72, borderRadius: 12, overflow: "hidden", backgroundColor: C.stripeB, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
        {fuente ? <Image source={fuente} style={{ width: "100%", height: "100%" }} resizeMode="cover" /> : <ActivityIndicator color={C.teal} />}
      </Pressable>
      {onQuitar ? (
        <Pressable onPress={onQuitar} accessibilityLabel="Quitar foto" hitSlop={6} style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: C.ink, alignItems: "center", justifyContent: "center" }}>
          <Text style={t(13, 800, C.white, { marginTop: -1 })}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function MiniRemota({ id, onVer }: { id: number; onVer: (f: { uri: string; headers?: Record<string, string> }) => void }) {
  const [f, setF] = useState<{ uri: string; headers?: Record<string, string> } | null>(null);
  useEffect(() => {
    let vivo = true;
    urlFoto(id).then((x) => vivo && setF(x)).catch(() => null);
    return () => {
      vivo = false;
    };
  }, [id]);
  return <Mini fuente={f} onVer={() => f && onVer(f)} />;
}

/** Fotos ya guardadas en el servidor (detalle de un movimiento). */
export function FotosGuardadas({ ids }: { ids: number[] }) {
  const [grande, setGrande] = useState<{ uri: string; headers?: Record<string, string> } | null>(null);
  if (!ids.length) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {ids.map((id) => <MiniRemota key={id} id={id} onVer={setGrande} />)}
      <Ampliada fuente={grande} onCerrar={() => setGrande(null)} />
    </View>
  );
}

/** Fotos elegidas en el formulario (todavía no subidas), con botones para tomar o elegir otra. */
export function FotosNuevas({ uris, onAgregar, onQuitar, ocupado, texto = "Aún no hay fotos." }: { uris: string[]; onAgregar: (o: "camara" | "galeria") => void; onQuitar: (i: number) => void; ocupado?: boolean; texto?: string }) {
  const [grande, setGrande] = useState<{ uri: string } | null>(null);
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {uris.map((u, i) => <Mini key={u} fuente={{ uri: u }} onVer={() => setGrande({ uri: u })} onQuitar={() => onQuitar(i)} />)}
        {uris.length === 0 ? <Text style={t(12, 400, C.muted, { alignSelf: "center" })}>{texto}</Text> : null}
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {(["camara", "galeria"] as const).map((o) => (
          <Pressable key={o} onPress={() => onAgregar(o)} disabled={ocupado} style={({ pressed }) => ({ flex: 1, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: C.navy, backgroundColor: pressed ? C.bg : C.card, alignItems: "center", justifyContent: "center", opacity: ocupado ? 0.5 : 1 })}>
            <Text style={t(12.5, 800, C.navy)}>{o === "camara" ? "Tomar foto" : "Elegir de la galería"}</Text>
          </Pressable>
        ))}
      </View>
      <Ampliada fuente={grande} onCerrar={() => setGrande(null)} />
    </View>
  );
}
