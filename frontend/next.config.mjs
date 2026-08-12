/** @type {import('next').NextConfig} */
const nextConfig = {
    async rewrites() {
        return [
            {
                source: '/api/:path*',
                destination: 'http://127.0.0.1:8000/api/:path*', // Proxy to Backend
            },
            {
                source: '/ws/:path*',
                destination: 'http://127.0.0.1:8000/ws/:path*', // Proxy WebSockets to Backend
            },
        ];
    },
};
export default nextConfig;
