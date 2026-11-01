import fs from 'node:fs';
import path from 'node:path';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function retry<T>(fn: () => Promise<T>, label: string, tries = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const wait = 1000 * 2 ** i;
      console.warn(`  ! ${label} 실패 (${(e as Error).message}), ${wait}ms 후 재시도`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

const CACHE_DIR = path.resolve('data/cache');

/** 같은 요청을 다시 돌릴 때 네트워크를 아끼기 위한 단순 파일 캐시 */
export async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const file = path.join(CACHE_DIR, key.replace(/[^a-zA-Z0-9가-힣._-]/g, '_') + '.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  const v = await fn();
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(v));
  return v;
}

export function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

export function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

/** 동시 실행 수를 제한해서 map */
export async function pMap<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
