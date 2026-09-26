const QUOTES = [
  { text: "Education is the most powerful weapon which you can use to change the world.", author: "Nelson Mandela" },
  { text: "The function of education is to teach one to think intensively and to think critically.", author: "Martin Luther King Jr." },
  { text: "You must concentrate on gaining knowledge and education. It is your foremost responsibility.", author: "Muhammad Ali Jinnah" },
  { text: "An investment in knowledge pays the best interest.", author: "Benjamin Franklin" },
  { text: "Education is not the filling of a pail, but the lighting of a fire.", author: "W.B. Yeats" },
  { text: "The roots of education are bitter, but the fruit is sweet.", author: "Aristotle" },
  { text: "Live as if you were to die tomorrow. Learn as if you were to live forever.", author: "Mahatma Gandhi" },
  { text: "Education is what remains after one has forgotten what one has learned in school.", author: "Albert Einstein" },
  { text: "The more that you read, the more things you will know.", author: "Dr. Seuss" },
  { text: "I have never let my schooling interfere with my education.", author: "Mark Twain" },
] as const;

/**
 * Server component: the quote is picked once at build/revalidate time and
 * baked into the cached HTML. No hydration JS, no flash of empty card.
 *
 * Rotation without Math.random()/Date.now() (both impure in render): the
 * index comes from `new Date()` passed in as a seed — the page re-renders
 * at most once per ISR window (revalidate=60), so a minute-resolution seed
 * rotates the quote naturally as the cache rolls while keeping any single
 * render pure and deterministic.
 */
export function QuoteCard({ seed = 0 }: { seed?: number } = {}) {
  const index = seed % QUOTES.length;
  const quote = QUOTES[index];

  return (
    <div className="bg-gradient-to-br from-surface-muted to-surface-muted/60 rounded-[2rem] p-6 min-h-36 flex flex-col items-center justify-center relative overflow-hidden border-2 border-line">
      <p className="text-sm sm:text-base font-medium text-foreground/70 text-center leading-snug italic max-w-[90%]">
        &ldquo;{quote.text}&rdquo;
      </p>
      <span className="text-xs text-foreground/70 mt-2 font-semibold tracking-wider">
        &mdash; {quote.author}
      </span>
    </div>
  );
}
