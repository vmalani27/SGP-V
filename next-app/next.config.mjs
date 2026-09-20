/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  devIndicators: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    optimizePackageImports: ["@xterm/xterm", "react-markdown"],
  },
};

export default nextConfig;
