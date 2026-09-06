"use client";

import Image from "next/image";

/**
 * User avatar: renders the profile picture synced from the user's OAuth
 * provider (Google/GitHub) when available, otherwise falls back to the
 * initials chip. There is no in-app upload — the picture comes only from
 * the sign-in provider.
 */
export function Avatar({
  image,
  name,
  email,
  size = 32,
  className = "",
}: {
  image?: string | null;
  name?: string | null;
  email?: string | null;
  /** Diameter in px. */
  size?: number;
  className?: string;
}) {
  const initials = name
    ? name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : email?.slice(0, 2).toUpperCase() ?? "U";

  if (image) {
    // Google serves avatars at the size encoded in the URL (e.g. "=s96-c").
    // Request a larger variant so the picture stays sharp at high DPI.
    const src = image.replace(/=s\d+-c$/, "=s256-c");
    return (
      <span
        className={`relative block shrink-0 overflow-hidden rounded-full border-2 border-black bg-black ${className}`}
        style={{ width: size, height: size }}
      >
        <Image
          src={src}
          alt={name || email || "Profile picture"}
          width={size * 2}
          height={size * 2}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-black font-bold text-white ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.34)) }}
    >
      {initials}
    </span>
  );
}
