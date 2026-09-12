-- ============================================================================
-- 0006_idx_visitas_asesor_fecha.sql
-- Histórico completo del asesor (Mis Estadísticas) — antes limitado a 7 días.
-- Sostiene el filtro por asesor_id + rango de fecha usado en /api/resumen-dia
-- cuando se consulta todo el histórico y no solo la última semana.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_visitas_asesor_ts ON visitas(asesor_id, timestamp DESC);
