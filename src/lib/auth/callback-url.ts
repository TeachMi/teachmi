export const defaultPostSignInPath = "/dashboard";

function getFirstValue(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }

  return null;
}

export function getSafeCallbackUrl(value: unknown, fallback = defaultPostSignInPath): string {
  const rawValue = getFirstValue(value)?.trim();

  if (!rawValue || !rawValue.startsWith("/") || rawValue.startsWith("//") || rawValue.includes("\\")) {
    return fallback;
  }

  try {
    const url = new URL(rawValue, "https://teachme.local");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
