// ============================================================================
// lib/auth.ts - Sesión de asesor vía JWT firmado en cookie httpOnly
// ============================================================================
// El login sigue siendo solo-email (sin password, decisión de alcance).
// Lo que este módulo garantiza es que, una vez logueado, el asesor_id de
// cada request sale SIEMPRE de esta cookie firmada por el servidor —
// nunca del body/query que envía el cliente.
// ============================================================================

import { SignJWT, jwtVerify } from 'jose'
import { NextRequest, NextResponse } from 'next/server'

const COOKIE_NAME = 'session'
const SESSION_DURATION = '24h'
const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET no está configurado')
  }
  return new TextEncoder().encode(secret)
}

export interface Sesion {
  asesorId: string
  rol: string
  nombre: string
}

export async function crearTokenSesion(sesion: Sesion): Promise<string> {
  return new SignJWT({ asesorId: sesion.asesorId, rol: sesion.rol, nombre: sesion.nombre })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(getSecret())
}

export function setSessionCookie(response: NextResponse, token: string): NextResponse {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
  return response
}

export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(COOKIE_NAME, '', { httpOnly: true, path: '/', maxAge: 0 })
  return response
}

/** Lee y verifica la cookie de sesión. Devuelve null si no existe o es inválida/expirada. */
export async function getSesion(req: NextRequest): Promise<Sesion | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, getSecret())
    if (typeof payload.asesorId !== 'string' || typeof payload.rol !== 'string') return null
    return { asesorId: payload.asesorId, rol: payload.rol, nombre: String(payload.nombre ?? '') }
  } catch {
    return null
  }
}

/**
 * Exige sesión válida (y opcionalmente un rol permitido) para un route handler.
 * Uso: const auth = await requireSesion(req); if (auth instanceof NextResponse) return auth;
 * A partir de ahí `auth.asesorId` es la única fuente de verdad para identificar al actuante.
 */
export async function requireSesion(
  req: NextRequest,
  rolesPermitidos?: string[]
): Promise<Sesion | NextResponse> {
  const sesion = await getSesion(req)
  if (!sesion) {
    return NextResponse.json({ error: 'Sesión requerida. Inicia sesión de nuevo.' }, { status: 401 })
  }
  if (rolesPermitidos && !rolesPermitidos.includes(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permisos para esta acción' }, { status: 403 })
  }
  return sesion
}
