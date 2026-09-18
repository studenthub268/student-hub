import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Report a Resource — Student Hub",
  description:
    "Report copyrighted, inappropriate or academically dishonest material on Student Hub. Our team reviews every report within 48 hours.",
  robots: { index: false, follow: true },
};

export default function ReportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
