-- ============================================================================
-- 0002_clientes_gps_historial.sql
-- Fase 2 — Trazabilidad en reubicación de clientes
-- No bloquea ni restringe el botón "Actualizar GPS" — solo deja rastro de
-- quién movió el punto, cuándo, desde dónde y por qué (motivo opcional).
-- ============================================================================

CREATE TABLE IF NOT EXISTS clientes_gps_historial (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id uuid NOT NULL REFERENCES clientes(id),
  asesor_id uuid NOT NULL REFERENCES asesores(id),
  lat_anterior numeric,
  lng_anterior numeric,
  lat_nueva numeric NOT NULL,
  lng_nueva numeric NOT NULL,
  distancia_movida_metros numeric,
  motivo varchar(50) NOT NULL DEFAULT 'no_especificado',
  timestamp timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gps_historial_distancia ON clientes_gps_historial(distancia_movida_metros DESC);
CREATE INDEX IF NOT EXISTS idx_gps_historial_asesor ON clientes_gps_historial(asesor_id);
CREATE INDEX IF NOT EXISTS idx_gps_historial_cliente ON clientes_gps_historial(cliente_id);
