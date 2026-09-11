import type { Metadata } from "next";

// page.tsx is a client component (form state), so its metadata lives here.
export const metadata: Metadata = {
  title: "Contact — Student Hub",
  description:
    "Questions, feedback or a problem with a resource? Message the Student Hub team — we read every message.",
  alternates: { canonical: "/contact" },
};

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
