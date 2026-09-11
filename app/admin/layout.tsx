import type { Metadata } from "next";

// Not in robots.txt (listing it there only advertises the path — RedSentinel
// flagged exactly that); noindex hides it from search engines instead.
export const metadata: Metadata = {
  title: "Admin — Student Hub",
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
