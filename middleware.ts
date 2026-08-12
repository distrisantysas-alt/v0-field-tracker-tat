// ============================================================================
// middleware.ts - Protege /admin/* a nivel de página
// La autorización real vive en cada API handler (lib/auth.ts requireSesion);
// esto es una segunda capa para que nadie llegue ni siquiera a ver la UI.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { getSesion } from '@/lib/auth'

const ROLES_ADMIN = ['supervisor', 'gerencia']

export async function middleware(req: NextRequest) {
  const sesion = await getSesion(req)

  if (!sesion || !ROLES_ADMIN.includes(sesion.rol)) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
