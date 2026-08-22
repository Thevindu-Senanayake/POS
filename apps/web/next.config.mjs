/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This admin portal is served by `next start` (a normal Node server), so NO
  // `output: 'export'` here — the operational POS/Rooms UI that needed a static
  // export now lives in apps/till/ui, not this app.
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
