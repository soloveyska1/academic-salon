export function buildDocHref(filePath: string): string {
  const normalized = String(filePath || "").trim();
  if (!normalized) return "/catalog";
  return `/doc?file=${encodeURIComponent(normalized)}`;
}
