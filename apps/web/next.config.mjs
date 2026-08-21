/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  // NOTE: do NOT add @pos/shared to transpilePackages. It ships prebuilt CommonJS
  // (packages/shared/dist), which Next consumes directly. Transpiling it makes the
  // dev Fast Refresh transform inject `import.meta.webpackHot` into that CJS bundle,
  // which is invalid outside an ES module and crashes `next dev`. The trade-off is
  // that changes to @pos/shared require `pnpm --filter @pos/shared build` to appear
  // here — already required since the dev pipeline has no `^build` dependency.
};

export default nextConfig;
