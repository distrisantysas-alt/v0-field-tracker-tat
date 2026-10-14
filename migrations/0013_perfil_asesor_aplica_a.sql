-- ============================================================================
-- 0013_perfil_asesor_aplica_a.sql
-- Perfil del asesor (local / viajero) y a quien aplica cada regla de incentivo.
-- Solo AGREGA columnas con valor por defecto: los asesores existentes quedan
-- como 'local' y las reglas existentes como 'todos', asi nada cambia al migrar.
-- ============================================================================
ALTER TABLE asesores
  ADD COLUMN IF NOT EXISTS perfil varchar(10) NOT NULL DEFAULT 'local';
ALTER TABLE asesores
  DROP CONSTRAINT IF EXISTS asesores_perfil_check;
ALTER TABLE asesores
  ADD CONSTRAINT asesores_perfil_check CHECK (perfil IN ('local', 'viajero'));

ALTER TABLE incentivo_reglas
  ADD COLUMN IF NOT EXISTS aplica_a varchar(10) NOT NULL DEFAULT 'todos';
ALTER TABLE incentivo_reglas
  DROP CONSTRAINT IF EXISTS incentivo_reglas_aplica_a_check;
ALTER TABLE incentivo_reglas
  ADD CONSTRAINT incentivo_reglas_aplica_a_check CHECK (aplica_a IN ('todos', 'local', 'viajero'));
