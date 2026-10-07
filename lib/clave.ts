// ============================================================================
// lib/clave.ts - Claves de usuario (hash scrypt, sin dependencias externas)
// Formato guardado: scrypt$N$r$p$salt(base64)$hash(base64)
// ============================================================================
import { randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from 'crypto'
import { promisify } from 'util'

const scrypt = promisify(scryptCb) as (pwd: string, salt: Buffer, keylen: number, opts: object) => Promise<Buffer>

const N = 16384, R = 8, P = 1, KEYLEN = 32
export const CLAVE_MIN = 6
export const MAX_INTENTOS = 5
export const BLOQUEO_MINUTOS = 15

export function claveValida(clave: unknown): clave is string {
  return typeof clave === 'string' && clave.length >= CLAVE_MIN && clave.length <= 64
}

export async function hashClave(clave: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(clave, salt, KEYLEN, { N, r: R, p: P })
  return ['scrypt', N, R, P, salt.toString('base64'), hash.toString('base64')].join('$')
}

export async function verificarClave(clave: string, guardada: string): Promise<boolean> {
  const partes = guardada.split('$')
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false
  const [, n, r, p, salt, hash] = partes
  try {
    const esperado = Buffer.from(hash, 'base64')
    const calculado = await scrypt(clave, Buffer.from(salt, 'base64'), esperado.length, { N: Number(n), r: Number(r), p: Number(p) })
    return calculado.length === esperado.length && timingSafeEqual(calculado, esperado)
  } catch {
    return false
  }
}

/** Clave temporal de 6 digitos para entregar al usuario una sola vez. */
export function claveTemporal(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}
