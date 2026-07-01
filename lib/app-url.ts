function normalizeUrl(value: string | undefined | null) {
  const raw = (value ?? "").trim();
  if (!raw) return null;

  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function getAppUrl() {
  const explicitAppUrl = normalizeUrl(process.env.APP_URL);
  if (explicitAppUrl) {
    return explicitAppUrl;
  }

  if (process.env.NODE_ENV !== "production") {
    const localAppUrl = normalizeUrl(process.env.NEXT_PUBLIC_APP_URL);
    if (localAppUrl) {
      return localAppUrl;
    }
  }

  const vercelProductionUrl = (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "").trim();
  if (vercelProductionUrl) {
    return `https://${vercelProductionUrl}`;
  }

  const vercelUrl = (process.env.VERCEL_URL ?? "").trim();
  if (vercelUrl) {
    return `https://${vercelUrl}`;
  }

  return "https://qcrc-team-management-sf1y.vercel.app";
}
