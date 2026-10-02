-- ============================================================================
-- 0009_devoluciones_pos.sql
-- Devoluciones (notas credito / anulaciones) que vienen del POS de facturacion,
-- que es independiente de esta app. Se cargan desde el CSV mensual del POS y
-- se usan para calcular la efectividad neta del bono:
--   (pedidos efectivos - devoluciones) / visitas
-- ============================================================================

CREATE TABLE IF NOT EXISTS devoluciones_pos (
  id_venta        TEXT PRIMARY KEY,            -- "ID de Venta" del POS: evita duplicar al recargar
  prefijo         TEXT,
  numero          TEXT,
  fecha           DATE NOT NULL,
  asesor_pos      TEXT,                        -- como viene en el POS (ultimo nombre tras "/")
  asesor_pos_norm TEXT,                        -- normalizado, para cruzar con asesor_alias
  asesor_id       UUID REFERENCES asesores(id),-- NULL = no se pudo asignar a un asesor de la app
  cliente         TEXT,
  nit             TEXT,
  valor           NUMERIC NOT NULL,            -- negativo, tal como viene del POS
  importado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  importado_por   UUID REFERENCES asesores(id)
);

CREATE INDEX IF NOT EXISTS idx_devoluciones_fecha  ON devoluciones_pos(fecha);
CREATE INDEX IF NOT EXISTS idx_devoluciones_asesor ON devoluciones_pos(asesor_id, fecha);

-- Traduce el nombre del vendedor en el POS al asesor de la app.
CREATE TABLE IF NOT EXISTS asesor_alias (
  alias_norm TEXT PRIMARY KEY,
  asesor_id  UUID NOT NULL REFERENCES asesores(id)
);

INSERT INTO asesor_alias (alias_norm, asesor_id) VALUES
  ('HAROL',               'e038a6c1-c47f-4a29-877c-d441e786bf28'),
  ('JENSI',               '925c78a8-3337-459c-b4c4-0850b1d846d3'),
  ('MAYRA ALFONSO',       'c6c40c90-88d8-4f45-b08a-836ec669d5c2'),
  ('SANTIAGO',            '2861edc5-ba8c-4168-b8e1-8a250c3858c9'),
  ('SANTIAGO GUTIERREZ',  '2861edc5-ba8c-4168-b8e1-8a250c3858c9'),
  ('GUSTAVO',             '193fdf99-07f8-4d90-93da-e43ffda7c3bf'),
  ('GUSTAVO SUAREZ',      '193fdf99-07f8-4d90-93da-e43ffda7c3bf'),
  ('JHOAN QUESADA',       'c0d4c755-2220-4576-a28d-cc203f69e92b'),
  ('ANTHONY',             'eff52abe-deae-428a-b91e-92f17e1cbcac'),
  ('ALEXANDER',           '0d6514a4-dabe-4670-a2c9-81354f00a9d4'),
  ('CODIGOS YONATAN',     '2701f92e-1e93-40f4-9c30-942801e210a3'),
  ('YONATAN CODIGOS',     '2701f92e-1e93-40f4-9c30-942801e210a3'),
  ('YONATAN',             '2701f92e-1e93-40f4-9c30-942801e210a3')
ON CONFLICT (alias_norm) DO NOTHING;
