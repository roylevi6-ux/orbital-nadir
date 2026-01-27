import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // i18n will be handled via middleware and app router for Hebrew/English support
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb', // For file uploads
    },
  },
  // ESLint is now enabled during builds to catch errors early
};

export default nextConfig;
