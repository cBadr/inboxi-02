/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow importing the workspace packages (TS source) directly.
  transpilePackages: ['@inboxi/db', '@inboxi/shared', '@inboxi/integrations'],
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
    // The production box has 2 vCPUs and 3.9 GB with no swap. next build
    // spawns one worker per CPU by default and each may grow to the heap
    // ceiling, so two of them plus the parent are enough for the kernel to
    // OOM-kill the build — which wipes .next and leaves the running app with
    // nothing to restart from. One worker, in-process, fits.
    cpus: 1,
    workerThreads: false,
  },
  async rewrites() {
    // Serve the MTA-STS policy at the well-known path (on mta-sts.<domain>).
    return [{ source: '/.well-known/mta-sts.txt', destination: '/api/mta-sts' }];
  },
  async headers() {
    const securityHeaders = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      },
    ];
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
