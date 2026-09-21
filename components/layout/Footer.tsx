import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  return (
    <footer className="border-t-4 border-ink bg-ink on-ink">
      <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8 max-w-[1400px]">
        <div className="flex flex-col items-center justify-between md:flex-row gap-8">
          <div className="flex items-center gap-3 group">
            <div className="bg-surface rounded-full p-1 border-2 border-ink">
              <Image 
                src="/logo.png" 
                alt="Student Hub Logo" 
                width={64} 
                height={64} 
                className="w-8 h-8 rounded-full object-contain"
              />
            </div>
            <span className="text-2xl font-black tracking-tighter group-hover:text-accent transition-colors">
              Student Hub
            </span>
          </div>
          
          <div className="flex flex-wrap justify-center gap-6 md:gap-8">
            <Link href="/" prefetch className="text-sm font-bold tracking-wider text-background/70 hover:text-accent transition-colors">
              Home
            </Link>
            <Link href="/browse" prefetch className="text-sm font-bold tracking-wider text-background/70 hover:text-accent transition-colors">
              Browse Resources
            </Link>
            <Link href="/upload" prefetch className="text-sm font-bold tracking-wider text-background/70 hover:text-accent transition-colors">
              Upload
            </Link>
            <Link href="/terms" className="text-sm font-bold tracking-wider text-background/70 hover:text-accent transition-colors">
              Terms of Service
            </Link>
            <Link href="/privacy" className="text-sm font-bold tracking-wider text-background/70 hover:text-accent transition-colors">
              Privacy Policy
            </Link>
          </div>
        </div>
        <div className="mt-16 pt-8 border-t border-foreground/20 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs font-medium tracking-wider text-background/70">
            &copy; {new Date().getFullYear()} Student Hub. All rights reserved.
          </p>
          <div className="flex gap-2">
            <span className="px-3 py-1 bg-surface/10 rounded-full text-[10px] font-bold tracking-wider text-background/80">
              Built by Students
            </span>
            <span className="px-3 py-1 bg-accent text-accent-contrast rounded-full text-[10px] font-bold tracking-wider">
              For Students
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

