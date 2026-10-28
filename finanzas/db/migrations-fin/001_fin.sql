-- ICR Finanzas 2 · libro único de movimientos sobre varias cuentas (bancos, Yapes, efectivo)
-- Migración 002. PostgreSQL 13 o superior.
--
-- Es SOLO ADITIVA y no depende de la 001: crea tablas y una vista nuevas con el prefijo fin_ / v_fin_. NO toca las
-- tablas caja_* de ICR Finanzas 1, así las dos versiones pueden funcionar a la vez sobre la misma base mientras se
-- comparan. Es idempotente (IF NOT EXISTS / OR REPLACE) y transaccional.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/002_fin.sql
--
-- Para deshacerla: db/migrations/002_fin_down.sql (BORRA los datos de esta versión; haz un respaldo antes).

BEGIN;

-- Cuentas: un banco, un Yape o una caja de efectivo. Los Yape de Diego y Milagros son los fondos de gastos menores.
CREATE TABLE IF NOT EXISTS fin_cuenta (
  id               uuid PRIMARY KEY,
  nombre           text NOT NULL CHECK (btrim(nombre) <> ''),
  tipo             text NOT NULL CHECK (tipo IN ('BANCO', 'YAPE', 'EFECTIVO')),
  titular          text NOT NULL DEFAULT '',
  referencia       text NOT NULL DEFAULT '',          -- últimos 4 dígitos de la cuenta del banco
  saldo_inicial    numeric(14,2) NOT NULL DEFAULT 0,
  umbral           numeric(14,2) NOT NULL DEFAULT 0 CHECK (umbral >= 0),   -- bajo este saldo se pide reposición; 0 = sin aviso
  aviso_whatsapp   text NOT NULL DEFAULT '',          -- a quién se le pide la reposición
  aviso_telegram   text NOT NULL DEFAULT '',
  aviso_activo     boolean NOT NULL DEFAULT false,    -- ya se avisó y sigue bajo el umbral (evita avisar en cada movimiento)
  activa           boolean NOT NULL DEFAULT true,
  orden            int NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       text
);

-- Libreta: trabajadores, practicantes, proveedores. `alias` = nombres tal como salen en las capturas.
CREATE TABLE IF NOT EXISTS fin_persona (
  id          uuid PRIMARY KEY,
  nombre      text NOT NULL CHECK (btrim(nombre) <> ''),
  tipo        text NOT NULL CHECK (tipo IN ('OBRA', 'PRACTICANTE', 'PLANILLA', 'PROVEEDOR', 'OTRO')),
  alias       jsonb NOT NULL DEFAULT '[]',
  menu_monto  numeric(14,2) NOT NULL DEFAULT 0 CHECK (menu_monto >= 0),
  activa      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text
);

