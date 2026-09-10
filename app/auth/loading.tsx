/** Auth pages (verify-email etc.) await cookies, so they need a Suspense
    boundary to prerender — a neutral centered pulse instead of the old
    leaked-in home skeleton. */
export default function AuthLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="h-10 w-10 animate-pulse rounded-full border-2 border-black bg-[#0D9488]" />
    </div>
  );
}
