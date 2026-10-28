/** Piezas visuales propias de ICR Finanzas 2 (el resto vive en ui.tsx). */
import { useEffect, useState, type ReactNode } from "react";
import { Image, Modal, Pressable, Switch, Text, View } from "react-native";
import { C, card, kicker, t } from "../theme";
import { PrimaryButton } from "./ui";
import type { Adjunto } from "../lib/fin/types";
import { conError, pendientes, type State } from "../lib/fin/store";
import { sync, urlAdjunto } from "../lib/fin/runtime";
import { urlFoto } from "../lib/fin/fotos";
import type { EstadoSync } from "../lib/fin/sync";
import type { FotoGuardada } from "../lib/fin/fotos";

// ---- barra de pestañas -------------------------------------------------------------------------

export type Pestana = "inicio" | "libro" | "libreta" | "reportes";

function Icono({ tipo, color }: { tipo: Pestana; color: string }) {
  const borde = { borderWidth: 2, borderColor: color };
  if (tipo === "inicio")
    return (
      <View style={[{ width: 24, height: 24, borderRadius: 7, alignItems: "center", justifyContent: "center" }, borde]}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      </View>
    );
  if (tipo === "libro")
    return (
      <View style={[{ width: 24, height: 24, borderRadius: 6, paddingHorizontal: 4, justifyContent: "center", gap: 3 }, borde]}>
        <View style={{ height: 2, backgroundColor: color, borderRadius: 1 }} />
        <View style={{ height: 2, backgroundColor: color, borderRadius: 1 }} />
        <View style={{ height: 2, width: "55%", backgroundColor: color, borderRadius: 1 }} />
      </View>
    );
  if (tipo === "libreta")
    return (
      <View style={{ width: 24, height: 24, alignItems: "center", justifyContent: "flex-end" }}>
        <View style={{ position: "absolute", top: 1, width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: color }} />
        <View style={{ width: 22, height: 10, borderTopLeftRadius: 11, borderTopRightRadius: 11, borderWidth: 2, borderBottomWidth: 0, borderColor: color }} />
      </View>
    );
  return (
    <View style={{ width: 24, height: 24, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 2 }}>
      {[10, 18, 14].map((h, i) => (
        <View key={i} style={{ width: 5, height: h, borderRadius: 1.5, backgroundColor: color }} />
      ))}
    </View>
  );
}

const PESTANAS: { id: Pestana; label: string }[] = [
  { id: "inicio", label: "Inicio" },
  { id: "libro", label: "Libro" },
  { id: "libreta", label: "Libreta" },
  { id: "reportes", label: "Reportes" },
];

