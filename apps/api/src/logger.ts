const SECRET = /key|token|secret|authorization|cookie|password/i;

export function log(
  level: "info" | "warn" | "error",
  msg: string,
  fields: Record<string, unknown> = {},
): void {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SECRET.test(key)) continue;
    safe[key] = value;
  }
  console.log(JSON.stringify({ level, msg, time: new Date().toISOString(), ...safe }));
}
