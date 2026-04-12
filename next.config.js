/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/CNTClientes',
  output: 'standalone',

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',           value: 'DENY' },
          { key: 'X-Content-Type-Options',     value: 'nosniff' },
          { key: 'Referrer-Policy',            value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',         value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },

  // Imágenes externas permitidas (agregar dominios si es necesario)
  images: {
    // Si solo usarás imágenes locales servidas por tu app, puedes dejar esto vacío
    // o configurar dominios concretos si además aceptas URLs externas reales.
    remotePatterns: [
      {
        protocol: 'http',
        hostname: process.env.DB_HOST,
        port: process.env.DB_PORT,
        pathname: '/**',
      },
    ],
  },
};

module.exports = nextConfig;
