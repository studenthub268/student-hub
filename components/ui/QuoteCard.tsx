"use client";

import { useSyncExternalStore } from "react";

const quotes = [
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
];

type Quote = (typeof quotes)[number];

// Server snapshot: null (no flash of wrong content)
const getServerSnapshot = (): Quote | null => null;

// Client snapshot: random quote chosen once, memoized
let clientQuote: Quote | null = null;
const getClientSnapshot = (): Quote | null => {
  if (!clientQuote) clientQuote = quotes[Math.floor(Math.random() * quotes.length)];
  return clientQuote;
};

export function QuoteCard() {
  const quote = useSyncExternalStore(
    () => () => {}, // no subscriptions needed
    getClientSnapshot,
    getServerSnapshot,
  );

  return (
    // min-h, not fixed h-36: long quotes at narrow widths need to grow,
    // a fixed height clipped them
    <div className="bg-gradient-to-br from-surface-muted to-surface-muted/60 rounded-[2rem] p-6 min-h-36 flex flex-col items-center justify-center relative overflow-hidden border-2 border-line">
      {quote ? (
        <>
          <p className="text-sm sm:text-base font-medium text-foreground/70 text-center leading-snug italic max-w-[90%]">
            &ldquo;{quote.text}&rdquo;
          </p>
          <span className="text-xs text-foreground/70 mt-2 font-semibold tracking-wider">
            &mdash; {quote.author}
          </span>
        </>
      ) : null}
    </div>
  );
}
