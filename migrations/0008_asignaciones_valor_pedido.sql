-- ============================================================================
-- 0008_asignaciones_valor_pedido.sql
-- Cuando el asesor marca "Vendido" en una asignación del supervisor, debe
-- poder anotar el valor del pedido — igual que en la gestión habitual
-- (checkin). Guardamos aquí una copia del valor para que el supervisor lo
-- vea de un vistazo en el historial, además de quedar la visita real en
-- la tabla `visitas` (ver visita_id).
-- ============================================================================

ALTER TABLE asignaciones ADD COLUMN IF NOT EXISTS valor_pedido NUMERIC;
ALTER TABLE asignaciones ADD COLUMN IF NOT EXISTS visita_id UUID REFERENCES visitas(id);
