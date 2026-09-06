import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin", "/upload", "/profile", "/report", "/offline"],
      },
    ],
    sitemap: `${process.env.NEXT_PUBLIC_APP_URL || "https://student-hub-uet.vercel.app"}/sitemap.xml`,
  };
}
