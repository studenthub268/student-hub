export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={["animate-pulse rounded-xl bg-black/5", className].filter(Boolean).join(" ")}
      {...props}
    />
  );
}