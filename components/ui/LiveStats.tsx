export function LiveStats() {
  return (
    // Captions must be allowed to wrap: whitespace-nowrap made each card
    // unshrinkable, so at ~1024px they overflowed the lg:col-span-4 column
    // and the teal hero block painted over them. gap shrinks on small lg
    // widths for the same reason.
    <div className="flex gap-4 sm:gap-6 lg:gap-8 min-h-36">
      <div className="flex-1 min-w-0 bg-gray-100 rounded-[2rem] flex flex-col items-center justify-center p-4 hover:-translate-y-1 hover:shadow-lg transition-all duration-300 cursor-default">
        <span className="text-3xl font-medium tracking-tighter leading-[0.95] text-center">
          Simple<br />&amp; Fast
        </span>
        {/* gray-600, not 500: 500 on the gray-100 card is 4.39:1 — below WCAG AA 4.5:1 */}
        <span className="text-xs text-gray-600 mt-1 tracking-wider font-medium text-center">Find notes in seconds</span>
      </div>
      <div className="flex-1 min-w-0 bg-[#111] text-white rounded-[2rem] flex flex-col items-center justify-center p-4 hover:-translate-y-1 hover:shadow-lg transition-all duration-300 cursor-default">
        <span className="text-3xl font-medium tracking-tighter leading-[0.95] text-center">
          Student<br />Built
        </span>
        <span className="text-xs text-gray-400 mt-1 tracking-wider font-medium text-center">By students, for students</span>
      </div>
    </div>
  );
}
