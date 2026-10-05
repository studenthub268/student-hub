import type { NextConfig } from "next";

// script-src keeps 'unsafe-inline' BY DESIGN: Next's per-page inline
// flight-payload scripts (__next_f.push) are request-unique and cannot be
// hashed, and the nonce alternative (middleware CSP header) forces every
// prerendered page to render dynamically — killing the static/ISR caching
// the site's performance work depends on (verified empirically 2026-09-12:
// hash-only policy blocks hydration entirely). Revisit only if the site
// moves to fully dynamic rendering. 'unsafe-eval' remains dev-only.
const isProd = process.env.NODE_ENV === "production";
const scriptSrc = `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`;

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
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.r2.cloudflarestorage.com https://*.r2.dev https://student-hub-uet.vercel.app https://lh3.googleusercontent.com https://avatars.githubusercontent.com https://drive.google.com",
      // media-src for Drive-hosted videos: <video> falls back to default-src
      // ('self') when unset, which would block the cross-origin Drive stream.
      "media-src 'self' https://drive.google.com",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https://*.neon.tech https://api.resend.com https://*.r2.dev",
      // frame-src must include the R2 public host: resource PDFs render in
      // an <iframe> straight from storage (images only need img-src, which is
      // why PDFs alone showed Chrome's "This content is blocked" panel).
      // drive.google.com serves the embedded folder listing for folder
      // resources — without it the iframe renders an empty CSP error panel.
      "frame-src 'self' https://*.r2.dev https://*.r2.cloudflarestorage.com https://drive.google.com",
      "worker-src 'self' blob:",
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
    // NOTE: view transitions need no config in Next 16 — route navigations
    // activate React's ViewTransition integration automatically; the old
    // experimental.viewTransition key is now rejected by the config schema.
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
        // Drive PDF optimization proxy — cacheable successes (immutable per
        // drive file id), uncacheable errors. MUST come BEFORE the blanket
        // /api/:path((?!pdf).*) no-store rule (Next uses the LAST matching
        // headers rule), otherwise no-store stamps over every cacheable proxy
        // response and defeats the caching.
        source: "/api/stream-pdf",
        headers: [
          ...securityHeaders,
          {
            key: "Cache-Control",
            value: "public, max-age=3600, immutable",
          },
        ],
      },
      {
        // No-store for every API route EXCEPT the PDF byte proxies: the route
        // handlers set their own per-status caching there (cacheable successes,
        // uncachable errors). Config headers beat route-set headers in Next,
        // so a blanket /api/(.*) rule here would have stamped no-store over
        // the proxies' cacheable responses — forcing every resource-page view
        // to re-download the full PDF body. The named-param regex skips any
        // path whose first segment is "pdf" (i.e. /api/pdf/<id> and
        // /api/stream-pdf only). Note: /api/stream-pdf is matched separately
        // ABOVE this rule (it appears first), so this no-store rule never
        // applies to it — the ordering is what protects its cache headers.
        source: "/api/:path((?!pdf).*)",
        headers: [
          ...securityHeaders,
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate",
          },
        ],
      },
      {
        // .mjs included: the 1.4MB pdf.js worker (public/pdfjs/pdf.worker.min.mjs)
        // is content-fixed per pdfjs-dist release, so it must cache immutable —
        // without this it revalidated on every visit and cost repeat PDF readers
        // a full re-download on slow campus wifi. (The worker is served through
        // Next's ESM static handler, which needs its own rule — the extension
        // rule below alone didn't apply to it, verified 2026-10-01.)
        source: "/pdfjs/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/(.*)\.(js|mjs|css|png|jpg|jpeg|gif|svg|ico|woff|woff2)",
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
