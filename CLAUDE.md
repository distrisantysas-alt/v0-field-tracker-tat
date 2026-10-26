# Memoria del proyecto — Field Tracker DISTRISANTY

> Claude Code lee este archivo al abrir el proyecto. Léelo completo antes de cambiar código, tocar la base de datos o armar un informe. Responde siempre en **español**. No pongas credenciales en archivos, commits ni chats.

## 1. Qué es
Aplicación web (PWA) para el seguimiento de asesores comerciales en ruta de DISTRISANTY S.A.S. (distribución de consumo masivo, Floridablanca, Santander). Cada asesor registra visitas a clientes con GPS y pedidos; el supervisor y la gerencia ven rutas, informes, metas e incentivos.

- **Stack:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind + shadcn/ui, base de datos **Neon (PostgreSQL)** con `@neondatabase/serverless`, sesión con **JWT (jose)** en cookie, fotos en **Cloudinary**, despliegue en **Vercel**. Gestor de paquetes: `pnpm`.
- **Pruebas:** `vitest` en `lib/__tests__/` (incentivos, festivos). Correr con `npx vitest run`.
- **Zona horaria de negocio:** `America/Bogota`. Toda fecha "del día" se calcula con `(timestamp AT TIME ZONE 'America/Bogota')::date`.

