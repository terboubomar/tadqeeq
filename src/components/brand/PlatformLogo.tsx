import { PLATFORM_BRANDS, isPlatformKey, type PlatformKey } from "@/lib/platforms";
import { cn } from "@/lib/utils";

/** Square app-icon logo of a delivery platform, for tables, chips and pickers. */
export function PlatformIcon({ platform, className }: { platform: PlatformKey; className?: string }) {
  return (
    <img
      src={`/platforms/${platform}.png`}
      alt=""
      aria-hidden="true"
      width={20}
      height={20}
      loading="lazy"
      decoding="async"
      className={cn("size-5 shrink-0 rounded-[5px] object-cover ring-1 ring-black/5", className)}
    />
  );
}

/** Platform icon followed by its Arabic name. Unknown values fall back to plain text. */
export function PlatformName({
  platform,
  className,
  iconClassName,
}: {
  platform: string;
  className?: string;
  iconClassName?: string;
}) {
  if (!isPlatformKey(platform)) return <span className={className}>{platform}</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5 align-middle", className)}>
      <PlatformIcon platform={platform} className={iconClassName} />
      {PLATFORM_BRANDS[platform].name}
    </span>
  );
}

/** Full-colour wide logo, for "works with" strips. */
export function PlatformWordmark({ platform, className }: { platform: PlatformKey; className?: string }) {
  return (
    <img
      src={`/platforms/${platform}-wide.png`}
      alt={`${PLATFORM_BRANDS[platform].name} (${PLATFORM_BRANDS[platform].nameEn})`}
      height={48}
      loading="lazy"
      decoding="async"
      className={cn("h-12 w-auto rounded-xl", className)}
    />
  );
}
