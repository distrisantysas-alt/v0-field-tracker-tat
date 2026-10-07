// ============================================================================
// app/api/auth/login/route.ts
// Login por correo + clave. Compatible hacia atrás: un usuario SIN clave asignada
// sigue entrando solo con su correo hasta que el admin maestro le asigne una
// (o hasta que se defina REQUIRE_CLAVE=true en el entorno).
// ============================================================================
import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { crearTokenSesion, setSessionCookie } from '@/lib/auth';
import { verificarClave, MAX_INTENTOS, BLOQUEO_MINUTOS } from '@/lib/clave';

const MENSAJE_GENERICO = 'Correo o clave incorrectos';

export async function POST(req: NextRequest) {
  try {
    const { email, clave } = await req.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email requerido' }, { status: 400 });
    }

    const emailLimpio = email.trim().toLowerCase();

    // Si la migración 0011 aún no está aplicada, se usa el login anterior (solo correo).
    let result: any[];
    try {
      result = await sql`
        SELECT id, nombre, email, zona, activo, rol,
               clave_hash, clave_temporal, intentos_fallidos, bloqueado_hasta
        FROM asesores
        WHERE LOWER(email) = ${emailLimpio}
        LIMIT 1
      `;
    } catch (e: any) {
      if (!String(e?.message || '').includes('does not exist')) throw e;
      result = await sql`
        SELECT id, nombre, email, zona, activo, rol
        FROM asesores
        WHERE LOWER(email) = ${emailLimpio}
        LIMIT 1
      `;
    }

    if (result.length === 0) {
      return NextResponse.json({ error: MENSAJE_GENERICO }, { status: 401 });
    }

    const asesor = result[0];

    if (!asesor.activo) {
      return NextResponse.json(
        { error: 'Esta cuenta está inactiva. Contacta a tu administrador.' },
        { status: 403 }
      );
    }

    if (asesor.bloqueado_hasta && new Date(asesor.bloqueado_hasta).getTime() > Date.now()) {
      return NextResponse.json(
        { error: 'Cuenta bloqueada temporalmente por intentos fallidos. Inténtalo en unos minutos o pide ayuda al administrador.' },
        { status: 429 }
      );
    }

    if (asesor.clave_hash) {
      if (!clave || typeof clave !== 'string') {
        return NextResponse.json({ error: 'Ingresa tu clave', requiere_clave: true }, { status: 401 });
      }
      const ok = await verificarClave(clave, asesor.clave_hash);
      if (!ok) {
        const intentos = Number(asesor.intentos_fallidos || 0) + 1;
        if (intentos >= MAX_INTENTOS) {
          await sql`
            UPDATE asesores
            SET intentos_fallidos = 0,
                bloqueado_hasta = now() + make_interval(mins => ${BLOQUEO_MINUTOS}::int)
            WHERE id = ${asesor.id}
          `;
        } else {
          await sql`UPDATE asesores SET intentos_fallidos = ${intentos} WHERE id = ${asesor.id}`;
        }
        return NextResponse.json({ error: MENSAJE_GENERICO, requiere_clave: true }, { status: 401 });
      }
      if (Number(asesor.intentos_fallidos || 0) > 0 || asesor.bloqueado_hasta) {
        await sql`UPDATE asesores SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ${asesor.id}`;
      }
    } else if (process.env.REQUIRE_CLAVE === 'true') {
      return NextResponse.json(
        { error: 'Tu cuenta aún no tiene clave. Pídele al administrador que te la asigne.' },
        { status: 401 }
      );
    }

    const token = await crearTokenSesion({
      asesorId: asesor.id,
      rol:      asesor.rol,
      nombre:   asesor.nombre,
    });

    const response = NextResponse.json({
      success: true,
      asesor: {
        id:     asesor.id,
        nombre: asesor.nombre,
        email:  asesor.email,
        zona:   asesor.zona,
        rol:    asesor.rol,
      },
      clave_temporal: !!asesor.clave_temporal,
    });

    return setSessionCookie(response, token);

  } catch (error) {
    console.error('Error en login:', error);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
