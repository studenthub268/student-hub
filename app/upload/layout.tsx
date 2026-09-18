import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Upload a Resource — Student Hub",
  description:
    "Share your notes, past papers, quizzes or assignments with students. Upload a PDF, image or DOCX to the peer-powered Student Hub library.",
  robots: { index: false, follow: true },
};

export default function UploadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
