/** @type {import('next').NextConfig} */
const nextConfig = {
  // i18n will be handled via middleware and app router for Hebrew/English support
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb', // For file uploads
    },
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
