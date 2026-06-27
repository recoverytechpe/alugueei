import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "skeleton-shimmer rounded-md bg-primary/10 animate-fade-in motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
