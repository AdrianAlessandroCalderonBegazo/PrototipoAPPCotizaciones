import { Component, useCallback, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFonts, Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from "@expo-google-fonts/manrope";

import { C, t } from "./src/theme";
import { loadSession, logout, refrescarPermisos, setUnauthorizedHandler, type Session } from "./src/lib/api";
import { ROL_LABEL } from "./src/lib/caja/permisos";
import * as icr from "./src/lib/icr/api";
import type { Mov, Resumen } from "./src/lib/icr/tipos";
import { Login } from "./src/screens/Login";
import { Inicio } from "./src/screens/icr/Inicio";
import { MovForm, type ModoForm } from "./src/screens/icr/MovForm";
import { Capturas } from "./src/screens/icr/Capturas";
import { Detalle } from "./src/screens/icr/Detalle";
import { Historial } from "./src/screens/icr/Historial";
import { Reportes } from "./src/screens/icr/Reportes";
import { Preguntar } from "./src/screens/Preguntar";
import { MenuLateral, TabBar, type Pestana } from "./src/components/icr";
import { ANCHO, useEscritorio } from "./src/lib/layout";
import { Avisos } from "./src/components/Overlays";

export default function App() {
  const [fontsLoaded] = useFonts({ Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold });
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: C.stripeB }}>
        <StatusBar style="light" />
        {fontsLoaded ? (
          <ErrorBoundary>
            <Shell />
          </ErrorBoundary>
        ) : null}
      </View>
    </SafeAreaProvider>
  );
}

type Vista = { t: "form"; modo: ModoForm; mov?: Mov } | { t: "digital" } | null;

/** Sesión, pestañas, formularios y avisos. La app trabaja siempre conectada: los datos los guarda el servidor. */
function Shell() {
  const insets = useSafeAreaInsets();
  const escritorio = useEscritorio();
  const [listo, setListo] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState<Pestana>("inicio");
  const [vista, setVista] = useState<Vista>(null);
  const [detalle, setDetalle] = useState<Mov | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [avisos, setAvisos] = useState<{ id: string; texto: string }[]>([]);
  const avisar = (texto: string) => {
    const id = String(Date.now() + Math.random());
    setAvisos((a) => [...a.slice(-2), { id, texto }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 6000);
  };

  useEffect(() => {
    setUnauthorizedHandler(() => setSession(null));
    void loadSession().then(async (s) => {
      setSession(s);
      setListo(true);
      if (s) setSession((await refrescarPermisos()) ?? s); // por si cambiaron el rol desde la última vez
    });
    return () => setUnauthorizedHandler(null);
  }, []);
  // el rol puede cambiar mientras la app está abierta: se vuelve a preguntar cada tanto
  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => void refrescarPermisos().then((s) => s && setSession(s)), 60_000);
    return () => clearInterval(id);
  }, [!!session]);

  const conSesion = !!session && session.permisos.acceso;
  const cargar = useCallback(() => {
    setCargando(true);
    icr.resumen().then((r) => (setResumen(r), setError(null))).catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar la caja.")).finally(() => setCargando(false));
  }, []);
  useEffect(() => {
    if (conSesion) cargar();
  }, [conSesion, version, cargar]);
  // la caja la usan varias personas a la vez (y el ERP envía fondos): se refresca sola cada minuto en la pantalla principal
  useEffect(() => {
    if (!conSesion || tab !== "inicio" || vista) return;
    const id = setInterval(cargar, 60_000);
    return () => clearInterval(id);
  }, [conSesion, tab, vista, cargar]);

  if (!listo) return null;
  const inset = { topInset: insets.top, bottomInset: insets.bottom };
  const salir = () => void logout().then(() => (setSession(null), setResumen(null), setVista(null), setDetalle(null)));
  const hecho = (mensaje: string) => {
    setVista(null);
    setDetalle(null);
    setVersion((v) => v + 1);
    avisar(mensaje);
  };
  const opciones = resumen ?? null;

  return (
    // Teléfono (y tableta): una columna. Computadora: menú lateral a la izquierda y el contenido en un panel centrado.
    <View style={{ flex: 1, width: "100%", flexDirection: escritorio && conSesion ? "row" : "column", maxWidth: escritorio ? undefined : 640, alignSelf: "center", backgroundColor: escritorio && conSesion ? C.stripeB : C.bg }}>
      {!session ? (
        <Login onLoggedIn={() => void loadSession().then((s) => setSession(s))} {...inset} />
      ) : !session.permisos.acceso ? (
        <SinAcceso session={session} onSalir={salir} {...inset} />
      ) : (
        <>
          {escritorio ? <MenuLateral activa={tab} onPick={(p) => (setTab(p), setVista(null))} nombre={session.nombre} rol={ROL_LABEL[session.rolCodigo] ?? session.rolCodigo} onSalir={salir} /> : null}
          <View style={{ flex: 1, alignItems: "center" }}>
            <View style={{ flex: 1, width: "100%", ...(escritorio ? { maxWidth: ANCHO.panel + 40, backgroundColor: C.bg, borderLeftWidth: 1, borderRightWidth: 1, borderColor: C.line } : {}) }}>
              <View style={{ flex: 1 }}>
                {vista?.t === "form" && opciones ? (
                  <MovForm modo={vista.modo} mov={vista.mov} opciones={opciones} onCerrar={() => setVista(null)} onListo={hecho} {...inset} />
                ) : vista?.t === "digital" && opciones ? (
                  <Capturas opciones={opciones} onCerrar={() => (setVista(null), setVersion((v) => v + 1))} onListo={hecho} {...inset} />
                ) : (
                  <>
                    {tab === "inicio" ? (
                      <Inicio datos={resumen} error={error} cargando={cargando} recargar={cargar} escribir={session.permisos.escribir} nombre={session.nombre}
                        onAccion={(a) => setVista(a === "digital" ? { t: "digital" } : { t: "form", modo: a })} onVer={setDetalle} onSalir={escritorio ? undefined : salir} topInset={insets.top} />
                    ) : null}
                    {tab === "historial" ? <Historial version={version} onVer={setDetalle} topInset={insets.top} /> : null}
                    {tab === "preguntar" ? <Preguntar {...inset} /> : null}
                    {tab === "reportes" ? <Reportes version={version} nombre={session.nombre} topInset={insets.top} /> : null}
                  </>
                )}
              </View>
              {!escritorio && !vista ? <TabBar activa={tab} onPick={setTab} bottomInset={insets.bottom} /> : null}
              {detalle && !vista ? (
                <Detalle key={detalle.id} mov={detalle} escribir={session.permisos.escribir} esAdmin={session.rolCodigo === "admin"} onCerrar={() => setDetalle(null)}
                  onEditar={(m) => (setDetalle(null), setVista({ t: "form", modo: m.tipo === "INGRESO" ? "venta" : "gasto", mov: m }))}
                  onCambio={(msg) => (setVersion((v) => v + 1), avisar(msg))} bottomInset={insets.bottom} />
              ) : null}
              <Avisos avisos={avisos} onCerrar={(id) => setAvisos((a) => a.filter((x) => x.id !== id))} topInset={insets.top} />
            </View>
          </View>
        </>
      )}
    </View>
  );
}

