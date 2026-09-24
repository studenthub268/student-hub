import Link from "next/link";
import Image from "next/image";
import { Mail, MessageCircle } from "lucide-react";

const EXPLORE_LINKS = [
  { href: "/browse", label: "Browse Resources" },
  { href: "/upload", label: "Upload" },
  { href: "/contact", label: "Contact" },
];

const RESOURCE_LINKS = [
  { href: "/browse?type=past-paper", label: "Past Papers" },
  { href: "/browse?type=notes", label: "Notes" },
  { href: "/browse?type=quiz", label: "Quizzes" },
  { href: "/browse?type=assignment", label: "Assignments" },
];

const LEGAL_LINKS = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
];

export default function Footer() {
  return (
    <footer className="border-t-4 border-ink bg-ink on-ink">
      <div className="container mx-auto max-w-[1400px] px-4 py-14 sm:px-6 lg:px-8">
        {/* Top: brand + tagline left, link columns right.
            Mobile: compact 2-col link grid (Explore | Resources, then Legal)
            under the full-width brand — three stacked columns made the footer
            ~1300px tall on phones. sm–md: three columns in one row. Desktop
            (lg): four-column grid with the brand taking the wider first
            track. */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 sm:gap-x-8 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <Link href="/" className="inline-flex items-center gap-3 group">
              <span className="rounded-full border-2 border-background bg-surface p-1">
                <Image
                  src="/logo.png"
                  alt="Student Hub logo"
                  width={64}
                  height={64}
                  className="h-8 w-8 rounded-full object-contain"
                />
              </span>
              <span className="text-lg font-black tracking-tighter group-hover:text-accent transition-colors">
                Student Hub
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-background/60">
              Notes, past papers and study resources shared by students,
              for students. Peer-powered and student-run.
            </p>
            <div className="mt-5 flex items-center gap-2">
              <a
                href="mailto:abubakartanveer826@gmail.com"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-background/30 text-background/70 transition-colors hover:border-background hover:text-background"
                aria-label="Email Student Hub"
              >
                <Mail size={16} strokeWidth={2} aria-hidden />
              </a>
              <Link
                href="/contact"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-background/30 text-background/70 transition-colors hover:border-background hover:text-background"
                aria-label="Contact Student Hub"
              >
                <MessageCircle size={16} strokeWidth={2} aria-hidden />
              </Link>
            </div>
          </div>

          <FooterColumn title="Explore" links={EXPLORE_LINKS} />
          <FooterColumn title="Resources" links={RESOURCE_LINKS} />
          <FooterColumn title="Legal" links={LEGAL_LINKS} />
        </div>

        {/* Bottom bar: left-aligned stack on phones, spread row on desktop. */}
        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-foreground/20 pt-8 lg:flex-row lg:items-center">
          <p className="text-xs font-medium tracking-wider text-background/60">
            &copy; {new Date().getFullYear()} Student Hub. All rights reserved.
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-surface/10 px-3 py-1 text-xs font-bold tracking-wider text-background/80">
              Built by Students
            </span>
            <span className="rounded-full bg-accent px-3 py-1 text-xs font-bold tracking-wider text-accent-contrast">
              For Students
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <nav aria-label={title}>
      <h3 className="text-xs font-bold uppercase tracking-widest text-background/50">
        {title}
      </h3>
      <ul className="mt-4 space-y-2.5">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              prefetch={link.href === "/" || link.href === "/browse" || link.href === "/upload"}
              className="text-sm font-medium text-background/70 transition-colors hover:text-background"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
