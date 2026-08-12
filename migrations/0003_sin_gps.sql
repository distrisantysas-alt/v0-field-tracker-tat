-- ============================================================================
-- 0003_sin_gps.sql
-- Fase 3 — Arreglar el flag sin_gps (bug real, no restricción nueva)
-- El frontend ya calculaba esto y lo metía como texto libre en notas; ahora
-- viaja estructurado y el backend por fin lo recibe y lo guarda.
-- ============================================================================

ALTER TABLE visitas ADD COLUMN IF NOT EXISTS sin_gps boolean NOT NULL DEFAULT false;
