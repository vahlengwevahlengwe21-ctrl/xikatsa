export async function execute(statement: string, values: unknown[] = []): Promise<unknown> {
  const gatewayUrl = process.env.DATABASE_GATEWAY_URL;
  const token = process.env.DATABASE_GATEWAY_TOKEN;
  if (!gatewayUrl || !token) throw new Error('The MariaDB gateway is not configured.');

  const parsedUrl = new URL(gatewayUrl);
  const localDevelopmentHost = process.env.NODE_ENV !== 'production' &&
    ['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname);
  if (parsedUrl.protocol !== 'https:' && !localDevelopmentHost) {
    throw new Error('The MariaDB gateway must use HTTPS.');
  }
  const endpoint = gatewayUrl.endsWith('/execute') ? gatewayUrl : `${gatewayUrl.replace(/\/$/, '')}/execute`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql: statement, values }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error('The MariaDB gateway could not be reached.');
  }

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || payload?.ok === false) {
    throw new Error('The MariaDB gateway rejected the request.');
  }
  if (!payload) throw new Error('The MariaDB gateway returned an invalid response.');
  return payload.result ?? payload.data ?? payload;
}

export function rows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    if (Array.isArray(result[0])) return result[0] as T[];
    return result as T[];
  }
  if (result && typeof result === 'object') {
    const record = result as Record<string, unknown>;
    if (Array.isArray(record.rows)) return record.rows as T[];
    if (Array.isArray(record.result)) return rows<T>(record.result);
  }
  return [];
}

export async function one<T>(statement: string, values: unknown[] = []): Promise<T | null> {
  return rows<T>(await execute(statement, values))[0] ?? null;
}
