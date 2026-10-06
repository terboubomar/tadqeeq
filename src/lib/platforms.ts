export type PlatformKey = "hungerstation" | "jahez" | "keeta" | "ninja";

export const PLATFORM_BRANDS: Record<PlatformKey, { name: string; nameEn: string }> = {
  hungerstation: { name: "هنقرستيشن", nameEn: "HungerStation" },
  jahez: { name: "جاهز", nameEn: "Jahez" },
  keeta: { name: "كيتا", nameEn: "Keeta" },
  ninja: { name: "نينجا", nameEn: "Ninja" },
};

export const PLATFORM_KEYS = Object.keys(PLATFORM_BRANDS) as PlatformKey[];

export function isPlatformKey(value: unknown): value is PlatformKey {
  return typeof value === "string" && value in PLATFORM_BRANDS;
}
