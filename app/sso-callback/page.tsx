"use client";

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

// Handles the OAuth provider round-trip for the custom sign-in/sign-up
// buttons (signIn.sso/signUp.sso redirect flow): completes the session and
// follows the redirectUrl the flow was started with.
export default function SsoCallbackPage() {
  return <AuthenticateWithRedirectCallback />;
}
