# ICR (ERP, Logística y Finanzas) en el VPS (guía paso a paso)

Qué queda funcionando al terminar:

| Dirección | Qué es |
|---|---|
| `https://erp.TUDOMINIO` | **ICR ERP**: la app central (Inicio, Almacén, Configuración: usuarios, matriz de permisos, empresa, parámetros, integraciones y auditoría; el resto de módulos se agrega por fases). |
| `https://cotizador.TUDOMINIO` | **Logística** (antes Cotizador; PWA instalable en el celular). Varias personas, una sola base de datos. |
| `https://app.TUDOMINIO` | Vista general: cotizaciones, requerimientos y salidas de herramientas de todos, en tablas simples. También administra usuarios. |
| `https://api.TUDOMINIO` | La API sola (para el APK u otras apps que se hagan después). |
| `https://finanza.TUDOMINIO` | **Finanzas 2** (versión de prueba, base de datos propia). |
| `https://finanzas.TUDOMINIO` | **Finanzas**: caja diaria, caja chica, cierre del día y reportes. Varias personas a la vez, con su mismo usuario de la app. Sus datos también se ven en la pestaña **Finanzas** de `app.TUDOMINIO`. |

Todo corre en el mismo VPS con Docker: **PostgreSQL** (la base, una sola para todo), la **API** del cotizador, la **API de Finanzas** y **Caddy** (que pone el HTTPS solo).
La base de datos no se expone a internet: solo la API habla con ella.

---

## 1. DNS (en Hostinger → Dominios → DNS / Nameservers → Registros DNS)

Agrega registros **A**, todos con la IP del VPS (la ves en el panel del VPS):

| Tipo | Nombre | Apunta a |
|---|---|---|
| A | `cotizador` | IP del VPS |
| A | `app` | IP del VPS |
| A | `api` | IP del VPS |
| A | `finanzas` | IP del VPS |
| A | `finanza` | IP del VPS |
| A | `erp` | IP del VPS |

No borres ni cambies los registros que ya existan (sobre todo `@`, `www` y los de correo).
Tarda de unos minutos a unas horas. Revisa en https://dnschecker.org que `cotizador.TUDOMINIO` ya muestre la IP.

## 2. Preparar el VPS (una sola vez)

Entra por SSH (panel de Hostinger → VPS → Administrar → Terminal, o `ssh root@IP`).

```bash
# Actualizar
apt update && apt upgrade -y

# Firewall: solo SSH, web y web segura
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable

# Comprobar que Docker ya está (la plantilla con Docker de Hostinger lo trae)
docker --version && docker compose version
```

Si Docker no está: `curl -fsSL https://get.docker.com | sh`.

## 3. Subir el servidor

Opción A (con el zip `servidor_icr.zip`): súbelo al VPS (SFTP o el administrador de archivos de Hostinger) y:

```bash
mkdir -p /opt/icr && cd /opt/icr
unzip -o ~/servidor_icr.zip -d /opt/icr   # deja /opt/icr/servidor/... y /opt/icr/finanzas/... (una al lado de la otra)
cd /opt/icr/servidor
```

> **Importante:** las dos carpetas, `servidor` y `finanzas`, deben quedar una al lado de la otra: la API de Finanzas se construye desde `../finanzas`.
> Si ya tenías `servidor` funcionando, `unzip -o` solo reemplaza los archivos; tus claves (`.env`), la carpeta `web` y los respaldos no se tocan.

Opción B (desde GitHub): `git clone <url-del-repositorio> /opt/icr && cd /opt/icr/servidor`
(si el repositorio es privado, hay que crear un token de acceso en GitHub).

## 4. Configurar las claves

```bash
cp .env.example .env
nano .env        # completa DOMINIO, POSTGRES_PASSWORD, ADMIN_CLAVE, CLAVE_EDICION
chmod 600 .env
```

- `DOMINIO`: tu dominio sin `www` (por ejemplo `icrenergy.tech`).
- `POSTGRES_PASSWORD`: una clave larga y única (no la volverás a escribir en ningún lado).
- `ADMIN_CLAVE`: la clave del primer administrador (usuario `admin`).
- `CLAVE_EDICION`: la clave para editar documentos ya registrados (ahora es `1234`; mejor cámbiala luego desde la vista general).

