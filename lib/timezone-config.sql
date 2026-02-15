-- ============================================================
-- CONFIGURACIÓN DE ZONA HORARIA - PostgreSQL Neon
-- ============================================================
-- Configurar zona horaria de Colombia en todas las sesiones
-- Servidor: São Paulo (UTC-3)
-- Usuarios: Colombia (UTC-5)
-- ============================================================

-- Opción 1: Configurar para la sesión actual
SET timezone = 'America/Bogota';

-- Verificar zona horaria actual
SHOW timezone;
-- Debería mostrar: America/Bogota

-- Opción 2: Configurar a nivel de base de datos (requiere permisos de admin)
-- ALTER DATABASE your_database_name SET timezone TO 'America/Bogota';

-- ============================================================
-- FUNCIONES ÚTILES CON ZONA HORARIA
-- ============================================================

-- Función para obtener fecha actual en Colombia
CREATE OR REPLACE FUNCTION fecha_actual_colombia()
RETURNS DATE AS $$
BEGIN
  RETURN (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::DATE;
END;
$$ LANGUAGE plpgsql STABLE;

-- Función para obtener fecha y hora actual en Colombia
CREATE OR REPLACE FUNCTION timestamp_actual_colombia()
RETURNS TIMESTAMP AS $$
BEGIN
  RETURN CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota';
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- EJEMPLOS DE USO
-- ============================================================

-- Ver hora actual en diferentes zonas
SELECT 
  CURRENT_TIMESTAMP as servidor,
  CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota' as colombia,
  CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo' as sao_paulo;

-- Usar en queries
SELECT * FROM rutas_dia 
WHERE fecha = fecha_actual_colombia();

SELECT * FROM visitas 
WHERE DATE(timestamp AT TIME ZONE 'America/Bogota') = fecha_actual_colombia();

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

-- Test: ¿Qué día es hoy en Colombia?
SELECT fecha_actual_colombia() as hoy_colombia;

-- Test: ¿Qué hora es ahora en Colombia?
SELECT timestamp_actual_colombia() as ahora_colombia;

-- Test: Diferencia horaria
SELECT 
  EXTRACT(HOUR FROM (
    CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo' - 
    CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota'
  )) as diferencia_horas;
-- Debería retornar: 2 (São Paulo está 2 horas adelante)

-- ============================================================
-- IMPORTANTE PARA QUERIES
-- ============================================================

-- ❌ INCORRECTO (usa zona horaria del servidor):
SELECT * FROM visitas WHERE DATE(timestamp) = CURRENT_DATE;

-- ✅ CORRECTO (usa zona horaria de Colombia):
SELECT * FROM visitas 
WHERE DATE(timestamp AT TIME ZONE 'America/Bogota') = fecha_actual_colombia();

-- ❌ INCORRECTO:
INSERT INTO visitas (timestamp) VALUES (NOW());

-- ✅ CORRECTO:
INSERT INTO visitas (timestamp) VALUES (timestamp_actual_colombia());

-- ============================================================
-- NOTAS IMPORTANTES
-- ============================================================

/*
1. Neon PostgreSQL guarda timestamps en UTC internamente
2. AT TIME ZONE convierte a la zona especificada
3. Las funciones fecha_actual_colombia() y timestamp_actual_colombia() 
   garantizan consistencia en toda la aplicación
4. SIEMPRE usar estas funciones en queries que dependan de fecha/hora
5. El frontend también debe usar 'America/Bogota' en JavaScript
*/