export function TabBar({ activa, onPick, bottomInset }: { activa: Pestana; onPick: (p: Pestana) => void; bottomInset: number }) {
  return (
    <View style={{ flexDirection: "row", backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line, paddingBottom: bottomInset }} accessibilityRole="tablist">
      {PESTANAS.map((p) => {
        const on = p.id === activa;
        const color = on ? C.teal : C.placeholder;
        return (
          <Pressable key={p.id} onPress={() => onPick(p.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ flex: 1, alignItems: "center", paddingTop: 0, paddingBottom: 9 }}>
            <View style={{ width: 30, height: 3, borderRadius: 2, backgroundColor: on ? C.teal : "transparent", marginBottom: 9 }} />
            <Icono tipo={p.id} color={color} />
            <Text style={t(10.5, on ? 800 : 600, color, { marginTop: 5 })}>{p.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---- aviso de sincronización -------------------------------------------------------------------

/** Barra bajo el encabezado: dice si hay cambios por enviar, si falta conexión o si el servidor rechazó algo. */
export function AvisoSync({ estado, caja }: { estado: EstadoSync; caja: State }) {
  const pend = pendientes(caja);
  const errores = conError(caja).length;
  if (estado.fase === "sesion-vencida") return <Franja color={C.red} fondo="#FBE9E9" texto="Tu sesión venció. Vuelve a iniciar sesión para enviar lo pendiente." />;
  if (errores > 0)
    return <Franja color={C.red} fondo="#FBE9E9" texto={`${errores} ${errores === 1 ? "cambio no se pudo guardar" : "cambios no se pudieron guardar"}. Revisa los marcados en rojo.`} accion="Reintentar" onAccion={() => void sync.reintentarTodo()} />;
  if (estado.fase === "sin-conexion") return <Franja color={C.ink} fondo={C.tint} texto={pend ? `Sin conexión · ${pend} ${pend === 1 ? "cambio" : "cambios"} por enviar. Todo queda guardado en este dispositivo.` : "Sin conexión. Puedes seguir trabajando; se enviará al volver."} accion="Reintentar" onAccion={() => void sync.sincronizar()} />;
  if (estado.fase === "sincronizando" && pend) return <Franja color={C.ink} fondo={C.tint} texto={`Enviando ${pend} ${pend === 1 ? "cambio" : "cambios"}…`} />;
  if (pend) return <Franja color={C.ink} fondo={C.tint} texto={`${pend} ${pend === 1 ? "cambio" : "cambios"} por enviar`} accion="Enviar ahora" onAccion={() => void sync.sincronizar()} />;
  return null;
}

function Franja({ texto, fondo, color, accion, onAccion }: { texto: string; fondo: string; color: string; accion?: string; onAccion?: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: fondo, paddingVertical: 9, paddingHorizontal: 16 }} accessibilityRole="alert">
      <Text style={t(12, 600, color, { flex: 1, lineHeight: 16 })}>{texto}</Text>
      {accion ? (
        <Pressable onPress={onAccion} hitSlop={8}>
          <Text style={t(12, 800, C.teal)}>{accion}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Etiqueta chica dentro de una fila: "Sin enviar", error, etc. */
export function Etiqueta({ texto, tono }: { texto: string; tono: "info" | "error" }) {
  const e = tono === "error";
  return (
    <View style={{ alignSelf: "flex-start", paddingVertical: 2, paddingHorizontal: 7, borderRadius: 5, backgroundColor: e ? "#FBE9E9" : C.tint }}>
      <Text style={t(9.5, 800, e ? C.red : C.teal, { letterSpacing: 0.4 })}>{texto}</Text>
    </View>
  );
}

// ---- campos ------------------------------------------------------------------------------------

export function FilaSwitch({ titulo, detalle, value, onValueChange }: { titulo: string; detalle: string; value: boolean; onValueChange: (v: boolean) => void }) {
  return (
    <View style={[card(14), { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 }]}>
      <View style={{ flex: 1 }}>
        <Text style={t(13, 700)}>{titulo}</Text>
        <Text style={t(11.5, 400, C.muted, { marginTop: 3, lineHeight: 16 })}>{detalle}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ false: C.border, true: C.teal }} thumbColor={C.white} accessibilityLabel={titulo} />
    </View>
  );
}

// ---- fotos de recibos --------------------------------------------------------------------------

/** Una foto en el formulario: ya guardada en el servidor/dispositivo (`adj`) o recién tomada (`nueva`). */
export type FotoItem = { id: string; adj?: Adjunto; nueva?: FotoGuardada };

function useUrl(item: FotoItem) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    const p = item.nueva ? urlFoto(item.nueva.key) : item.adj ? urlAdjunto(item.adj) : Promise.resolve(null);
    void p.then((u) => vivo && setUrl(u));
    return () => {
      vivo = false;
    };
  }, [item.id, item.nueva?.key, item.adj?.id, item.adj?.localKey]);
  return url;
}

export function Miniatura({ item, onVer, onQuitar }: { item: FotoItem; onVer: (url: string) => void; onQuitar?: () => void }) {
  const url = useUrl(item);
  return (
    <View style={{ width: 72, height: 72 }}>
      <Pressable onPress={() => url && onVer(url)} accessibilityLabel="Ver foto del recibo" style={{ width: 72, height: 72, borderRadius: 12, overflow: "hidden", backgroundColor: C.stripeB, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
        {url ? <Image source={{ uri: url }} style={{ width: "100%", height: "100%" }} resizeMode="cover" /> : <Text style={t(10, 700, C.muted)}>foto</Text>}
      </Pressable>
      {onQuitar ? (
        <Pressable onPress={onQuitar} accessibilityLabel="Quitar foto" hitSlop={6} style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: C.ink, alignItems: "center", justifyContent: "center" }}>
          <Text style={t(13, 800, C.white, { marginTop: -1 })}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Fotos de recibos: miniaturas, botones para tomar/elegir otra, y vista ampliada al tocar. */
export function FotosBloque({ items, onAgregar, onQuitar, error, ocupado }: { items: FotoItem[]; onAgregar: (o: "camara" | "galeria") => void; onQuitar: (id: string) => void; error?: string | null; ocupado?: boolean }) {
  const [grande, setGrande] = useState<string | null>(null);
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {items.map((it) => (
          <Miniatura key={it.id} item={it} onVer={setGrande} onQuitar={() => onQuitar(it.id)} />
        ))}
        {items.length === 0 ? <Text style={t(12, 400, C.muted, { alignSelf: "center" })}>Aún no hay fotos de recibos.</Text> : null}
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {(["camara", "galeria"] as const).map((o) => (
          <Pressable key={o} onPress={() => onAgregar(o)} disabled={ocupado} style={({ pressed }) => ({ flex: 1, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: C.navy, backgroundColor: pressed ? C.bg : C.card, alignItems: "center", justifyContent: "center", opacity: ocupado ? 0.5 : 1 })}>
            <Text style={t(12.5, 800, C.navy)}>{o === "camara" ? "Tomar foto" : "Elegir de la galería"}</Text>
          </Pressable>
        ))}
      </View>
      {error ? <Text style={t(11.5, 400, C.red)}>{error}</Text> : null}
      <Modal visible={!!grande} transparent animationType="fade" onRequestClose={() => setGrande(null)}>
        <Pressable onPress={() => setGrande(null)} accessibilityLabel="Cerrar foto" style={{ flex: 1, backgroundColor: "rgba(13,34,51,.92)", alignItems: "center", justifyContent: "center", padding: 16 }}>
          {grande ? <Image source={{ uri: grande }} style={{ width: "100%", height: "88%" }} resizeMode="contain" /> : null}
          <Text style={t(12, 700, C.white, { marginTop: 10 })}>Toca para cerrar</Text>
        </Pressable>
      </Modal>
    </View>
  );
}

/** Miniaturas de solo lectura (detalle de un movimiento). */
export function FotosSoloLectura({ adjuntos }: { adjuntos: Adjunto[] }) {
  const [grande, setGrande] = useState<string | null>(null);
  if (!adjuntos.length) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {adjuntos.map((a) => (
        <Miniatura key={a.id} item={{ id: a.id, adj: a }} onVer={setGrande} />
      ))}
      <Modal visible={!!grande} transparent animationType="fade" onRequestClose={() => setGrande(null)}>
        <Pressable onPress={() => setGrande(null)} style={{ flex: 1, backgroundColor: "rgba(13,34,51,.92)", alignItems: "center", justifyContent: "center", padding: 16 }}>
          {grande ? <Image source={{ uri: grande }} style={{ width: "100%", height: "88%" }} resizeMode="contain" /> : null}
          <Text style={t(12, 700, C.white, { marginTop: 10 })}>Toca para cerrar</Text>
        </Pressable>
      </Modal>
    </View>
  );
}

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

export { PrimaryButton };
