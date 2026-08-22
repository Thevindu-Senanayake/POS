/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static export — the Electron till serves apps/till/ui/out directly via its
  // local-server.ts resolver (no dev server in production).
  output: 'export',
  // @pos/client-core ships raw TS/TSX with NO build step, so Next must transpile
  // it here. This is the correct use of transpilePackages (raw source) and does
  // NOT conflict with the rule against transpiling @pos/shared, which ships
  // prebuilt CommonJS and must be consumed as-is.
  transpilePackages: ['@pos/client-core'],
};

export default nextConfig;
