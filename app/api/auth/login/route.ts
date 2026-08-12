// ============================================================================
// app/api/auth/login/route.ts
// ============================================================================
import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { crearTokenSesion, setSessionCookie } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email requerido' }, { status: 400 });
    }

    const emailLimpio = email.trim().toLowerCase();

    const result = await sql`
      SELECT id, nombre, email, zona, activo, rol
      FROM asesores
      WHERE LOWER(email) = ${emailLimpio}
      LIMIT 1
    `;

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'No se encontró un usuario con ese email' },
        { status: 401 }
      );
    }

    const asesor = result[0];

    if (!asesor.activo) {
      return NextResponse.json(
        { error: 'Esta cuenta está inactiva. Contacta a tu administrador.' },
        { status: 403 }
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
    });

    return setSessionCookie(response, token);

  } catch (error) {
    console.error('Error en login:', error);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
