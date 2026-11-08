/** Only same-site paths are allowed as a post-sign-in destination. */
export function safeNext(raw: string | null, fallback = "/financial-services") {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://") || raw.includes("\\")) return fallback;
  return raw;
}