**Guarda estas claves en un gestor de contraseñas compartido** (Bitwarden, etc.), no en una sola cabeza.

## 5. Arrancar

```bash
docker compose up -d --build
docker compose ps                 # los 4 servicios deben decir "running"/"healthy"
docker compose logs -f api        # debe decir "Datos iniciales cargados" y "escuchando en el puerto 3000"
docker compose logs finanzas-api  # debe decir "Migración aplicada: 001_caja.sql" (y 002) y "API de caja escuchando"
```

La primera vez la API crea las tablas y carga los 800 productos, las listas del checklist y las maletas.
Caddy pide solo los certificados HTTPS (necesita que el DNS ya apunte al VPS y que los puertos 80/443 estén abiertos).

## 6. Subir la app web

La app web se compila en GitHub (no en el VPS):

1. En GitHub → pestaña **Actions** → **Build web** → **Run workflow**.
2. Cuando termine, descarga el artefacto `cotizador-web` (un zip) y súbelo al VPS.
3. En el VPS:

```bash
cd /opt/icr/servidor
./scripts/actualizar_web.sh ~/cotizador-web.zip
```

(Si te pasaron el zip ya armado, es el mismo paso.) Para publicar una versión nueva en el futuro, repite estos 3 pasos;
la anterior queda en `web.anterior` por si hay que volver atrás.

## 6b. Subir la app de Finanzas

Igual que la app web, se compila en GitHub:

1. GitHub → **Actions** → **Build finanzas** → **Run workflow** (prueba la app y la API y arma la web).
2. Descarga el artefacto `finanzas-web` (un zip) y súbelo al VPS.
3. En el VPS:

```bash
cd /opt/icr/servidor
./scripts/actualizar_finanzas.sh ~/finanzas-web.zip
```

(Si te pasaron el zip ya armado, es el mismo paso.) Abre `https://finanzas.TUDOMINIO` e ingresa con un usuario que tenga acceso a caja chica en la matriz de permisos (por defecto **Contabilidad** o **Administrador**).
La API de Finanzas no necesita configuración extra: usa la misma base y los mismos usuarios.

## 7. Primer ingreso

1. Abre `https://app.TUDOMINIO` e ingresa con `admin` y tu `ADMIN_CLAVE`.
2. Crea a cada persona (en el ERP: `https://erp.TUDOMINIO` → **Configuración › Usuarios y roles**, o en la pestaña **Usuarios** de
   `app.TUDOMINIO`). Hay 4 roles, los mismos en el ERP, Logística y Finanzas:
   - **Administrador**: todo, incluido eliminar documentos, manejar usuarios y la matriz de permisos.
   - **Ventas**: cotiza, edita productos; en Logística pide materiales y confirma lo recibido.
   - **Contabilidad**: caja chica completa (registra, corrige días anteriores, cierra el día); ve cotizaciones.
   - **Técnico**: Logística completa (aprueba, alista, confirma salidas y devoluciones); sin acceso a caja chica.

   Qué puede hacer cada rol en cada módulo (ninguno / lectura / completo) se cambia en **ERP › Configuración › Matriz de permisos**
   (solo el administrador). El servidor lo comprueba en cada pedido; vale para el ERP, Logística, Finanzas 1 y Finanzas 2.
   En **caja chica**: *lectura* = ver la caja, alertas e historial; *completo* = además registrar, corregir días anteriores y cerrar.
   Reabrir un día cerrado y cambiar saldos iniciales: solo el administrador.

   Al actualizar, los usuarios que ya existían cambian solos de rol: admin → Administrador, vendedor → Ventas,
   finanzas → Contabilidad, y empleado/encargado/almacén → Técnico. Revisa la lista y ajusta lo que haga falta.
3. Cambia la clave del administrador (botón **Nueva clave**) y, si quieres, la **clave de edición**.
4. Cada persona abre `https://cotizador.TUDOMINIO` en su celular → menú del navegador → **Instalar app / Agregar a pantalla de inicio**.

## 7b. Cargar las hojas de caja de octubre (una sola vez)

Esto **BORRA toda la caja diaria y la caja chica que haya** (movimientos, fotos, historial de cambios y saldos iniciales) y carga las hojas de papel
transcritas (carpeta `BD_CajaDiario`: `datos.json` + `imagenes/recibos/`). Cada día queda con sus recibos adjuntos y cerrado.
**Primero haz un respaldo** (`./scripts/respaldo.sh`).

