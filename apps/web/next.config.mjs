/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Admin-only portal shipped as a STATIC export (out/), served by nginx on :80 in
  // production (see deploy/nginx.conf + docker-compose.prod.yml). It is a client-side
  // SPA — every screen is 'use client', all data is fetched in the browser — so it
  // has no server-only features and exports cleanly. `next build` emits out/.
  output: 'export',
  // No next/image today; set defensively so adding <Image> later can't silently
  // break the export (static export requires unoptimized images).
  images: { unoptimized: true },
  //
  // @pos/client-core ships raw TS/TSX with NO build step, so Next must transpile
  // it. That is the correct use of transpilePackages (raw source).
  //
  // NOTE: do NOT add @pos/shared to transpilePackages. It ships prebuilt
  // CommonJS (packages/shared/dist), which Next consumes directly. Transpiling
  // it makes the dev Fast Refresh transform inject `import.meta.webpackHot` into
  // that CJS bundle, which is invalid outside an ES module and crashes
  // `next dev`. Changes to @pos/shared require `pnpm --filter @pos/shared build`
  // to appear here — already required since the dev pipeline has no `^build`.
  transpilePackages: ['@pos/client-core'],
};

export default nextConfig;
