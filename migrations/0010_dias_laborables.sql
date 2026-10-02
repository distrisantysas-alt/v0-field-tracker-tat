-- ============================================================================
-- 0010_dias_laborables.sql
-- Dias laborables de cada asesor en un mes (no todos tienen los mismos: vacaciones,
-- incapacidades, ingreso a mitad de mes). El promedio de visitas por dia del bono
-- es: visitas del mes / dias laborables del asesor.
-- ============================================================================

CREATE TABLE IF NOT EXISTS dias_laborables (
  asesor_id      UUID NOT NULL REFERENCES asesores(id),
  mes            CHAR(7) NOT NULL,                       -- 'AAAA-MM'
  dias           INTEGER NOT NULL CHECK (dias BETWEEN 1 AND 31),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_por UUID REFERENCES asesores(id),
  PRIMARY KEY (asesor_id, mes)
);
