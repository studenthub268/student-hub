import type { Metadata } from "next";
import { Suspense } from "react";
import AcceptTokenClient from "./AcceptTokenClient";

export const metadata: Metadata = {
  title: "Signing you in — Student Hub",
  robots: { index: false, follow: false },
};

export default function AcceptTokenPage() {
  return (
    <Suspense>
      <AcceptTokenClient />
    </Suspense>
  );
}
