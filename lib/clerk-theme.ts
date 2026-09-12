// Shared Clerk appearance — brand variables. Clerk v7's runtime stylesheet
// uses hashed selectors with [data-variant] rules that outrank element-level
// CSSObjects, so structural overrides (borders, shadows, pills) live in
// globals.css under `.clerk-brutalist`, which reliably wins the cascade.
// Both pages pass this as `appearance` to <SignIn/>/<SignUp/>.
export const CLERK_APPEARANCE = {
  // Isolate Clerk's runtime stylesheet inside a @layer so the unlayered
  // globals.css overrides always win the cascade.
  cssLayerName: "clerk",
  variables: {
    // Black primary like the site's canonical CTA; teal accents applied
    // via globals.css. Components inherit the site font.
    colorPrimary: "#111111",
    colorPrimaryForeground: "#ffffff",
    colorNeutral: "#111111",
    colorBorder: "#111111",
    colorRing: "#0D9488",
    borderRadius: "0.75rem", // matches site inputs' rounded-xl
  },
};