## 2. Cómo correrlo
Variables de entorno (solo los **nombres**; los valores están en Vercel/Neon, nunca en el repo):
`DATABASE_URL`, `JWT_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `REQUIRE_CLAVE` (opcional, `true` exige clave a todos).

```
pnpm install
pnpm dev        # desarrollo
pnpm build      # compilación
npx vitest run  # pruebas
```
Si Vercel está conectado a `main`, cada `push` despliega automáticamente (verificar en el panel de Vercel).

## 3. Roles
| Rol | Pantalla | Qué hace |
|---|---|---|
| `asesor` | `components/asesor/*` | Su ruta del día, visitas, pedidos, mapa, asignaciones y estadísticas propias |
| `supervisor` | `components/supervisor/*` | Rutas, reasignar rutas, mapa de asesores, periodo, seguimiento |
| `gerencia` | `components/gerencia/*` | Informes, metas, incentivos, usuarios |
| `entregador` | `components/entregador/*` | Pedidos del día a entregar |

- **Admin maestro** (`es_admin_maestro = true`, rol gerencia, solo uno): crea usuarios, edita metas e incentivos, cierra meses. Ver `lib/admin-auth.ts`.
- Ingreso con correo; si el usuario tiene clave (scrypt, `lib/clave.ts`) también se exige. La autorización real vive en cada API (`requireSesion` de `lib/auth.ts`); `middleware.ts` solo protege `/admin/*`.
- El `asesor_id` sale **siempre** de la cookie firmada, nunca del body.

## 4. Mapa del código
- `app/page.tsx` — login y selección de layout por rol.
- `app/api/*` — APIs. `app/api/admin/*` son de supervisor/gerencia. Rutas clave: `checkin` (visitas), `clientes-del-dia`, `clientes`, `asignaciones`, `resumen-dia`, `admin/informes`, `admin/metas`, `admin/incentivos`, `admin/devoluciones`, `admin/reasignar-ruta`, `admin/usuarios`.
- `lib/db.ts` — conexión Neon, tipos y **cola offline en IndexedDB** (visitas y GPS pendientes de sincronizar).
- `lib/incentivos.ts` (reglas, funciones puras) y `lib/metricas.ts` (métricas del mes por asesor).
- `lib/festivos.ts` — festivos de Colombia y días laborables. `lib/rutas.ts` — regla de ruta. `lib/pos-devoluciones.ts` — lectura del CSV del POS.
- `migrations/` — SQL numerado `0000` a `0013`. **Se ejecutan a mano en el SQL Editor de Neon, en orden**; no hay migrador automático. Al agregar una, usa el siguiente número, que sea idempotente (`IF NOT EXISTS`) y avisa que debe ejecutarse antes de desplegar.
- `public/sw.js` — service worker (PWA offline).

## 5. Reglas de negocio importantes
1. **La ruta de un cliente es el número con que empieza su nombre** (`"37 MARTHA RAMIRES"` → ruta `37`; `"6B ..."` → `6B`). Ver `lib/rutas.ts`. Un cliente sin número queda en `SIN-RUTA`.
2. **Las visitas pertenecen al cliente, no al asesor.** Cuando un cliente cambia de asesor, su historial se conserva. El historial reciente (últimas 5 gestiones) muestra quién la hizo y su nota. La lista del día marca un cliente como visitado si **cualquier** asesor lo visitó ese día.
3. **Estadísticas, metas e incentivos son por quien hizo la gestión** (`visitas.asesor_id`), no por el dueño actual del cliente.
4. **Perfil del asesor** (`asesores.perfil`): en la app solo existen `local` y `viajero` (CHECK en la migración 0013). Las reglas de incentivo tienen `aplica_a` (`todos`, `local`, `viajero`). **"Mixto" (Gustavo: rutas locales y viajeras) es una categoría de gestión que aún NO existe en la app**; agregarla requiere migración y cambios en `lib/incentivos.ts`, el selector de Usuarios y el editor de reglas.
5. **Fórmulas**
   - Pedido = visita con `hubo_pedido = true`.
   - **Efectividad neta = (pedidos − devoluciones) ÷ visitas.** Bruta = pedidos ÷ visitas.
   - **Pedidos netos por día** = (pedidos − devoluciones) ÷ días laborables.
   - Días laborables = lunes a sábado sin festivos (octubre 2026: 26). Cada asesor puede tener sus días en `dias_laborables`.
   - Si falta un dato (devoluciones sin cargar, presupuesto sin cargar) la métrica queda **sin dato**, no en cero.
6. **Devoluciones** = notas crédito (prefijo `NC`) + ventas con total negativo del POS. Se cargan desde el CSV del POS (`admin/devoluciones`), sin duplicar (clave: `ID de Venta`).
7. **Meses cerrados** guardan una copia congelada de reglas y resultados; no se modifican (se reabren con bitácora).
8. **Planear mi ruta** (`components/asesor/planear-ruta.tsx`, `lib/planeador.ts`): en Mi Ruta, el asesor ordena los clientes que le faltan hoy para recorrer menos kilómetros (vecino más cercano + 2-opt, distancia en línea recta × 1,3, sin servicios de mapas; calcula en el celular). Muestra km y tiempo aproximado, enlaces a Waze/Google Maps y guarda el orden con `PUT /api/clientes-del-dia`, que escribe `rutas_dia.orden` (crea la fila de `rutas_dia` del día si no existía). Efecto a tener en cuenta: `dashboard` y `equipo-estado` usan `rutas_dia` como "clientes del día"; un asesor que planea pasa a tener cumplimiento calculado sobre los clientes planeados. Los clientes con orden planeado salen primero en la lista; el resto, detrás por nombre.

## 6. Metas operativas vigentes (octubre 2026)
Definidas por la gerencia; son criterio de gestión, no del código:

| Perfil | Visitas por día | Pedidos netos por día |
|---|---|---|
| Local | 40 a 45 | 20 a 22 |
| Mixto (Gustavo) — solo en informes, no existe en la app | 30 a 35 | 18 a 21 |
| Viajero (Jhoan, Anthony) | 30 | 18 |

- Efectividad de referencia: **más de 45%**.
- En los informes: se marca **"app incompleta"** al asesor cuyos pedidos registrados en la app sean **menos del 90%** de los facturados en el POS; la efectividad solo se evalúa si hace **al menos 70% de su meta de visitas** (una efectividad alta con pocas visitas no es buen resultado).
- Asesores de ruta activos a octubre 2026: Jensi, Santiago Gutiérrez, Mayra Alfonso, Sandra, María José, Juan David, Lizeth, Jhoan Quesada (viajero), Anthony (viajero), Gustavo (mixto). Verifica en `asesores` antes de asumir.

## 7. Cómo se arman los informes
**Visitas por asesor (Neon):**
```sql
SELECT a.nombre AS asesor, a.perfil, COUNT(*) AS visitas,
       COUNT(*) FILTER (WHERE v.hubo_pedido) AS pedidos_app,
       COUNT(DISTINCT (v.timestamp AT TIME ZONE 'America/Bogota')::date) AS dias_con_visitas
FROM visitas v JOIN asesores a ON a.id = v.asesor_id
WHERE (v.timestamp AT TIME ZONE 'America/Bogota')::date BETWEEN :desde AND :hasta
GROUP BY a.nombre, a.perfil ORDER BY a.nombre;
```
Para el detalle por día, agrupa también por `(v.timestamp AT TIME ZONE 'America/Bogota')::date`. Solo consultas de lectura.

**Ventas y devoluciones (CSV exportado del POS):** separador `;`, codificación UTF-8 con BOM, una fila por **producto**.
- Deduplicar por factura: `Prefijo` + `Numero de factura` + `ID de Venta`; el total de la factura es la columna `Totales.1`.
- Pedido = factura con total positivo y prefijo distinto de `NC` (`FE`, `POS`). Devolución = prefijo `NC` o total negativo.
- Los importes vienen con formato colombiano (`$1.234.567,89`) y a veces `&#8209;` en lugar del signo menos.
- Columna `Vendido por`: `FACTURADOR/ASESOR` o solo `ASESOR`; el asesor es el **último segmento**. Hay alias entre POS y app (p. ej. `SANDRA`↔`SANDRA MALDONADO`, `ANTHONY`↔`ANTHONY O.`, `YONATAN CODIGOS`↔`YONATAN ARISTIZABAL`, `LIZETH`↔`LIZETH 2`). Confirma los nombres con la gerencia.
- Cruza ventas del POS con visitas de la app por asesor. Mide **calidad del registro**: pedidos de la app ÷ pedidos facturados.

**Presentaciones:** se generan en PowerPoint (`.pptx`). Estructura usada: resumen, metas por perfil, visitas por día, pedidos netos por día, efectividad, avance del mes, devoluciones, venta neta, registro en la app, ritmo para los días restantes y compromisos. Lenguaje claro para asesores y gerencia; usa "Local" (no "Ruta") para el perfil.

## 8. Problemas conocidos y pendientes
- **Duplicados eliminados pierden su historial:** al eliminar un cliente duplicado (`api/clientes/eliminar`) el cliente queda inactivo con sus visitas y el activo no las hereda. Idea: pasar las visitas al cliente que se conserva.
- **Crear cliente exige internet:** si falla la conexión, no se guarda (a diferencia de las visitas, que van a la cola offline). Y el campo "Ruta" es opcional: un cliente sin ruta queda como `SIN-RUTA`. Idea: volver obligatoria la ruta y guardar offline.
- **Importar CSV de clientes** (`admin/import-csv`) vuelve a escribir `asesor_id` de clientes existentes y puede revertir una reasignación. Idea: no tocar `asesor_id` si el cliente ya existe.
- **Caracteres dañados** en nombres importados (`MARÃA`, `JOSï¿½`): problema de codificación al importar.
- **`clientes_eliminados`** guarda `asesor_id` pero no `asesor_nombre`; se obtiene uniendo con `asesores`.
- **"Mis estadísticas" con filtro "Todo":** el formato de fecha probablemente falle ("Invalid Date"); verificar.
- **Informe por ruta y día** (quién visitó la ruta X el día Y) aún no existe en la app.
- **Perfiles en la app:** deben estar bien marcados (Jhoan y Anthony `viajero`); por defecto todos quedan `local`. Falta soportar el perfil `mixto` (Gustavo).
- **Asesores con app incompleta** (a octubre 2026: Lizeth, Jhoan, Santiago, Anthony): es un tema de gestión, no del código.

## 9. Cómo trabajar aquí
- Antes de cambiar una consulta SQL, pruébala (idealmente en una base local) y revisa que no rompa los `UNION` de `clientes-del-dia`.
- No ejecutes escrituras ni migraciones en producción sin confirmación expresa de la gerencia.
- Mantén los comentarios y textos de la interfaz en español, con el estilo del código vecino.
- Un cambio = un commit claro. Verifica con `npx vitest run` y `pnpm build` antes de subir.
- Cuando algo no tenga dato, dilo; no inventes cifras.

## 10. Ejemplos de lo que se le puede pedir a Claude aquí
- "Arma el informe de eficiencia de octubre: te paso el CSV del POS y el resultado de visitas de Neon."
- "Agrega una pantalla de informe por ruta y día."
- "Haz que los duplicados eliminados pasen su historial al cliente que queda."
- "Vuelve obligatoria la ruta al crear un cliente nuevo."
- "Explícame cómo se calcula el incentivo de un asesor en este mes."
