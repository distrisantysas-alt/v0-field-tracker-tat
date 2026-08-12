-- ============================================================================
-- 0005_idx_visitas_cliente_asesor.sql
-- Fase 5 — Indicador de gestión + filtro de priorización
-- Cubre el filtro+orden que ya usa el LATERAL de "última visita con foto" en
-- /api/clientes-del-dia, y el nuevo LATERAL de "última gestión" (Fase 5).
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_visitas_cliente_asesor_ts ON visitas(cliente_id, asesor_id, timestamp DESC);
