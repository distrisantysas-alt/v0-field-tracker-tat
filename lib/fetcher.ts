// ============================================================================
// lib/fetcher.ts - fetcher compartido para useSWR con auto-recuperación de sesión
// ============================================================================
// Si el servidor responde 401 (sesión inválida/expirada/inexistente), limpia
// cualquier localStorage viejo y manda al login. Esto evita que alguien con
// un app_session guardado de antes del sistema de cookies se quede viendo
// una pantalla que nunca puede cargar datos (la UI se dibuja desde
// localStorage, pero cada API necesita la cookie real).
// ============================================================================

function limpiarSesionYRedirigir() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem('app_session')
    localStorage.removeItem('asesor_session')
  } catch {}
  if (window.location.pathname !== '/') {
    window.location.href = '/'
  } else {
    window.location.reload()
  }
}

export const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (res.status === 401) {
    limpiarSesionYRedirigir()
    // No resuelve con datos falsos — deja la promesa pendiente mientras
    // redirige, para que el componente no intente renderizar con basura.
    return new Promise(() => {})
  }
  return res.json()
}
