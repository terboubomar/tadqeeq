/** "شركة واحدة", "شركتان", "3 شركات", "11 شركة": Arabic count of companies. */
export function companiesLabel(count: number): string {
  if (count === 1) return "شركة واحدة";
  if (count === 2) return "شركتان";
  if (count >= 3 && count <= 10) return `${count} شركات`;
  return `${count} شركة`;
}
