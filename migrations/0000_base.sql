-- ============================================================================
-- 0000_base.sql
-- Esquema base de DS Route (estado a la migración 0010), exportado del catálogo de
-- producción SIN datos. Con esto una base vacía queda lista para correr la app:
--   node scripts/migrate.js
-- Las migraciones 0001 a 0010 ya están incluidas aquí; el runner las marca como aplicadas.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION public.fecha_actual_colombia()
 RETURNS date
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::DATE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.haversine_metros(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  R NUMERIC := 6371000; -- Radio de la Tierra en metros
  dLat NUMERIC;
  dLng NUMERIC;
  a NUMERIC;
  c NUMERIC;
BEGIN
  dLat := RADIANS(lat2 - lat1);
  dLng := RADIANS(lng2 - lng1);
  
  a := SIN(dLat/2) * SIN(dLat/2) +
       COS(RADIANS(lat1)) * COS(RADIANS(lat2)) *
       SIN(dLng/2) * SIN(dLng/2);
  
  c := 2 * ATAN2(SQRT(a), SQRT(1-a));
  
  RETURN R * c;
END;
$function$;

CREATE OR REPLACE FUNCTION public.haversine_metros(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
 RETURNS double precision
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    R CONSTANT DOUBLE PRECISION := 6371000;
    dLat DOUBLE PRECISION;
    dLon DOUBLE PRECISION;
    a DOUBLE PRECISION;
    c DOUBLE PRECISION;
BEGIN
    dLat := radians(lat2 - lat1);
    dLon := radians(lon2 - lon1);
    a := sin(dLat/2) * sin(dLat/2) +
         cos(radians(lat1)) * cos(radians(lat2)) *
         sin(dLon/2) * sin(dLon/2);
    c := 2 * atan2(sqrt(a), sqrt(1-a));
    RETURN R * c;
END;
$function$;

CREATE SEQUENCE IF NOT EXISTS public.clientes_eliminados_id_seq;

CREATE TABLE IF NOT EXISTS public.asesor_alias (
  alias_norm text NOT NULL,
  asesor_id uuid NOT NULL,
  CONSTRAINT asesor_alias_pkey PRIMARY KEY (alias_norm)
);

CREATE TABLE IF NOT EXISTS public.asesor_clientes (
  asesor_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  CONSTRAINT asesor_clientes_unique UNIQUE (asesor_id, cliente_id),
  CONSTRAINT asesor_clientes_pkey PRIMARY KEY (asesor_id, cliente_id)
);

CREATE TABLE IF NOT EXISTS public.asesores (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  nombre character varying(100) NOT NULL,
  email character varying(150) NOT NULL,
  zona character varying(50),
  supervisor_id uuid,
  rol character varying(20) DEFAULT 'asesor'::character varying,
  activo boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT asesores_email_key UNIQUE (email),
  CONSTRAINT asesores_pkey PRIMARY KEY (id),
  CONSTRAINT asesores_rol_check CHECK (((rol)::text = ANY (ARRAY['asesor'::text, 'supervisor'::text, 'gerencia'::text, 'entregador'::text])))
);

CREATE TABLE IF NOT EXISTS public.asignaciones (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  cliente_id uuid NOT NULL,
  asesor_id uuid NOT NULL,
  asignado_por uuid,
  ruta character varying(20),
  motivo character varying(20),
  estado character varying(20) DEFAULT 'pendiente'::character varying NOT NULL,
  nota text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  valor_pedido numeric,
  visita_id uuid,
  CONSTRAINT asignaciones_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.clientes (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  codigo character varying(20) NOT NULL,
  nombre character varying(150) NOT NULL,
  direccion text,
  lat numeric(10,7) NOT NULL,
  lng numeric(10,7) NOT NULL,
  asesor_id uuid,
  radio_metros integer DEFAULT 80,
  activo boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  telefono character varying(50),
  CONSTRAINT clientes_codigo_key UNIQUE (codigo),
  CONSTRAINT clientes_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.clientes_eliminados (
  id integer DEFAULT nextval('clientes_eliminados_id_seq'::regclass) NOT NULL,
  cliente_id text NOT NULL,
  asesor_id text NOT NULL,
  nombre_cliente text NOT NULL,
  codigo_cliente text,
  direccion text,
  telefono text,
  lat double precision,
  lng double precision,
  asesor_nombre text,
  motivo text DEFAULT 'Duplicado reportado por asesor'::text,
  total_visitas integer DEFAULT 0,
  total_pedidos integer DEFAULT 0,
  valor_acumulado numeric(12,2) DEFAULT 0,
  primera_visita timestamp with time zone,
  ultima_visita timestamp with time zone,
  eliminado_en timestamp with time zone DEFAULT now() NOT NULL,
  restaurado boolean DEFAULT false,
  restaurado_en timestamp with time zone,
  restaurado_por text,
  CONSTRAINT clientes_eliminados_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.clientes_gps_historial (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  cliente_id uuid NOT NULL,
  asesor_id uuid NOT NULL,
  lat_anterior numeric,
  lng_anterior numeric,
  lat_nueva numeric NOT NULL,
  lng_nueva numeric NOT NULL,
  distancia_movida_metros numeric,
  motivo character varying(50) DEFAULT 'no_especificado'::character varying NOT NULL,
  timestamp timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT clientes_gps_historial_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.devoluciones_pos (
  id_venta text NOT NULL,
  prefijo text,
  numero text,
  fecha date NOT NULL,
  asesor_pos text,
  asesor_pos_norm text,
  asesor_id uuid,
  cliente text,
  nit text,
  valor numeric NOT NULL,
  importado_en timestamp with time zone DEFAULT now() NOT NULL,
  importado_por uuid,
  CONSTRAINT devoluciones_pos_pkey PRIMARY KEY (id_venta)
);

CREATE TABLE IF NOT EXISTS public.dias_laborables (
  asesor_id uuid NOT NULL,
  mes character(7) NOT NULL,
  dias integer NOT NULL,
  actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
  actualizado_por uuid,
  CONSTRAINT dias_laborables_pkey PRIMARY KEY (asesor_id, mes),
  CONSTRAINT dias_laborables_dias_check CHECK (((dias >= 1) AND (dias <= 31)))
);

CREATE TABLE IF NOT EXISTS public.reportes_duplicado (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  cliente_id uuid NOT NULL,
  asesor_id uuid NOT NULL,
  nota text,
  estado text DEFAULT 'pendiente'::text NOT NULL,
  resuelto_en timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT reportes_duplicado_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.rutas_dia (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  asesor_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  fecha date NOT NULL,
  orden integer,
  completada boolean DEFAULT false,
  CONSTRAINT rutas_dia_asesor_id_cliente_id_fecha_key UNIQUE (asesor_id, cliente_id, fecha),
  CONSTRAINT rutas_dia_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.ubicaciones_asesores (
  asesor_id uuid NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  actualizado_en timestamp with time zone DEFAULT now(),
  CONSTRAINT ubicaciones_asesores_pkey PRIMARY KEY (asesor_id)
);

CREATE TABLE IF NOT EXISTS public.visitas (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  cliente_id uuid NOT NULL,
  asesor_id uuid NOT NULL,
  lat_capturada numeric(10,7) NOT NULL,
  lng_capturada numeric(10,7) NOT NULL,
  distancia_metros numeric(8,2),
  validada boolean,
  timestamp timestamp with time zone DEFAULT now(),
  notas text,
  pedido_generado boolean DEFAULT false,
  sync_pendiente boolean DEFAULT false,
  hubo_pedido boolean DEFAULT false,
  valor_pedido numeric(12,2) DEFAULT 0,
  offline_id character varying(50),
  synced boolean DEFAULT true,
  foto_url text,
  editado_por uuid,
  editado_en timestamp with time zone,
  sin_gps boolean DEFAULT false NOT NULL,
  accuracy_metros numeric,
  velocidad_sospechosa boolean DEFAULT false NOT NULL,
  CONSTRAINT visitas_offline_id_key UNIQUE (offline_id),
  CONSTRAINT visitas_offline_id_unique UNIQUE (offline_id),
  CONSTRAINT visitas_pkey PRIMARY KEY (id)
);

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='asesor_alias_asesor_id_fkey') THEN ALTER TABLE public.asesor_alias ADD CONSTRAINT asesor_alias_asesor_id_fkey FOREIGN KEY (asesor_id) REFERENCES asesores(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='asesor_clientes_asesor_id_fkey') THEN ALTER TABLE public.asesor_clientes ADD CONSTRAINT asesor_clientes_asesor_id_fkey FOREIGN KEY (asesor_id) REFERENCES asesores(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='asesor_clientes_cliente_id_fkey') THEN ALTER TABLE public.asesor_clientes ADD CONSTRAINT asesor_clientes_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='asesores_supervisor_id_fkey') THEN ALTER TABLE public.asesores ADD CONSTRAINT asesores_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES asesores(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='asignaciones_asesor_id_fkey') THEN ALTER TABLE public.asignaciones ADD CONSTRAINT asignaciones_asesor_id_fkey FOREIGN KEY (asesor_id) REFERENCES asesores(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='asignaciones_asignado_por_fkey') THEN ALTER TABLE public.asignaciones ADD CONSTRAINT asignaciones_asignado_por_fkey FOREIGN KEY (asignado_por) REFERENCES asesores(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='asignaciones_cliente_id_fkey') THEN ALTER TABLE public.asignaciones ADD CONSTRAINT asignaciones_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='asignaciones_visita_id_fkey') THEN ALTER TABLE public.asignaciones ADD CONSTRAINT asignaciones_visita_id_fkey FOREIGN KEY (visita_id) REFERENCES visitas(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='clientes_asesor_id_fkey') THEN ALTER TABLE public.clientes ADD CONSTRAINT clientes_asesor_id_fkey FOREIGN KEY (asesor_id) REFERENCES asesores(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='clientes_gps_historial_asesor_id_fkey') THEN ALTER TABLE public.clientes_gps_historial ADD CONSTRAINT clientes_gps_historial_asesor_id_fkey FOREIGN KEY (asesor_id) REFERENCES asesores(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='clientes_gps_historial_cliente_id_fkey') THEN ALTER TABLE public.clientes_gps_historial ADD CONSTRAINT clientes_gps_historial_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='devoluciones_pos_asesor_id_fkey') THEN ALTER TABLE public.devoluciones_pos ADD CONSTRAINT devoluciones_pos_asesor_id_fkey FOREIGN KEY (asesor_id) REFERENCES asesores(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='devoluciones_pos_importado_por_fkey') THEN ALTER TABLE public.devoluciones_pos ADD CONSTRAINT devoluciones_pos_importado_por_fkey FOREIGN KEY (importado_por) REFERENCES asesores(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='dias_laborables_actualizado_por_fkey') THEN ALTER TABLE public.dias_laborables ADD CONSTRAINT dias_laborables_actualizado_por_fkey FOREIGN KEY (actualizado_por) REFERENCES asesores(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='dias_laborables_asesor_id_fkey') THEN ALTER TABLE public.dias_laborables ADD CONSTRAINT dias_laborables_asesor_id_fkey FOREIGN KEY (asesor_id) REFERENCES asesores(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='reportes_duplicado_cliente_id_fkey') THEN ALTER TABLE public.reportes_duplicado ADD CONSTRAINT reportes_duplicado_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='rutas_dia_asesor_id_fkey') THEN ALTER TABLE public.rutas_dia ADD CONSTRAINT rutas_dia_asesor_id_fkey FOREIGN KEY (asesor_id) REFERENCES asesores(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='rutas_dia_cliente_id_fkey') THEN ALTER TABLE public.rutas_dia ADD CONSTRAINT rutas_dia_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ubicaciones_asesores_asesor_id_fkey') THEN ALTER TABLE public.ubicaciones_asesores ADD CONSTRAINT ubicaciones_asesores_asesor_id_fkey FOREIGN KEY (asesor_id) REFERENCES asesores(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='visitas_asesor_id_fkey') THEN ALTER TABLE public.visitas ADD CONSTRAINT visitas_asesor_id_fkey FOREIGN KEY (asesor_id) REFERENCES asesores(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='visitas_cliente_id_fkey') THEN ALTER TABLE public.visitas ADD CONSTRAINT visitas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='visitas_editado_por_fkey') THEN ALTER TABLE public.visitas ADD CONSTRAINT visitas_editado_por_fkey FOREIGN KEY (editado_por) REFERENCES asesores(id); END IF; END $$;

CREATE INDEX IF NOT EXISTS idx_asignaciones_asesor ON public.asignaciones USING btree (asesor_id, estado);
CREATE INDEX IF NOT EXISTS idx_asignaciones_cliente ON public.asignaciones USING btree (cliente_id);
CREATE INDEX IF NOT EXISTS idx_asignaciones_created ON public.asignaciones USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clientes_asesor_activo ON public.clientes USING btree (asesor_id, activo);
CREATE INDEX IF NOT EXISTS idx_clientes_codigo ON public.clientes USING btree (codigo);
CREATE INDEX IF NOT EXISTS idx_clientes_eliminados_asesor_id ON public.clientes_eliminados USING btree (asesor_id);
CREATE INDEX IF NOT EXISTS idx_clientes_eliminados_cliente_id ON public.clientes_eliminados USING btree (cliente_id);
CREATE INDEX IF NOT EXISTS idx_clientes_eliminados_eliminado_en ON public.clientes_eliminados USING btree (eliminado_en DESC);
CREATE INDEX IF NOT EXISTS idx_clientes_eliminados_restaurado ON public.clientes_eliminados USING btree (restaurado);
CREATE INDEX IF NOT EXISTS idx_gps_historial_asesor ON public.clientes_gps_historial USING btree (asesor_id);
CREATE INDEX IF NOT EXISTS idx_gps_historial_cliente ON public.clientes_gps_historial USING btree (cliente_id);
CREATE INDEX IF NOT EXISTS idx_gps_historial_distancia ON public.clientes_gps_historial USING btree (distancia_movida_metros DESC);
CREATE INDEX IF NOT EXISTS idx_devoluciones_asesor ON public.devoluciones_pos USING btree (asesor_id, fecha);
CREATE INDEX IF NOT EXISTS idx_devoluciones_fecha ON public.devoluciones_pos USING btree (fecha);
CREATE INDEX IF NOT EXISTS idx_rutas_asesor_fecha ON public.rutas_dia USING btree (asesor_id, fecha) WHERE (completada = false);
CREATE INDEX IF NOT EXISTS idx_rutas_cliente ON public.rutas_dia USING btree (cliente_id);
CREATE INDEX IF NOT EXISTS idx_visitas_asesor_fecha ON public.visitas USING btree (asesor_id, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_visitas_cliente_asesor_ts ON public.visitas USING btree (cliente_id, asesor_id, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_visitas_offline_id ON public.visitas USING btree (offline_id) WHERE (offline_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_visitas_timestamp ON public.visitas USING btree ("timestamp" DESC);

CREATE OR REPLACE VIEW public.v_auditoria_eliminados AS
SELECT id,
    (eliminado_en AT TIME ZONE 'America/Bogota'::text) AS eliminado_en,
    cliente_id,
    nombre_cliente,
    codigo_cliente,
    direccion,
    telefono,
    motivo,
    restaurado,
    (restaurado_en AT TIME ZONE 'America/Bogota'::text) AS restaurado_en,
    restaurado_por,
    asesor_id,
    asesor_nombre,
    total_visitas,
    total_pedidos,
    valor_acumulado,
    (primera_visita AT TIME ZONE 'America/Bogota'::text) AS primera_visita,
    (ultima_visita AT TIME ZONE 'America/Bogota'::text) AS ultima_visita,
    CURRENT_DATE - date((eliminado_en AT TIME ZONE 'America/Bogota'::text)) AS dias_eliminado
   FROM clientes_eliminados ce
  ORDER BY ce.eliminado_en DESC;
;
