-- ============================================================================
-- 0004_accuracy_velocidad.sql
-- Fase 4 — Señales de seguimiento para supervisores (informativo, no bloqueante)
-- ============================================================================

ALTER TABLE visitas ADD COLUMN IF NOT EXISTS accuracy_metros numeric NULL;
ALTER TABLE visitas ADD COLUMN IF NOT EXISTS velocidad_sospechosa boolean NOT NULL DEFAULT false;
