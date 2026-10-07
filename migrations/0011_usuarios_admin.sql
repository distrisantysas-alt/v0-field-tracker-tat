-- ============================================================================
-- 0011_usuarios_admin.sql
-- Panel de usuarios: clave por usuario, un solo admin maestro y bitacora de cambios.
-- Solo AGREGA (columnas con valor por defecto, tablas nuevas): no cambia nada de lo
-- que ya funciona. Un usuario sin clave sigue entrando con su correo hasta que el
-- admin maestro le asigne una.
-- ============================================================================

ALTER TABLE asesores
  ADD COLUMN IF NOT EXISTS clave_hash text,
  ADD COLUMN IF NOT EXISTS clave_actualizada_en timestamptz,
  ADD COLUMN IF NOT EXISTS clave_temporal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS intentos_fallidos integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bloqueado_hasta timestamptz,
  ADD COLUMN IF NOT EXISTS es_admin_maestro boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telefono varchar(50);

-- Solo puede existir UN admin maestro
CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_maestro ON asesores ((true)) WHERE es_admin_maestro;

-- El admin maestro inicial es el (unico) usuario de gerencia activo mas antiguo
UPDATE asesores SET es_admin_maestro = true
WHERE id = (SELECT id FROM asesores WHERE rol = 'gerencia' AND activo ORDER BY created_at LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM asesores WHERE es_admin_maestro);

-- Traspaso atomico del rol de admin maestro: el anterior pasa a supervisor
CREATE OR REPLACE FUNCTION transferir_admin_maestro(nuevo uuid) RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM asesores WHERE id = nuevo AND activo AND NOT es_admin_maestro) THEN
    RETURN false;
  END IF;
  UPDATE asesores SET es_admin_maestro = false, rol = 'supervisor' WHERE es_admin_maestro;
  UPDATE asesores SET es_admin_maestro = true, rol = 'gerencia' WHERE id = nuevo;
  RETURN true;
END;
$$;

-- Bitacora de cambios administrativos (quien hizo que, sobre quien, cuando)
CREATE TABLE IF NOT EXISTS auditoria_admin (
  id           bigserial PRIMARY KEY,
  actor_id     uuid,
  actor_nombre text,
  accion       varchar(40) NOT NULL,
  objetivo_id  uuid,
  detalle      jsonb,
  creado_en    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auditoria_admin_fecha ON auditoria_admin (creado_en DESC);
