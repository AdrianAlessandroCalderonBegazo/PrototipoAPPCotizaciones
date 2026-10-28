import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFonts, Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from "@expo-google-fonts/manrope";

import { C, t } from "./src/theme";
import { loadSession, setUnauthorizedHandler, type Session } from "./src/lib/api";
import { sync, store, useFin, useEstadoSync, useSyncAutomatica } from "./src/lib/fin/runtime";
import { diaCerrado } from "./src/lib/fin/bloqueo";
import type { Mov } from "./src/lib/fin/types";
import type { NuevoMov } from "./src/lib/fin/store";
import { today } from "./src/lib/format";
import { Login } from "./src/screens/Login";
import { Inicio } from "./src/screens/Inicio";
import { Libro } from "./src/screens/Libro";
import { Libreta } from "./src/screens/Libreta";
import { Reportes } from "./src/screens/Reportes";
import { MovForm } from "./src/screens/MovForm";
import { Lote } from "./src/screens/Lote";
import { MenuDia } from "./src/screens/MenuDia";
import { aplicarGuardado } from "./src/screens/acciones";
import { TabBar, type Pestana, type FotoItem } from "./src/components/fin";
import { CuadreSheet, ReposicionSheet } from "./src/components/Sheets";
import { usePuerta } from "./src/components/Codigo";
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

/** Sesión, pestañas y avisos. Cada pestaña maneja sus propias pantallas. */
function Shell() {
  const insets = useSafeAreaInsets();
  const caja = useFin();
  const estado = useEstadoSync();
  const [listo, setListo] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState<Pestana>("inicio");
  const [flujo, setFlujo] = useState<Flujo>(null);
  const [hoja, setHoja] = useState<{ tipo: "cuadre" | "reposicion"; cuentaId: string } | null>(null);
  const puerta = usePuerta(insets.bottom);

  useEffect(() => {
    setUnauthorizedHandler(() => setSession(null));
    void Promise.all([store.init(), loadSession()]).then(([, s]) => {
      setSession(s);
      if (s) store.setUsuario(s.nombre || s.email);
      setListo(true);
    });
    return () => setUnauthorizedHandler(null);
  }, []);
  useSyncAutomatica(!!session);

  if (!listo) return null;
  const inset = { topInset: insets.top, bottomInset: insets.bottom };
  const cerrarFlujo = () => setFlujo(null);

  /** Editar o borrar un movimiento de un día cerrado pide el código; los de los últimos días son libres. */
  const abrirMov = (m: Mov) => puerta.pedir(diaCerrado(m.fecha, today()), () => setFlujo({ tipo: "mov", mov: m }), "Ese movimiento es de una fecha antigua: hace falta el código para corregirlo.");

  const guardarMov = (m: NuevoMov, fotos: FotoItem[], previo?: Mov) => {
    const hacer = () => (aplicarGuardado(m, fotos, previo), cerrarFlujo());
    puerta.pedir(diaCerrado(m.fecha, today()) || (!!previo && diaCerrado(previo.fecha, today())), hacer, "La fecha es antigua: hace falta el código para guardar este cambio.");
  };

  const cuentaHoja = hoja ? caja.cuentas.find((c) => c.id === hoja.cuentaId) : undefined;
  const enFlujo = flujo !== null;

  return (
    // En pantallas anchas (computadora) la app se queda en una columna angosta, centrada, como en el teléfono.
    <View style={{ flex: 1, width: "100%", maxWidth: 560, alignSelf: "center", backgroundColor: C.bg }}>
      {!session ? (
        <Login onLoggedIn={() => void loadSession().then((s) => (setSession(s), s && store.setUsuario(s.nombre || s.email), sync.sincronizar()))} {...inset} />
      ) : flujo?.tipo === "mov" ? (
        <MovForm
          key={flujo.mov?.id ?? "nuevo"} caja={caja} mov={flujo.mov} onClose={cerrarFlujo} {...inset}
          onGuardar={(m, fotos) => guardarMov(m, fotos, flujo.mov)}
          onEliminar={flujo.mov ? () => puerta.pedir(diaCerrado(flujo.mov!.fecha, today()), () => (store.borrarMov(flujo.mov!.id), cerrarFlujo()), "Ese movimiento es de una fecha antigua: hace falta el código para eliminarlo.") : undefined}
        />
      ) : flujo?.tipo === "lote" ? (
        <Lote caja={caja} onClose={cerrarFlujo} {...inset} />
      ) : flujo?.tipo === "menu" ? (
        <MenuDia caja={caja} onClose={cerrarFlujo} {...inset} />
      ) : (
        <>
          <View style={{ flex: 1 }}>
            {tab === "inicio" ? (
              <Inicio
                caja={caja} estado={estado} topInset={insets.top}
                onNuevo={() => setFlujo({ tipo: "mov" })} onLote={() => setFlujo({ tipo: "lote" })} onMenu={() => setFlujo({ tipo: "menu" })} onEditar={abrirMov}
                onCuadre={(c) => setHoja({ tipo: "cuadre", cuentaId: c.id })} onReposicion={(c) => setHoja({ tipo: "reposicion", cuentaId: c.id })}
              />
            ) : null}
            {tab === "libro" ? <Libro caja={caja} estado={estado} onEditar={abrirMov} topInset={insets.top} /> : null}
            {tab === "libreta" ? <Libreta caja={caja} estado={estado} {...inset} /> : null}
            {tab === "reportes" ? <Reportes caja={caja} estado={estado} session={session} onSalio={() => (setSession(null), setTab("inicio"))} {...inset} /> : null}
            {hoja?.tipo === "cuadre" && cuentaHoja ? <CuadreSheet caja={caja} cuenta={cuentaHoja} onClose={() => setHoja(null)} bottomInset={insets.bottom} /> : null}
            {hoja?.tipo === "reposicion" && cuentaHoja ? <ReposicionSheet caja={caja} cuenta={cuentaHoja} onClose={() => setHoja(null)} bottomInset={insets.bottom} /> : null}
          </View>
          {!enFlujo ? <TabBar activa={tab} onPick={setTab} bottomInset={insets.bottom} /> : null}
        </>
      )}
      {session ? puerta.modal : null}
      {session ? <Avisos avisos={caja.avisos} onCerrar={store.quitarAviso} topInset={insets.top} /> : null}
    </View>
  );
}

type Flujo = { tipo: "mov"; mov?: Mov } | { tipo: "lote" } | { tipo: "menu" } | null;

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
