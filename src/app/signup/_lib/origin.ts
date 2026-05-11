// Trusted-origin resolution for the signup Server Actions / Route Handler.
//
// Production: ONLY `process.env.NEXTAUTH_URL`. We deliberately do NOT read the
// request's `Origin` / `X-Forwarded-Host` headers — an attacker can set those
// freely to make a verification link in the email point to evil.com. The
// link goes to the real victim's email, so the practical attack is phishing
// via a URL that looks like ours.
//
// Development: fall back to headers so preview deploys + local dev work
// without setting NEXTAUTH_URL per-branch.

export function readTrustedOrigin(headerStore: Headers): string {
  const envOrigin = process.env.NEXTAUTH_URL?.trim();

  if (process.env.NODE_ENV === "production") {
    if (!envOrigin) {
      throw new Error(
        "NEXTAUTH_URL is required in production — verification links must use a deploy-time-configured origin, not user-controlled headers.",
      );
    }
    return envOrigin;
  }

  // Dev / preview: prefer NEXTAUTH_URL when set; otherwise infer from request
  // headers for convenience.
  if (envOrigin) {
    return envOrigin;
  }

  const headerOrigin = headerStore.get("origin");
  if (headerOrigin) {
    return headerOrigin;
  }

  const xfHost = headerStore.get("x-forwarded-host");
  if (xfHost) {
    const proto = headerStore.get("x-forwarded-proto") ?? "https";
    return `${proto}://${xfHost}`;
  }

  return "http://localhost:3000";
}

export function readIp(forwardedFor: string | null): string {
  return forwardedFor?.split(",")[0]?.trim() || "unknown";
}
