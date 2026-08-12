-- ============================================================================
-- 0001_editado_por.sql
-- Fase 1 — Autenticación real
-- Permite que un supervisor/gerencia corrija el registro de un asesor sin
-- perder trazabilidad de quién hizo el cambio realmente.
-- ============================================================================

ALTER TABLE visitas ADD COLUMN IF NOT EXISTS editado_por uuid NULL REFERENCES asesores(id);
ALTER TABLE visitas ADD COLUMN IF NOT EXISTS editado_en timestamptz NULL;
