# ICR Finanzas — Caja ICR

PWA de Inversiones ICR para llevar **una sola caja, la Caja ICR**, con **dos saldos**: **efectivo** y **digital** (Yape / transferencias).
No hay ciudades ni cierre del día: se registra durante todo el día. Es una app **en línea**: varias personas la usan a la vez sobre los mismos
datos, cada una con su propio usuario. Se instala en la pantalla de inicio, pero no guarda nada en el teléfono. Diseño ICR (Manrope · teal
#0E7490 · cyan #12A3B8 · navy #124C8C).

Se publica en `https://finanzas.TUDOMINIO`. La guía de despliegue es **[../servidor/DESPLIEGUE.md](../servidor/DESPLIEGUE.md)**.

```
app/              La PWA (Expo · React Native Web · TypeScript)
api/              API de Finanzas: ingreso (con la sesión de la API principal), permisos, proyectos e historial de la caja anterior
db/migrations/    Tablas de la caja anterior (caja diaria y caja chica): se conservan solo como historial
docs/API.md       Contrato de la API de la caja anterior
design/           Diseño original exportado de Claude Design
```

## Qué hace

- **Gasto físico** (sale del efectivo): categoría, descripción, monto, fecha, quién gastó, comprobante, proyecto y **foto del recibo**
  (se lee con OCR y rellena lo que falte).
- **Gasto digital** (sale del saldo digital): se eligen **varias capturas de Yape o del BCP a la vez**; la app lee monto, fecha, a quién se
  pagó, n.º de operación y mensaje, y cada una se revisa antes de registrarla. La captura queda como comprobante. Si el n.º de operación ya
  está registrado, se avisa y **no se duplica**.
- **Venta / ingreso**: en efectivo o digital.
- **Fondos desde el ERP**: Contabilidad envía dinero de la cuenta principal al efectivo o al digital de la caja (se ve al instante).
- **Depósito a cuenta principal** (categoría de egreso): el monto sale de la caja y entra a la cuenta principal del ERP en la misma
  operación. Si se anula en la app, se anula también en el ERP.
- **Historial** con filtros (período, ingreso/egreso, efectivo/digital, texto, anulados). Nada se borra: se **anula** con un motivo.
  Corregir queda en la auditoría con el antes y el después.
- **Preguntar** (IA de solo lectura, como en el ERP): las preguntas frecuentes se responden al instante sin IA.
- **Reportes** por período: efectivo y digital (inicio, entró, salió, final), ventas, fondos, gastos, depósitos, por categoría, persona y
  proyecto; **Excel**.
- **Permisos**: módulo «Finanzas (Caja ICR)» de la matriz del ERP (`caja_chica`): lectura = ver; completo = registrar, corregir y anular.

## Dónde vive cada cosa

- Los datos de la Caja ICR (`caja_icr_mov`, `caja_icr_adjunto`) y sus reglas están en la **API principal**:
  `servidor/api/src/cajaicr.js`, rutas `/api/caja-icr/*` (`rutas_f11.js`), migración `servidor/db/migraciones/011_caja_icr.sql`.
  La app las llama con el mismo token de su sesión (Caddy manda `finanzas.…/api/*` a la API principal).
- La API de Finanzas (`api/`, en `/api-caja`) se usa para ingresar, leer los permisos y los proyectos activos. Sus rutas de caja diaria y
  caja chica quedan solo para consultar el historial anterior (el ERP muestra esas fotos en los proyectos antiguos).

## Desarrollo

```bash
cd app && npm ci
npm run web                  # servidor de desarrollo
npm run typecheck && npm test
npm run build:web            # exporta la web y la convierte en PWA (dist/)

cd ../api && npm ci
npm run typecheck && npm test
```

## APK

No se usa: la app es una PWA.
