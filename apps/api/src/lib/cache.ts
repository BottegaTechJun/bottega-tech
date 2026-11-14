import { RedisClient } from "bun";
import type { z } from "zod";

export interface ValkeyStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<unknown>;
  close?(): void;
}

export interface CacheOptions {
  /** Aiven Valkey / Redis URL (e.g. rediss://...). Falls back to in-memory when omitted or unreachable. */
  valkeyUrl?: string;
  /** Injectable store for unit tests. */
  store?: ValkeyStore;
  /** Default TTL in seconds (default: 24 hours). */
  ttlSeconds?: number;
  /** Key prefix in Valkey and memory (default: "cala:"). */
  prefix?: string;
}

interface MemoryEntry {
  raw: string;
  expiresAt: number;
}

export type Cache = ReturnType<typeof createCache>;

/** Computes a deterministic SHA-256 hex digest for any serializable payload. */
export function sha256Key(payload: unknown): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(typeof payload === "string" ? payload : stableStringify(payload));
  return hasher.digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

function createRedisStore(url: string): ValkeyStore {
  const client = new RedisClient(url, {
    tls: { rejectUnauthorized: false },
  });
  return {
    get: (key) => client.get(key),
    set: (key, value, ttlSeconds) => client.set(key, value, "EX", ttlSeconds),
    close: () => client.close(),
  };
}

/**
 * Two-tier cache (in-memory L1 + Aiven Valkey L2) keyed by SHA-256 hash.
 * Ensures instant responses during live demos and survives Valkey hiccups gracefully.
 */
export function createCache(options: CacheOptions = {}) {
  const { valkeyUrl, ttlSeconds = 86_400, prefix = "cala:" } = options;
  const memory = new Map<string, MemoryEntry>();

  let store: ValkeyStore | undefined = options.store;
  if (!store && valkeyUrl) {
    try {
      store = createRedisStore(valkeyUrl);
    } catch {
      store = undefined;
    }
  }

  function fullKey(payload: unknown): string {
    return `${prefix}${sha256Key(payload)}`;
  }

  function getFromMemory(key: string): string | null {
    const entry = memory.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      memory.delete(key);
      return null;
    }
    return entry.raw;
  }

  function setInMemory(key: string, raw: string, ttl: number): void {
    memory.set(key, { raw, expiresAt: Date.now() + ttl * 1000 });
  }

  async function get<Schema extends z.ZodType>(
    schema: Schema,
    payload: unknown,
  ): Promise<z.infer<Schema> | null> {
    const key = fullKey(payload);

    const memRaw = getFromMemory(key);
    if (memRaw !== null) {
      try {
        const parsed = schema.safeParse(JSON.parse(memRaw));
        if (parsed.success) return parsed.data;
      } catch {
        memory.delete(key);
      }
    }

    if (store) {
      try {
        const remoteRaw = await store.get(key);
        if (remoteRaw !== null) {
          const parsed = schema.safeParse(JSON.parse(remoteRaw));
          if (parsed.success) {
            setInMemory(key, remoteRaw, ttlSeconds);
            return parsed.data;
          }
        }
      } catch {
        // Fallback silently to in-memory / upstream when Valkey is unreachable
      }
    }

    return null;
  }

  async function set(payload: unknown, value: unknown, ttl = ttlSeconds): Promise<void> {
    const key = fullKey(payload);
    const raw = JSON.stringify(value);
    setInMemory(key, raw, ttl);

    if (store) {
      try {
        await store.set(key, raw, ttl);
      } catch {
        // Ignore remote write errors; in-memory fallback holds the value
      }
    }
  }

  async function wrap<Schema extends z.ZodType>(
    schema: Schema,
    payload: unknown,
    fetcher: () => Promise<z.infer<Schema>>,
    ttl = ttlSeconds,
  ): Promise<z.infer<Schema>> {
    const cached = await get(schema, payload);
    if (cached !== null) return cached;

    const fresh = await fetcher();
    await set(payload, fresh, ttl);
    return fresh;
  }

  return {
    get,
    set,
    wrap,
    sha256Key,
    close: () => store?.close?.(),
  };
}
