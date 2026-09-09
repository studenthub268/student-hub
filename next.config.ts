import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// 'unsafe-eval' is required only by React dev tooling — production keeps a
// tighter script policy. (A full nonce-based CSP is the next hardening step;
// it forces every prerendered page to render dynamically, so it's a bigger
// change than it looks.)
const scriptSrc = `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"} https://challenges.cloudflare.com`;

const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-XSS-Protection",
    value: "1; mode=block",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "X-Permitted-Cross-Domain-Policies",
    value: "none",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.r2.cloudflarestorage.com https://*.r2.dev https://student-hub-uet.vercel.app https://lh3.googleusercontent.com https://avatars.githubusercontent.com",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https://*.neon.tech https://api.resend.com https://*.r2.dev",
      "frame-src https://challenges.cloudflare.com https://*.r2.dev",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  },
];

export default {
  experimental: {
    // Client router cache: reuse prefetched RSC payloads for 30s so
    // back/forward and repeat navigation render instantly instead of
    // refetching the server for every dynamic page (default dynamic
    // staleTime is 0, which makes every click a full server round trip).
    staleTimes: { dynamic: 30, static: 180 },
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.r2.cloudflarestorage.com",
      },
      {
        protocol: "https",
        hostname: "**.r2.dev",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        source: "/api/(.*)",
        headers: [
          ...securityHeaders,
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate",
          },
        ],
      },
      {
        source: "/(.*)\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // MUST come after the extension rule above: with multiple matching
        // rules the later one wins, and sw.js must always revalidate — an
        // immutable cached sw.js freezes the updater that delivers every
        // future fix to visitors.
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
    ];
  },
  poweredByHeader: false,
} as NextConfig;
