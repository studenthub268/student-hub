export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={["shimmer rounded-xl", className].filter(Boolean).join(" ")}
      {...props}
    />
  );
}