```bash
cd /opt/icr/servidor
unzip -o /root/importacion_octubre.zip -d /root/importacion      # deja /root/importacion/BD_CajaDiario
docker compose cp /root/importacion/BD_CajaDiario finanzas-api:/tmp/BD_CajaDiario

# 1) simulacro: muestra qué borraría y qué cargaría, sin cambiar nada
docker compose exec finanzas-api npx tsx scripts/importar_caja.ts /tmp/BD_CajaDiario
# 2) de verdad
docker compose exec finanzas-api npx tsx scripts/importar_caja.ts /tmp/BD_CajaDiario --confirmar
```

El simulacro debe mostrar 11 días, 40 movimientos y 7 fotos, con el saldo de cada día igual al de las hojas (el 27/10 queda en S/ 5.40).
Si algún saldo no coincide con el papel, el script se detiene y no cambia nada.

## 7c. Finanzas 2 (versión de prueba en `finanza.TUDOMINIO`)

Otra versión de Finanzas para comparar con la primera: libro único sobre cuentas (bancos y Yape), capturas, menús y reposición. Tiene **su propia base de datos
(`finanzas2`, se crea sola)**, sus propias fotos y su propio servicio (`finanzas2-api`); lo único compartido son los **usuarios** y las claves.
Finanzas 1 no se toca.

1. **DNS**: en Hostinger agrega un registro **A** con nombre `finanza` apuntando a la IP del VPS (igual que los otros).
2. Sube `servidor_icr.zip` y `finanzas2_web.zip` a `/root/` y:
   ```bash
   cd /opt/icr && unzip -o /root/servidor_icr.zip -d /opt/icr
   cd /opt/icr/servidor
   ./scripts/respaldo.sh                 # respaldo antes
   docker compose up -d --build
   docker compose logs finanzas2-api | tail -10    # debe decir "Base de datos creada", "Migración aplicada: 001_fin.sql" y "API de Finanzas 2 escuchando"
   ./scripts/actualizar_finanzas2.sh /root/finanzas2_web.zip
   ```
3. Abre `https://finanza.TUDOMINIO` (el certificado sale solo cuando el DNS ya apunta al VPS) y entra con un usuario con acceso a caja chica en la matriz de permisos
   (por defecto **Contabilidad** o **Administrador**).
4. **Primer uso**: Libreta › Cuentas: crear *Cta. cte. 2000*, *Cta. cte. 7074* (con sus últimos 4 dígitos), *Yape Diego* y *Yape Milagros* (titular, saldo inicial y umbral 40).
   Solo el **Administrador** crea o cambia cuentas. Luego Libreta › Personas.
5. **Telegram** (opcional): crea un bot con @BotFather y pon `TELEGRAM_BOT_TOKEN=…` en el `.env`; luego `docker compose up -d`.

El respaldo diario (`./scripts/respaldo.sh`) ya incluye la base `finanzas2` y sus fotos. Para descartar la prueba: `docker compose stop finanzas2-api` y, si quieres,
`docker compose exec db psql -U icr -d postgres -c "DROP DATABASE finanzas2"`.

## 7d. Relay (otro aplicativo en el mismo servidor)

El `Caddyfile` incluye al final los bloques de **Relay** (`atleta.` y `coach.adriancalderonbegazo.site` → contenedor `relay-web`). Como cada actualización
de icr reemplaza el Caddyfile del VPS por el de este proyecto, esos bloques **deben seguir en `servidor/Caddyfile`** en cada versión nueva; si se borran, Relay se cae.
El contenedor `relay-web` tiene que estar en la misma red de Docker que Caddy (si Relay no responde después de actualizar: `docker network ls` y comprobar
que `relay-web` y `icr-caddy-1` comparten una red, y `docker compose logs caddy`).

## 7e. ICR ERP (`erp.TUDOMINIO`)

La app central. Usa la **misma API, base de datos y usuarios** que Logística y Finanzas: no hay servicio nuevo, solo archivos (Caddy los sirve).

