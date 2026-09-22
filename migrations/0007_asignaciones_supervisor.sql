-- ============================================================================
-- 0007_asignaciones_supervisor.sql
-- Supervisor elige clientes por ruta (según comportamiento: nunca visitados o
-- muchas visitas sin pedido) y se los asigna a su asesor correspondiente.
-- El asesor ve la asignación en su app y reporta el resultado.
-- ============================================================================

CREATE TABLE IF NOT EXISTS asignaciones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id      UUID NOT NULL REFERENCES clientes(id),
  asesor_id       UUID NOT NULL REFERENCES asesores(id),
  asignado_por    UUID REFERENCES asesores(id),
  ruta            VARCHAR(20),
  motivo          VARCHAR(20),          -- 'sin_visitar' | 'sin_pedido' | 'depurar' | 'normal'
  estado          VARCHAR(20) NOT NULL DEFAULT 'pendiente',
                  -- 'pendiente' | 'en_gestion' | 'ubicado' | 'activado' | 'vendido' | 'depurado'
  nota            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asignaciones_asesor   ON asignaciones(asesor_id, estado);
CREATE INDEX IF NOT EXISTS idx_asignaciones_cliente   ON asignaciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_asignaciones_created   ON asignaciones(created_at DESC);
