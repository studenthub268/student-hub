import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign up — Student Hub",
  robots: { index: false, follow: true },
};

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
