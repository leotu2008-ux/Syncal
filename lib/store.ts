import { promises as fs } from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";
import type { StoredUser } from "./types";

/**
 * Per-person storage. Uses Upstash Redis when its env vars are present
 * (Vercel's Upstash integration sets KV_REST_API_URL / KV_REST_API_TOKEN),
 * otherwise a JSON file in .data/ for local development.
 */
interface Backend {
  get(email: string): Promise<StoredUser | null>;
  set(user: StoredUser): Promise<void>;
}

const key = (email: string) => `user:${email}`;

function redisBackend(): Backend | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const redis = new Redis({ url, token });
  return {
    get: (email) => redis.get<StoredUser>(key(email)),
    set: async (user) => {
      await redis.set(key(user.email), user);
    },
  };
}

function fileBackend(): Backend {
  if (process.env.VERCEL) {
    throw new Error(
      "No storage configured. Add the Upstash Redis integration to this Vercel project. See README.md.",
    );
  }
  const file = path.join(process.cwd(), ".data", "users.json");
  const readAll = async (): Promise<Record<string, StoredUser>> => {
    try {
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      return {};
    }
  };
  return {
    get: async (email) => (await readAll())[key(email)] ?? null,
    set: async (user) => {
      const all = await readAll();
      all[key(user.email)] = user;
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, JSON.stringify(all, null, 2));
    },
  };
}

let backend: Backend | undefined;
function getBackend(): Backend {
  backend ??= redisBackend() ?? fileBackend();
  return backend;
}

export function getUser(email: string): Promise<StoredUser | null> {
  return getBackend().get(email);
}

export function saveUser(user: StoredUser): Promise<void> {
  return getBackend().set(user);
}
