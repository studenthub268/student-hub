// Tiny deploy-version beacon: every build bakes its own id (git SHA on
// Vercel — see scripts/write-deploy-version.mjs). Open pages poll this
// endpoint; when the id differs from what they loaded with, they refresh
// once. Never cached: exempted from the SW, no-store here.
import { DEPLOY_VERSION } from "@/lib/generated/deploy-version";

export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(JSON.stringify({ v: DEPLOY_VERSION }), {
    status: 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Content-Type": "application/json",
    },
  });
}
