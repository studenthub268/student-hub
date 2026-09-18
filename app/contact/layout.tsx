import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact — Student Hub",
  description:
    "Questions, feedback, copyright takedowns or collaboration requests — reach the Student Hub team through the contact form.",
  alternates: { canonical: "/contact" },
};

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
