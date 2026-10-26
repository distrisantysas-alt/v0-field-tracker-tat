// ============================================================================
// app/api/sw-version/route.ts
// Retorna una versión única por deploy para que el SW detecte cambios
// En Vercel, VERCEL_GIT_COMMIT_SHA cambia en cada deploy
// ============================================================================

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Generar versión al arrancar el proceso (cambia en cada deploy)
// Una versión por deploy. Si no hay ninguna variable de Vercel, 'local' (la app no avisa de cambios)
// en vez de un valor distinto por arranque, que mostraría el aviso de actualización sin motivo.
const BUILD_VERSION = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8)
  ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 8)
  ?? process.env.VERCEL_DEPLOYMENT_ID
  ?? 'local'

export async function GET() {
  return NextResponse.json(
    { version: BUILD_VERSION, timestamp: new Date().toISOString() },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    }
  )
}