1. **DNS**: registro **A** con nombre `erp` apuntando a la IP del VPS.
2. Actualiza el servidor (trae el `Caddyfile` con `erp.` y la migración de roles) y publica el ERP:
   ```bash
   cd /opt/icr && unzip -o /root/servidor_icr.zip -d /opt/icr
   cd /opt/icr/servidor
   ./scripts/respaldo.sh                          # respaldo antes (cambia los roles)
   docker compose up -d --build
   docker compose logs api | tail -5              # debe decir "Migración aplicada: 002_erp_base.sql"
   ./scripts/actualizar_erp.sh /root/erp-web.zip
   docker compose restart caddy                   # para que tome el Caddyfile nuevo
   ```
3. Abre `https://erp.TUDOMINIO`, entra con `admin` y revisa **Configuración**: usuarios y sus roles, **Matriz de permisos**, **Datos de la empresa**
   (RUC, logo), **Parámetros** (tipo de cambio) e **Integraciones**.

El zip `erp-web.zip` sale del flujo **Build ERP** de GitHub (Actions → Build ERP → Run workflow → al terminar, descargar `erp-web`).

**Cada versión nueva del ERP** se sube igual: `servidor_icr.zip` (si cambió la API), `docker compose up -d --build`, y luego
`./scripts/actualizar_erp.sh` (y `actualizar_finanzas.sh` si cambió Finanzas). Las migraciones nuevas se aplican solas al arrancar cada API.
Con la Fase 2 (proyectos y contabilidad), lo primero en el ERP es **Contabilidad › Cuentas**: crear la cuenta principal y, si se sabe, su saldo inicial.
Con la Fase 3 (cotización), la cotización **sale de Logística**: hay que subir también la web de Logística nueva (`./scripts/actualizar_web.sh
/root/cotizador-web.zip`). En el ERP conviene revisar **Configuración › Parámetros** (tipo de cambio, para los productos en dólares) y
**Datos de la empresa** (cuentas bancarias que salen en el PDF). La Fase 4 (Inicio, campana y búsqueda) solo agrega la migración `005_notificaciones.sql`.
La Fase 5 (Facturación SUNAT) agrega `006_facturacion.sql`. Cada persona que factura instala la extensión una vez en su Chrome o Edge:
ERP › Facturación SUNAT › «Instalar extensión» (descarga un zip) → descomprimir → `chrome://extensions` → Modo de desarrollador → Cargar
descomprimida. Opcional: para que el RUC/DNI traiga solo la razón social, poner `CONSULTA_DOC_TOKEN=` en `.env` (token de decolecta.com u otro
proveedor; ver `.env.example`) y `docker compose up -d`.

## 7f. Inteligencia artificial (Cotizador IA y Asistente IA)

La IA corre en el mismo VPS, en el contenedor `ollama` (no se publica a internet). Se instala una vez:

```bash
cd /opt/icr/servidor
docker compose up -d --build          # crea el contenedor ollama (la primera vez descarga la imagen)
./scripts/instalar_ia.sh              # descarga qwen3:4b (~2.5 GB) y bge-m3 (~1.2 GB); tarda unos minutos
docker compose restart api            # la API indexa el catálogo en segundo plano (~1 minuto)
```

Luego, en el ERP: **Configuración › Inteligencia artificial** debe decir «En línea · qwen3:4b» y el índice con todos los productos. Sin GPU, cada
respuesta tarda de unos segundos a ~1 minuto (la primera del día más, porque carga el modelo). Para probar otro modelo:
`./scripts/instalar_ia.sh qwen3:8b` y escribirlo en esa misma pantalla.

## 7g. «Preguntar» en la app de Finanzas

Usa la misma IA del VPS (no se instala nada nuevo). Se publica subiendo el servidor (trae el Caddyfile con `/api/ia` en `finanzas.`) y la web
de Finanzas: `./scripts/actualizar_finanzas.sh /root/finanzas_web.zip` y `docker compose restart caddy`.

## 7h. Comparador de proveedores (Fase 8)

Se publica subiendo el servidor y el ERP como siempre (la migración `009_comparador.sql` se aplica sola al arrancar la API). Luego, en el ERP:
1. Comparador › **Proveedores** › «Nuevo proveedor» (Tienda Solar, Electronic Siblings, Dartel…).
2. Para Tienda Solar y Dartel: «+ Agregar página», pega la dirección de su tienda (por ejemplo `https://www.tienda.pe`), elige moneda y si
   los precios incluyen IGV, guarda y pulsa **Leer ahora**. Si sale «Error», el registro dice por qué (dirección mal escrita, la tienda no permite
   leerla, no muestra precios…). No hace falta abrir puertos ni instalar nada.
