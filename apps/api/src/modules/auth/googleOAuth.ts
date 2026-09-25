export type GoogleProfile = {
  sub: string;
  email: string;
  email_verified: true;
  name?: string;
  picture?: string;
};

type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function googleRedirectUri(publicApiUrl: string): string {
  return `${publicApiUrl.replace(/\/+$/, "")}/api/v1/auth/oauth/google/callback`;
}

export function googleAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url.toString();
}

export async function exchangeGoogleCode(
  input: GoogleOAuthConfig & { code: string; codeVerifier: string },
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleProfile> {
  const tokenResponse = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!tokenResponse.ok) throw new Error("Google authorization code exchange failed");

  const tokenJson = await tokenResponse.json() as { access_token?: unknown };
  if (typeof tokenJson.access_token !== "string" || !tokenJson.access_token) {
    throw new Error("Google did not return an access token");
  }

  const profileResponse = await fetchImpl("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!profileResponse.ok) throw new Error("Google user profile request failed");

  const profile = await profileResponse.json() as Partial<GoogleProfile>;
  if (
    typeof profile.sub !== "string" || !profile.sub ||
    typeof profile.email !== "string" || !profile.email ||
    profile.email_verified !== true
  ) {
    throw new Error("Google did not return a verified email profile");
  }
  return {
    sub: profile.sub,
    email: profile.email.toLowerCase(),
    email_verified: true,
    name: typeof profile.name === "string" ? profile.name : undefined,
    picture: typeof profile.picture === "string" ? profile.picture : undefined,
  };
}
