/** Only send the browser back to the configured web origin. Anything else returns to the project list. */
export function safeReturnTo(webOrigin: string, candidate: string | undefined): string {
  const fallback = `${webOrigin.replace(/\/$/, "")}/app/projects`;
  if (!candidate) return fallback;
  try {
    const allowed = new URL(webOrigin);
    const target = new URL(candidate, webOrigin);
    if (target.origin !== allowed.origin) return fallback;
    return target.toString();
  } catch {
    return fallback;
  }
}