3. Para listas en archivo: **Cargar lista**, elige el proveedor, la fecha, si incluye IGV y el archivo (Excel, CSV o PDF).

## 8. Respaldos (importante)

```bash
cd /opt/icr/servidor
./scripts/respaldo.sh      # prueba: crea respaldos/cotizador_FECHA.sql.gz y las fotos
```

Cada respaldo tiene tres archivos: la **base** (`cotizador_*.sql.gz`, con todo: cotizaciones, almacén y finanzas), las **fotos de la app** (`fotos_*.tar.gz`) y las **fotos de recibos de Finanzas** (`fotos_finanzas_*.tar.gz`).
Las fotos no están dentro de la base, por eso van aparte. Si algo falla, el script termina con error y lo dice.
Para restaurar fotos: `./scripts/restaurar_fotos.sh respaldos/fotos_finanzas_FECHA.tar.gz finanzas` (o `api` para las de la app).

Prográmalo cada noche:

```bash
crontab -e
# agrega esta línea:
30 2 * * *  cd /opt/icr/servidor && ./scripts/respaldo.sh >> respaldos/respaldo.log 2>&1
```

Guarda 14 días en el mismo VPS. **No basta**: copia también a otro proveedor (Backblaze B2, Google Drive...):
instala `rclone`, corre `rclone config` una vez y define `RCLONE_DESTINO=nombre:carpeta` en el cron.
Una vez al mes **prueba restaurar** en otro lado (`./scripts/restaurar.sh archivo.sql.gz`).

## 9. Actualizar el servidor

```bash
cd /opt/icr/servidor
git pull                       # o sube los archivos nuevos
docker compose up -d --build   # reconstruye la API; las migraciones nuevas se aplican solas
```

## 10. Agregar tablas nuevas más adelante

Se crea un archivo en `db/migraciones/` (ver el `LEEME.md` de esa carpeta). No se toca `schema.sql`.
Las tablas de Finanzas viven en `finanzas/db/migrations/` y la API de Finanzas las aplica sola al arrancar.

## Problemas comunes

| Síntoma | Qué mirar |
|---|---|
| El navegador dice "no es seguro" / no hay HTTPS | `docker compose logs caddy`. Casi siempre es que el DNS todavía no apunta al VPS, o los puertos 80/443 están cerrados. |
| `cotizador.` muestra "404" o página en blanco | Falta subir la app web (paso 6). |
| `finanzas.` muestra "404" o página en blanco | Falta subir la app de Finanzas (paso 6b). |
| Finanzas dice "Sin acceso" | Esa cuenta tiene rol Empleado, Almacén o Vendedor. Un administrador le asigna el rol Finanzas o Encargado (Usuarios). |
| El saldo de caja no suma los Yape | Es a propósito: el saldo de la caja es solo **efectivo**, como en la planilla de papel. Los Yape/transferencias se ven aparte. |
| Finanzas dice "Sin conexión" | La app de Finanzas **solo funciona con internet** (varias personas comparten los datos). Nada se guarda sin conexión; al volver, se repite el registro. |
| `docker compose` falla con "../finanzas not found" | Falta la carpeta `finanzas` al lado de `servidor` (paso 3). |
| No me deja entrar | Revisa el usuario/clave. Tras 10 intentos fallidos se bloquea 15 minutos. Un administrador puede poner una clave nueva en la vista general. |
| "Otra persona modificó esto..." | Es normal: alguien más cambió el mismo documento. Se actualiza solo; revisa y repite el cambio. |
| Olvidé la clave del administrador | `./scripts/clave_usuario.sh admin` pone una clave nueva. Lo más fácil es tener **dos administradores** desde el inicio. |

## El ERP y las apps

El ERP (`erp.TUDOMINIO`) es una app web que habla con la misma API (`/api`): comparte usuarios, sesiones, roles y la matriz de permisos con
Logística y Finanzas. El plan por fases y las decisiones están en `erp/ESPECIFICACION.md`.

## APK conectado al servidor (opcional)

La app de celular también puede usar el servidor en vez de su base local:

```bash
flutter build apk --release --dart-define=API_URL=https://api.TUDOMINIO/api
```
