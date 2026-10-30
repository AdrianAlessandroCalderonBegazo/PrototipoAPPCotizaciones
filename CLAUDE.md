# ICR — guía del repositorio

Sistema de Inversiones ICR (Arequipa): **ICR ERP** (app central), **Logística** (antes Cotizador, Flutter) y **Finanzas** (caja diaria y caja chica),
todo sobre un solo Postgres en un VPS con Docker + Caddy (`icrenergy.tech`). Plan y decisiones del ERP: `erp/ESPECIFICACION.md`.
Se escribe y se responde en **español**, en lenguaje simple (el dueño del proyecto no es programador).

## Estructura

| Carpeta | Qué es | Stack |
|---|---|---|
| `servidor/api` | API principal compartida (login, sesiones, roles y matriz de permisos, catálogo, cotizaciones, requerimientos, herramientas, rutas del ERP) | Node 22, Express 5, JS ESM, `pg` |
| `servidor/db` | `schema.sql` (base inicial) + `migraciones/NNN_*.sql` (se aplican solas al arrancar la API, una vez y en orden) | Postgres 16 |
| `servidor/portal` | Vista general `app.` (HTML + JS sin compilar) | — |
| `servidor/Caddyfile`, `docker-compose.yml`, `scripts/`, `DESPLIEGUE.md` | Despliegue en el VPS | Docker, Caddy |
| `erp/web` | **ICR ERP** (`erp.`) | React 18 + TS + Vite + Tailwind 3, react-router 6 |
| `lib/`, `test/` | App **Logística** (`cotizador.` PWA y APK) | Flutter |
| `finanzas/api` | API de Finanzas 1 (`/api-caja`) y Finanzas 2 (`MODO=fin`, `/api-fin`, base `finanzas2`) | Node TS (tsx), servidor HTTP propio |
| `finanzas/app` | Finanzas 1 (`finanzas.`) | Expo / React Native Web |
| `finanzas/app2` | Finanzas 2, versión de prueba (`finanza.`) | Expo / React Native Web |
| `extension` | Extensión de Chrome «ICR Autollenado SUNAT» (rellena el portal SOL; el ERP la empaqueta en `/icr-autollenado-sunat.zip`) | Manifest V3, JS |

## Comandos

```bash
# API principal (pruebas contra un Postgres real; crea y borra su propia base)
cd servidor/api && npm ci && DATABASE_ADMIN_URL=postgres://postgres:postgres@localhost:5432/postgres npm test
# Levantarla en local
DATABASE_URL=postgres://postgres:postgres@localhost:5432/erp_demo ADMIN_USUARIO=admin ADMIN_CLAVE=… node src/index.js

# ERP web
cd erp/web && npm ci && npm run typecheck && npm test && npm run build   # dev: npm run dev (proxy /api → localhost:3000)

# Finanzas
cd finanzas/api && npm ci && npm run typecheck && npm test              # usa PGlite, no necesita Postgres
cd finanzas/app && npm ci && npm run typecheck && npm test
```

Builds para el VPS: GitHub Actions a mano (`Build ERP`, `Build web`, `Build finanzas`, `Build finanzas2`) → zip descargable → el usuario lo sube con
`scp` y corre `servidor/scripts/actualizar_*.sh`. **No lanzar `build_apk.yml`** (el usuario no quiere APK por ahora).

## Reglas y decisiones

- **Relay**: `servidor/Caddyfile` termina con los bloques `atleta.` y `coach.adriancalderonbegazo.site` (contenedor `relay-web`, otro proyecto del
  mismo VPS). **Nunca borrarlos**: cada despliegue reemplaza el Caddyfile del VPS por este.
- **Roles**: `admin`, `ventas`, `contabilidad`, `tecnico` (etiquetas: Administrador, Ventas, Contabilidad, Técnico). Iguales en todas las apps.
- **Permisos**: tabla `rol_permisos` (rol × módulo → `ninguno` | `lectura` | `completo`), editable solo por admin (ERP › Configuración).
  Se validan **en el servidor**: `exigirNivel` / `nivel()` en `servidor/api/src/permisos.js`; Finanzas lee el nivel de `caja_chica` con un JOIN en
  `finanzas/api/src/auth.ts` y decide en `finanzas/api/src/permisos.ts`. Módulos: `servidor/api/src/permisos.js › MODULOS` (si se agrega uno,
  agregarlo también en `erp/web/src/modulos.ts` y una migración con sus filas por defecto).
