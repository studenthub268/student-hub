export default function AdminLoading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 border-4 border-black/10 rounded-full" />
        <div className="absolute inset-0 border-4 border-transparent border-t-[#0D9488] rounded-full animate-spin" />
      </div>
    </div>
  );
}
