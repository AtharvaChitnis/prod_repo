/** Use the database named in the URI. Atlas strings often omit it, which would otherwise write into `test`. */
export function databaseName(uri: string): string {
  try {
    const name = decodeURIComponent(new URL(uri).pathname.replace(/^\//, "").split("/")[0] ?? "");
    return name || "quarry";
  } catch {
    return "quarry";
  }
}

/** Driver errors can echo the connection string. Keep the code and the text, drop credentials. */
export function mongoErrorFields(error: unknown): { code?: number; codeName?: string; message: string } {
  const details = error as { code?: unknown; codeName?: unknown; message?: unknown; errmsg?: unknown };
  const raw = typeof details.message === "string"
    ? details.message
    : typeof details.errmsg === "string"
      ? details.errmsg
      : "Database command failed";
  return {
    code: typeof details.code === "number" ? details.code : undefined,
    codeName: typeof details.codeName === "string" ? details.codeName : undefined,
    message: raw.replace(/mongodb(?:\+srv)?:\/\/[^\s'"]+/gi, "mongodb://redacted"),
  };
}
