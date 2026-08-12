/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      {
        // El navegador (y la CDN de Vercel) NO deben cachear sw.js nunca —
        // si lo cachean, el chequeo de "hay versión nueva" compara contra
        // una copia vieja y el banner de actualizar no aparece, aunque ya
        // haya un deploy nuevo. Esto es la causa más común de que la
        // actualización no llegue a todos los equipos por igual.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ]
  },
}

export default nextConfig
