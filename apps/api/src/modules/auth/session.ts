import { SignJWT, jwtVerify } from "jose";
import type { Response } from "express";
import { config } from "../../config.js";

const encoder = new TextEncoder();

function key(): Uint8Array {
  return encoder.encode(config.sessionSecret);
}

export async function signSession(userId: string, workspaceId: string): Promise<string> {
  return new SignJWT({ workspaceId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key());
}

export async function verifySession(token: string): Promise<{ userId: string; workspaceId: string }> {
  const { payload } = await jwtVerify(token, key());
  return {
    userId: String(payload.sub ?? ""),
    workspaceId: String(payload.workspaceId ?? ""),
  };
}

const WEEK = 7 * 24 * 60 * 60;

export function setSessionCookie(res: Response, token: string): void {
  res.setHeader("Set-Cookie", sessionCookie(encodeURIComponent(token), WEEK));
}

export function clearSessionCookie(res: Response): void {
  res.setHeader("Set-Cookie", sessionCookie("", 0));
}

function sessionCookie(value: string, maxAge: number): string {
  const secure = config.isProd ? "; Secure" : "";
  const sameSite = config.isProd ? "None" : "Lax";
  return `quarry_session=${value}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=${sameSite}${secure}`;
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}
