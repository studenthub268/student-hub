import { redirect } from "next/navigation";

// NextAuth login was removed in the Clerk cutover — keep old bookmarks and
// smoke probes working by sending them to the Clerk sign-in page.
export default function LoginPage() {
  redirect("/sign-in");
}
