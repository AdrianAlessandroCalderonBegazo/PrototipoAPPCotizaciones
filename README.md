# Cotizador ICR (Flutter)

App móvil: checklist de productos por categoría para armar una cotización
y generar/compartir un PDF. Funciona **offline** desde el primer momento
(trae los 800 productos empaquetados) y tiene un botón para sincronizar
con tu servidor local cuando quieras actualizar el catálogo.

## Cómo funciona (arquitectura)

- **Primer arranque:** no hay red de por medio. La app lee
  `assets/productos_seed.json` (que ya trae tus 800 productos) y los
  guarda en una base SQLite dentro del celular.
- **Uso normal (armar checklist, generar PDF):** todo sale de esa base
  local. Cero llamadas a internet.
- **Botón "Sincronizar"** (ícono de refresh arriba a la derecha): se
  conecta una sola vez a tu servidor Node (el mismo del demo web) usando
  la IP local de tu PC, trae el catálogo actualizado completo, y
  reemplaza lo que había en la base local.
- **Fase 2 (base de datos externa):** el único archivo que cambiaría es
  `lib/services/api_service.dart` — ahí es donde vive la URL a la que se
  le pide la data. El resto de la app (pantallas, PDF, checklist) no se
  toca.

## 1. Requisitos

- Flutter SDK instalado (`flutter --version` debe funcionar)
- Un celular Android (o emulador) en la **misma red WiFi** que tu PC, si
  vas a usar la sincronización
- El servidor Node del demo web corriendo (`npm start` en la carpeta
  `demo-app`) — ya tiene los 2 ajustes que esto necesita: CORS habilitado
  y el endpoint `/api/productos/sync`

## 2. Crear el proyecto y copiar estos archivos

Este ZIP solo trae el código (`lib/`, `assets/`, `pubspec.yaml`) — le
faltan las carpetas nativas de Android/iOS, que Flutter genera solo.

```bash
flutter create cotizador_icr
cd cotizador_icr
```

Ahora **copia y reemplaza** dentro de esa carpeta recién creada:
- La carpeta `lib/` de este ZIP (reemplaza la que trae por defecto)
- La carpeta `assets/` de este ZIP (nueva, no existe por defecto)
- El archivo `pubspec.yaml` de este ZIP (reemplaza el que trae por defecto)

```bash
flutter pub get
```

## 3. Habilitar tráfico HTTP local en Android (paso obligatorio)

Tu servidor corre en `http://` (no `https://`). Android bloquea ese tipo
de tráfico por defecto desde Android 9. Abre:

```
android/app/src/main/AndroidManifest.xml
```

Y dentro de la etiqueta `<application ...>` agrega este atributo:

```xml
<application
    android:usesCleartextTraffic="true"
    ...>
```

(Esto es aceptable para este demo local. Si en el futuro el servidor
tiene HTTPS real, se puede quitar.)

## 4. Correr la app

```bash
flutter run
```

Elige tu celular conectado (o un emulador) cuando te lo pregunte.

## 5. Usarla

1. Abre la app — ya vas a ver las categorías con los 800 productos, sin
   tocar nada.
2. Entra a una categoría, marca los productos del checklist y ajusta
   cantidades con los botones + / -.
3. Toca el botón flotante "Cotización" para revisar lo seleccionado,
   pon el nombre del cliente si quieres, y dale a **Generar y compartir
   PDF** — se abre el menú nativo para compartir por WhatsApp, correo,
   guardar, etc.
4. Si necesitas traer productos nuevos que agregaste en tu base de datos
   después, toca el ícono de sincronizar (🔄) arriba, escribe la IP de tu
   PC (la ves con `ipconfig` en Windows) y el puerto (3000), y dale a
   Sincronizar ahora.

## Nota sobre la IP

La IP de tu PC en la red local puede cambiar (por ejemplo, si reinicias
el router). Si un día la sincronización deja de conectar, primero
revisa que la IP en la app siga siendo la misma que te da `ipconfig`.
