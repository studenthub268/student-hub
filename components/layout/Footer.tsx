import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  return (
    <footer className="border-t-4 border-black bg-[#111] text-white">
      <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8 max-w-[1400px]">
        <div className="flex flex-col items-center justify-between md:flex-row gap-8">
          <div className="flex items-center gap-3 group">
            <div className="bg-white rounded-full p-1 border-2 border-black">
              <Image 
                src="/logo.png" 
                alt="Student Hub Logo" 
                width={64} 
                height={64} 
                className="w-8 h-8 rounded-full object-contain"
              />
            </div>
            <span className="text-2xl font-black tracking-tighter group-hover:text-[#0D9488] transition-colors">
              Student Hub
            </span>
          </div>
          
          <div className="flex flex-wrap justify-center gap-6 md:gap-8">
            <Link href="/" prefetch className="text-sm font-bold tracking-wider text-white/70 hover:text-[#0D9488] transition-colors">
              Home
            </Link>
            <Link href="/browse" prefetch className="text-sm font-bold tracking-wider text-white/70 hover:text-[#0D9488] transition-colors">
              Browse Resources
            </Link>
            <Link href="/upload" prefetch className="text-sm font-bold tracking-wider text-white/70 hover:text-[#0D9488] transition-colors">
              Upload
            </Link>
            <Link href="/terms" className="text-sm font-bold tracking-wider text-white/70 hover:text-[#0D9488] transition-colors">
              Terms & Privacy
            </Link>
          </div>
        </div>
        <div className="mt-16 pt-8 border-t border-white/20 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs font-medium tracking-wider text-white/50">
            &copy; {new Date().getFullYear()} Student Hub. All rights reserved.
          </p>
          <div className="flex gap-2">
            <span className="px-3 py-1 bg-white/10 rounded-full text-[10px] font-bold tracking-wider text-white/80">
              Built by Students
            </span>
            <span className="px-3 py-1 bg-[#0D9488] text-black rounded-full text-[10px] font-bold tracking-wider">
              For Students
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