- **Auditoría**: todo cambio de dinero, estado, emisión, eliminación o configuración llama a `auditar(req, {...})` (`servidor/api/src/auditoria.js`).
- **Nunca inventar datos**: desconocido = `null` en la base y «Sin dato» en pantalla (`erp/web/src/formato.ts`).
- **Dinero**: `NUMERIC` + moneda; la API principal parsea `NUMERIC` como float (`db.js`), así que el código nuevo de dinero lee `::text` y calcula en céntimos
  (`servidor/api/src/dinero.js`; en pantalla `erp/web/src/dinero.ts`). Las fechas `DATE` también se leen como `::text`.
- **Caja chica**: `caja_chica_mov.tipo` = `EGRESO` (resta) | `TRANSFERENCIA` (desde caja diaria) | `FONDO` (desde la cuenta principal, lo crea el ERP).
  Las tablas de la caja son de Finanzas (`finanzas/db/migrations`); la API principal las lee si existen (`servidor/api/src/caja.js`).
- **Módulos del ERP construidos**: Inicio (con alertas, campana y búsqueda Ctrl+K), Almacén (consulta), Proyectos, Contabilidad, Cotización (catálogo,
  CSV, imágenes, kits, cotizaciones, PDF, WhatsApp), Facturación SUNAT, Configuración. Rutas: `servidor/api/src/rutas_erp.js` (fase 1), `rutas_f2.js` (proyectos,
  contabilidad, inicio/notificaciones/búsqueda) `rutas_f3.js` (catálogo, kits, cotizaciones) y `rutas_f5.js` (facturación). Pruebas: `servidor/api/test/erp.test.js`,
  `f2.test.js`, `f3.test.js`, `f4.test.js`, `f5.test.js` (aplican también las migraciones de Finanzas).
- **Cotización**: los precios del catálogo **incluyen IGV**; valor de venta = total ÷ 1.18. Misma cuenta en `servidor/api/src/cotizar.js` y
  `erp/web/src/paginas/cotizacion/calculo.ts`. Imágenes de productos: `assets/productos/` se copian al build del ERP (`scripts/copiar-imagenes.mjs`).
- **Facturación**: el ERP prepara, la extensión rellena SOL y la persona emite; **la extensión nunca pulsa «Emitir»** ni guarda la clave SOL. El número lo
  pone SUNAT (se registra al marcar emitido). Ítems con valor unitario **sin** IGV. Lo que depende del portal SOL está solo en `extension/selectores.js`.
- **Caja diaria ≠ cuenta principal**: la «Cta. cte.» de la caja diaria es Yape; los depósitos de efectivo al banco se registran en el ERP como ingreso
  «Depósito de caja diaria (efectivo)».
- **Fechas**: la base guarda hora de Lima sin zona (`now() AT TIME ZONE 'America/Lima'`).
- **Secretos** solo en `servidor/.env` del VPS (ver `.env.example`); nunca en el código, la base ni el chat. No pedir claves al usuario por chat.
- **Migraciones**: archivo nuevo en `servidor/db/migraciones/` (no tocar `schema.sql` salvo para instalaciones nuevas) o en `finanzas/db/migrations*/`.
- **Diseño del ERP**: tokens del sistema de diseño en `erp/web/src/index.css` (variables CSS, modo oscuro con `data-theme`), clases en
  `tailwind.config.js`. Respetar el diseño de `ERP_ICR.zip`; no cambiarlo sin consultar.
- **Fases**: el ERP se construye por fases (ver `erp/ESPECIFICACION.md`); al empezar cada una se presenta el plan y se espera aprobación.
  La cotización ya se quitó de Logística (Fase 3). Fase actual: 5 terminada (`FASE_ACTUAL` en `erp/web/src/modulos.ts`).
- Rama de trabajo: `claude/checklist-productos-apk-build-xruncz`.