-- El libro. Ingreso y egreso afectan a `cuenta_id`; un traspaso mueve dinero de `cuenta_id` a `destino_id`
-- (y no es ingreso ni gasto: no cambia el total de la empresa).
CREATE TABLE IF NOT EXISTS fin_mov (
  id             uuid PRIMARY KEY,
  tipo           text NOT NULL CHECK (tipo IN ('INGRESO', 'EGRESO', 'TRASPASO')),
  fecha          date NOT NULL,
  hora           text NOT NULL DEFAULT '' CHECK (hora = '' OR hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  cuenta_id      uuid NOT NULL REFERENCES fin_cuenta (id),
  destino_id     uuid REFERENCES fin_cuenta (id),
  monto          numeric(14,2) NOT NULL CHECK (monto > 0),
  categoria      text NOT NULL DEFAULT '',
  subcategoria   text NOT NULL DEFAULT '',
  concepto       text NOT NULL DEFAULT '',
  pagado_a       text NOT NULL DEFAULT '',            -- como se leyó o escribió ("Aurea Val*")
  pagado_a_id    uuid,                                -- la persona de la libreta, si se reconoció (sin FK: la libreta puede llegar después)
  nro_operacion  text NOT NULL DEFAULT '',            -- número de la operación del banco/Yape
  origen         text NOT NULL DEFAULT 'MANUAL' CHECK (origen IN ('MANUAL', 'CAPTURA', 'MENU')),
  creado         timestamptz NOT NULL DEFAULT now(),  -- cuándo lo creó el cliente: desempata el orden
  created_by     text,
  updated_by     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,
  CHECK ((tipo = 'TRASPASO') = (destino_id IS NOT NULL)),
  CHECK (destino_id IS NULL OR destino_id <> cuenta_id)
);

-- Para quién fue un gasto (un menú de S/ 20 para dos = S/ 10 y S/ 10): sirve para saber cuánto se gasta en cada persona.
CREATE TABLE IF NOT EXISTS fin_mov_para (
  mov_id      uuid NOT NULL REFERENCES fin_mov (id) ON DELETE CASCADE,
  persona_id  uuid NOT NULL,
  monto       numeric(14,2) NOT NULL CHECK (monto > 0),
  PRIMARY KEY (mov_id, persona_id)
);

-- Fotos de comprobantes. Los bytes no van en la base: `archivo` es el nombre dentro del almacenamiento (volumen de Docker).
CREATE TABLE IF NOT EXISTS fin_adjunto (
  id          uuid PRIMARY KEY,
  mov_id      uuid NOT NULL REFERENCES fin_mov (id) ON DELETE CASCADE,
  archivo     text NOT NULL,
  mime        text NOT NULL,
  bytes       integer NOT NULL CHECK (bytes > 0),
  nombre      text,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Cuadre: el saldo real (el que muestra el Yape o el banco) contra el de la app. Se conserva el historial.
CREATE TABLE IF NOT EXISTS fin_cuadre (
  id             uuid PRIMARY KEY,
  cuenta_id      uuid NOT NULL REFERENCES fin_cuenta (id),
  fecha          date NOT NULL,
  saldo_real     numeric(14,2) NOT NULL,
  saldo_sistema  numeric(14,2) NOT NULL,
  diferencia     numeric(14,2) NOT NULL,
  nota           text NOT NULL DEFAULT '',
  created_by     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fin_mov_fecha_idx       ON fin_mov (fecha) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS fin_mov_cuenta_idx      ON fin_mov (cuenta_id, fecha) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS fin_mov_destino_idx     ON fin_mov (destino_id) WHERE destino_id IS NOT NULL AND deleted_at IS NULL;
-- La misma operación no se registra dos veces en la misma cuenta (los números de Yape y del banco son únicos por operación).
CREATE UNIQUE INDEX IF NOT EXISTS fin_mov_operacion_uk ON fin_mov (cuenta_id, nro_operacion) WHERE nro_operacion <> '' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS fin_adjunto_mov_idx     ON fin_adjunto (mov_id);
CREATE INDEX IF NOT EXISTS fin_cuadre_cuenta_idx   ON fin_cuadre (cuenta_id, created_at);

-- Saldo de cada cuenta = saldo inicial + ingresos − egresos − traspasos que salen + traspasos que llegan.
-- (La app calcula lo mismo en app2/src/lib/fin/calc.ts; una prueba comprueba que ambos dan igual.)
CREATE OR REPLACE VIEW v_fin_saldo AS
SELECT c.id AS cuenta_id,
       c.saldo_inicial + COALESCE(SUM(
         CASE
           WHEN m.tipo = 'INGRESO'  AND m.cuenta_id  = c.id THEN  m.monto
           WHEN m.tipo = 'EGRESO'   AND m.cuenta_id  = c.id THEN -m.monto
           WHEN m.tipo = 'TRASPASO' AND m.cuenta_id  = c.id THEN -m.monto
           WHEN m.tipo = 'TRASPASO' AND m.destino_id = c.id THEN  m.monto
           ELSE 0
         END), 0) AS saldo
FROM fin_cuenta c
LEFT JOIN fin_mov m ON m.deleted_at IS NULL AND (m.cuenta_id = c.id OR m.destino_id = c.id)
GROUP BY c.id, c.saldo_inicial;

COMMIT;
