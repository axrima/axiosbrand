/**
 * Ensure Prisma connection-pool query params are present on DATABASE_URL.
 * Docker/single-CPU defaults often land at connection_limit=5, which collapses
 * under concurrent storefront traffic + background cleanup jobs (P2024).
 */
export function withPrismaPoolDefaults(
  databaseUrl: string,
  options?: {
    connectionLimit?: number;
    poolTimeoutSeconds?: number;
  }
): string {
  if (!databaseUrl) return databaseUrl;

  try {
    const parsed = new URL(databaseUrl);
    const connectionLimit =
      options?.connectionLimit ??
      parsePositiveInt(process.env.PRISMA_CONNECTION_LIMIT, 20);
    const poolTimeout =
      options?.poolTimeoutSeconds ??
      parsePositiveInt(process.env.PRISMA_POOL_TIMEOUT, 20);

    if (!parsed.searchParams.has('connection_limit')) {
      parsed.searchParams.set('connection_limit', String(connectionLimit));
    }
    if (!parsed.searchParams.has('pool_timeout')) {
      parsed.searchParams.set('pool_timeout', String(poolTimeout));
    }

    return parsed.toString();
  } catch {
    return databaseUrl;
  }
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