/** Cuenta válida pero sin permiso para Finanzas (p. ej. almacén o vendedor). */
function SinAcceso({ session, onSalir, topInset }: { session: Session; onSalir: () => void; topInset: number; bottomInset: number }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: 24, paddingTop: 64 + topInset, gap: 10 }}>
      <Text style={t(24, 800)}>Sin acceso a Finanzas</Text>
      <Text style={t(13, 400, C.muted, { lineHeight: 19 })}>
        Tu cuenta ({session.nombre}) tiene el rol «{ROL_LABEL[session.rolCodigo] ?? session.rolCodigo}», que no puede usar Finanzas. Pídele a un administrador que le dé a tu rol acceso a «Finanzas (Caja ICR)» en la matriz de permisos del ERP.
      </Text>
      <Pressable onPress={onSalir} style={{ height: 54, borderRadius: 14, backgroundColor: C.teal, alignItems: "center", justifyContent: "center", marginTop: 14 }}>
        <Text style={t(14, 800, C.white)}>SALIR</Text>
      </Pressable>
    </View>
  );
}

/**
 * If a screen throws while rendering, show what happened (and let the user retry) instead of the
 * app silently closing. The message is what we need to fix the problem.
 */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ICR Finanzas crash:", error, info.componentStack);
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, padding: 24, paddingTop: 64 }}>
        <Text style={t(24, 800)}>Algo salió mal</Text>
        <Text style={t(13, 600, C.muted, { marginTop: 8 })}>Toma una captura de esta pantalla y envíala para corregirlo.</Text>
        <ScrollView style={{ flex: 1, marginVertical: 16, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line }} contentContainerStyle={{ padding: 14 }}>
          <Text style={t(12, 700, C.red)}>{String(error.message)}</Text>
          <Text style={t(10.5, 400, C.muted, { marginTop: 8 })}>{String(error.stack ?? "").slice(0, 1500)}</Text>
        </ScrollView>
        <Pressable onPress={() => this.setState({ error: null })} style={{ height: 54, borderRadius: 14, backgroundColor: C.teal, alignItems: "center", justifyContent: "center" }}>
          <Text style={t(14, 800, C.white)}>REINTENTAR</Text>
        </Pressable>
      </View>
    );
  }
}
