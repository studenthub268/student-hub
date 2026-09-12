// Shown while <SignIn/>/<SignUp/> mount (Clerk is client-only — the server
// HTML for these pages is an empty <main>). Without this, slow networks or
// a stale tab mid-deploy show a blank page under the navbar. Styled as the
// site's brutalist card so the skeleton visually matches the loaded form.
export function ClerkLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading sign-in form"
      className="w-full max-w-[26rem] rounded-[2rem] border-2 border-black bg-white p-8 shadow-[8px_8px_0px_0px_#111]"
    >
      <div className="shimmer mx-auto h-6 w-44 rounded-lg" />
      <div className="shimmer mt-8 h-12 w-full rounded-xl" />
      <div className="shimmer mt-4 h-12 w-full rounded-xl" />
      <div className="shimmer mt-8 h-14 w-full rounded-full" />
    </div>
  );
}
