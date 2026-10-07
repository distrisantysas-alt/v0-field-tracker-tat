-- ============================================================================
-- 0012_metas_incentivos.sql
-- Presupuestos por asesor y mes, e incentivos configurables por el admin maestro.
-- Solo AGREGA tablas nuevas: no cambia nada de lo que ya funciona.
--   presupuestos       meta de venta por asesor y mes
--   incentivo_reglas   reglas de pago (escala de niveles o pago por unidad)
--   incentivo_cierres  mes cerrado: congela resultados para que sean auditables
--   incentivo_resultados  resultado congelado por regla, asesor y mes
-- Los dias laborables siguen en dias_laborables (migracion 0010).
-- ============================================================================

CREATE TABLE IF NOT EXISTS presupuestos (
  asesor_id       uuid NOT NULL REFERENCES asesores(id),
  mes             char(7) NOT NULL,                       -- 'AAAA-MM'
  monto           numeric(14,2) NOT NULL CHECK (monto >= 0),
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  actualizado_por uuid REFERENCES asesores(id),
  PRIMARY KEY (asesor_id, mes)
);

CREATE TABLE IF NOT EXISTS incentivo_reglas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre         varchar(100) NOT NULL,
  plantilla      varchar(30) NOT NULL DEFAULT 'personalizada',
  modo           varchar(12) NOT NULL CHECK (modo IN ('escala', 'por_unidad')),
  -- escala:     {"niveles":[{"nombre":"Nivel 1","condiciones":[{"metrica":"visitas_dia","op":">=","valor":40}],"monto":120000}]}
  -- por_unidad: {"metrica":"activaciones","monto_unidad":15000,"minimo":0,"tope":null}
  definicion     jsonb NOT NULL,
  activa         boolean NOT NULL DEFAULT true,
  vigente_desde  date NOT NULL DEFAULT current_date,
  vigente_hasta  date,
  creado_por     uuid REFERENCES asesores(id),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS incentivo_cierres (
  mes        char(7) PRIMARY KEY,
  cerrado_por uuid REFERENCES asesores(id),
  cerrado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS incentivo_resultados (
  mes        char(7) NOT NULL REFERENCES incentivo_cierres(mes) ON DELETE CASCADE,
  regla_id   uuid NOT NULL,
  regla      jsonb NOT NULL,          -- copia de la regla tal como estaba al cerrar
  asesor_id  uuid NOT NULL,
  metricas   jsonb NOT NULL,          -- valores del asesor al cerrar
  nivel      text,
  monto      numeric(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (mes, regla_id, asesor_id)
);
CREATE INDEX IF NOT EXISTS idx_incentivo_resultados_asesor ON incentivo_resultados (asesor_id, mes);
