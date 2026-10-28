import { useState } from "react";
import { Image, KeyboardAvoidingView, ScrollView, Text, View } from "react-native";
import { C, t } from "../theme";
import { ErrorText, PrimaryButton, Screen, TealGradient, TextField } from "../components/ui";
import { login } from "../lib/api";

/**
 * Puerta de entrada: cada persona entra con su propio usuario de la plataforma (el mismo del Cotizador y de
 * Finanzas 1). El servidor decide si su rol puede usar Finanzas.
 */
export function Login({ onLoggedIn, topInset, bottomInset }: { onLoggedIn: () => void; topInset: number; bottomInset: number }) {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!usuario.trim() || !password) {
      setError("Ingresa tu usuario y tu clave.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(usuario.trim(), password);
      onLoggedIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo iniciar sesión.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
        <TealGradient style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: 64 + topInset, paddingHorizontal: 28, paddingBottom: 24 + bottomInset }} keyboardShouldPersistTaps="handled">
            <View style={{ alignItems: "center", marginBottom: 36 }}>
              <Image source={require("../../assets/icon.png")} style={{ width: 64, height: 64, borderRadius: 18, marginBottom: 16 }} accessibilityLabel="ICR" />
              <Text style={t(22, 800, C.white)}>ICR Finanzas</Text>
              <Text style={t(12.5, 400, "rgba(255,255,255,.85)", { marginTop: 4, textAlign: "center" })}>Versión 2 · cuentas, capturas y menús</Text>
            </View>

            <View style={{ backgroundColor: C.card, borderRadius: 18, padding: 20, gap: 14 }}>
              <View>
                <Text style={t(10.5, 800, C.muted, { letterSpacing: 1, marginBottom: 8 })}>USUARIO</Text>
                <TextField value={usuario} onChangeText={setUsuario} placeholder="tu usuario" autoCapitalize="none" autoCorrect={false} />
              </View>
              <View>
                <Text style={t(10.5, 800, C.muted, { letterSpacing: 1, marginBottom: 8 })}>CLAVE</Text>
                <TextField value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry onSubmitEditing={submit} />
              </View>
              <ErrorText>{error}</ErrorText>
              <PrimaryButton label={busy ? "INGRESANDO…" : "INGRESAR"} onPress={submit} />
              <Text style={t(11, 400, C.muted, { lineHeight: 15, marginTop: 4 })}>
                Usa el mismo usuario y clave que en la app de Inversiones ICR. Tu rol decide si puedes entrar a Finanzas.
              </Text>
            </View>
          </ScrollView>
        </TealGradient>
      </KeyboardAvoidingView>
    </Screen>
  );
}
