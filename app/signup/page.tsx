import { redirect } from "next/navigation";

// NextAuth signup was removed in the Clerk cutover — keep old bookmarks
// working by sending them to the Clerk sign-up page.
export default function SignupPage() {
  redirect("/sign-up");
}
