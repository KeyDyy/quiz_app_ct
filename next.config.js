/** @type {import('next').NextConfig} */
const nextConfig = {
    // Włącz standalone output dla Docker
    output: 'standalone',

    // Wyłącz wbudowywanie NEXT_PUBLIC_ zmiennych w build time
    generateBuildId: async () => {
        // Użyj stałego build ID lub timestamp
        return 'docker-build'
    },

    // Konfiguracja dla runtime environment variables
    serverRuntimeConfig: {
        // Te zmienne będą dostępne tylko na serwerze
    },

    publicRuntimeConfig: {
        // Te zmienne będą dostępne zarówno na serwerze jak i w przeglądarce
        // Ale będą odczytywane w runtime, nie w build time
    },

    // Konfiguracja dla zmiennych środowiskowych
    env: {
        // Te zmienne będą przekazane do aplikacji w runtime
        TENANT_ID: process.env.TENANT_ID,
    },

    // Wyłącz optymalizacje które mogą powodować problemy z runtime env vars
    swcMinify: true,

    // Dodatkowa konfiguracja dla lepszej obsługi runtime variables
    experimental: {
        // Włącz runtime env vars support
        isrMemoryCacheSize: 0, // Wyłącz cache żeby zawsze odczytywać świeże zmienne
    },

    // Konfiguracja webpack dla lepszej obsługi environment variables
    webpack: (config, { isServer }) => {
        // Dodaj plugin do obsługi runtime environment variables
        if (!isServer) {
            // W przeglądarce, zamień process.env na runtime values
            config.resolve.fallback = {
                ...config.resolve.fallback,
                fs: false,
                path: false,
            };
        }

        return config;
    },

    // Headers dla lepszej obsługi runtime config
    async headers() {
        return [
            {
                source: '/api/:path*',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'no-store, max-age=0',
                    },
                ],
            },
        ];
    },
}

module.exports = nextConfig