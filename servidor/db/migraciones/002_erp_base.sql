-- ICR ERP · Fase 1: los 4 roles del ERP, la matriz de permisos por módulo, la auditoría y el último acceso.
--
-- Roles nuevos (el código interno de Administrador sigue siendo 'admin'):
--   admin → Administrador · vendedor → Ventas · finanzas → Contabilidad · encargado, almacen, empleado → Técnico

ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
UPDATE usuarios SET rol = CASE rol
  WHEN 'admin' THEN 'admin'
  WHEN 'vendedor' THEN 'ventas'
  WHEN 'finanzas' THEN 'contabilidad'
  WHEN 'ventas' THEN 'ventas'
  WHEN 'contabilidad' THEN 'contabilidad'
  ELSE 'tecnico' END;
ALTER TABLE usuarios ALTER COLUMN rol SET DEFAULT 'tecnico';
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK (rol IN ('admin', 'ventas', 'contabilidad', 'tecnico'));
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_acceso TIMESTAMP;

-- Matriz de permisos: qué nivel tiene cada rol en cada módulo. El administrador siempre tiene acceso completo
-- (no se guarda aquí). Los módulos y lo que permite cada nivel están en servidor/api/src/permisos.js.
CREATE TABLE IF NOT EXISTS rol_permisos (
  rol            VARCHAR(20) NOT NULL CHECK (rol IN ('ventas', 'contabilidad', 'tecnico')),
  modulo         VARCHAR(40) NOT NULL,
  nivel          VARCHAR(10) NOT NULL CHECK (nivel IN ('ninguno', 'lectura', 'completo')),
  actualizado_por VARCHAR(120),
  actualizado_en TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima'),
  PRIMARY KEY (rol, modulo)
);

INSERT INTO rol_permisos (rol, modulo, nivel) VALUES
  ('ventas', 'inicio', 'lectura'), ('ventas', 'proyectos', 'lectura'), ('ventas', 'almacen', 'lectura'), ('ventas', 'activos', 'lectura'),
  ('ventas', 'cotizacion', 'completo'), ('ventas', 'cotizador_ia', 'completo'), ('ventas', 'comparador', 'completo'),
  ('ventas', 'contabilidad', 'ninguno'), ('ventas', 'facturacion', 'completo'), ('ventas', 'asistente_ia', 'completo'),
  ('ventas', 'configuracion', 'ninguno'), ('ventas', 'logistica', 'lectura'), ('ventas', 'caja_chica', 'ninguno'),

  ('contabilidad', 'inicio', 'lectura'), ('contabilidad', 'proyectos', 'completo'), ('contabilidad', 'almacen', 'lectura'), ('contabilidad', 'activos', 'lectura'),
  ('contabilidad', 'cotizacion', 'lectura'), ('contabilidad', 'cotizador_ia', 'ninguno'), ('contabilidad', 'comparador', 'lectura'),
  ('contabilidad', 'contabilidad', 'completo'), ('contabilidad', 'facturacion', 'completo'), ('contabilidad', 'asistente_ia', 'completo'),
  ('contabilidad', 'configuracion', 'ninguno'), ('contabilidad', 'logistica', 'lectura'), ('contabilidad', 'caja_chica', 'completo'),

  ('tecnico', 'inicio', 'lectura'), ('tecnico', 'proyectos', 'lectura'), ('tecnico', 'almacen', 'lectura'), ('tecnico', 'activos', 'lectura'),
  ('tecnico', 'cotizacion', 'ninguno'), ('tecnico', 'cotizador_ia', 'ninguno'), ('tecnico', 'comparador', 'ninguno'),
  ('tecnico', 'contabilidad', 'ninguno'), ('tecnico', 'facturacion', 'ninguno'), ('tecnico', 'asistente_ia', 'ninguno'),
  ('tecnico', 'configuracion', 'ninguno'), ('tecnico', 'logistica', 'completo'), ('tecnico', 'caja_chica', 'ninguno')
ON CONFLICT (rol, modulo) DO NOTHING;

-- Auditoría del ERP: quién, qué, sobre qué, cómo estaba antes y cómo quedó. Solo se agrega; nunca se edita ni se borra.
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  fecha       TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima'),
  usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario     VARCHAR(120),
  rol         VARCHAR(20),
  accion      VARCHAR(40) NOT NULL,
  entidad     VARCHAR(40) NOT NULL,
  entidad_id  VARCHAR(60),
  antes       JSONB,
  despues     JSONB,
  detalle     TEXT,
  ip          VARCHAR(60)
);
CREATE INDEX IF NOT EXISTS idx_audit_fecha ON audit_log (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entidad ON audit_log (entidad, entidad_id);
