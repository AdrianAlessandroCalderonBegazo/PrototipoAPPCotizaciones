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

La app tiene tres pestañas abajo:

- **Cotización** (izquierda): los 800 productos del catálogo ("Todos" o
  por categoría). Marca productos, ajusta cantidades y toca **Generar
  cotización** para armar el PDF con el formato de Inversiones ICR. Arriba
  están la **cotización por voz** (micrófono), el **historial de
  cotizaciones** (reloj: buscar, ver detalle, compartir o eliminar) y
  **agregar producto** (+, con foto, precio, costo, unidad y referencia).
  Los productos agregados a mano se pueden editar o eliminar (⋮).
- **Inicio** (centro): lo que requiere atención — requerimientos urgentes o
  pendientes de aprobación, aprobados que falta entregar y herramientas por
  devolver — más accesos directos a Almacén y Cotización.
- **Almacén** (derecha):
  - **Requerimientos**: se crean con el checklist de siempre (categoría por
    categoría). Estados: *Pendiente aprobación* (llega una notificación al
    celular) → *Aprobado por jefe de obra* (pide el código **1234**) →
    *Entregado*. Cada uno tiene su PDF formal para ver o compartir.
  - **Checklist de herramientas**: se registra la salida (queda *Pendiente
    devolución*) y, cuando un encargado confirma que volvió todo, queda
    *Conforme*. También con su PDF.
  - Con el ícono de lista (arriba) se agregan ítems nuevos a la lista base
    de materiales o de herramientas.

Para traer productos nuevos de tu servidor: en Inicio toca el engranaje,
escribe la IP de tu PC (la ves con `ipconfig` en Windows) y el puerto
(3000), y dale a Sincronizar ahora.

## Nota sobre la IP

La IP de tu PC en la red local puede cambiar (por ejemplo, si reinicias
el router). Si un día la sincronización deja de conectar, primero
revisa que la IP en la app siga siendo la misma que te da `ipconfig`.
