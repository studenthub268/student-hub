export function LiveStats() {
  return (
    <div className="flex gap-6 lg:gap-8 h-36">
      <div className="flex-1 bg-gray-100 rounded-[2rem] flex flex-col items-center justify-center p-4 hover:-translate-y-1 hover:shadow-lg transition-all duration-300 cursor-default">
        <span className="text-3xl font-medium tracking-tighter leading-[0.95] text-center">
          Simple<br />&amp; Fast
        </span>
        <span className="text-xs text-gray-500 mt-1 tracking-wider font-medium whitespace-nowrap">Find notes in seconds</span>
      </div>
      <div className="flex-1 bg-[#111] text-white rounded-[2rem] flex flex-col items-center justify-center p-4 hover:-translate-y-1 hover:shadow-lg transition-all duration-300 cursor-default">
        <span className="text-3xl font-medium tracking-tighter leading-[0.95] text-center">
          Student<br />Built
        </span>
        <span className="text-xs text-gray-400 mt-1 tracking-wider font-medium whitespace-nowrap">By students, for students</span>
      </div>
    </div>
  );
}
