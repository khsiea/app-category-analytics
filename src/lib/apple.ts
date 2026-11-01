// 애플 공개 엔드포인트(itunes.apple.com)만 사용한다.
import { COUNTRY } from '../config.js';
import { cached, retry, sleep } from './util.js';

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const text = await res.text();
  return JSON.parse(text.trim() || '{}');
}

export interface AppleRankItem { id: string; title: string; developer: string; rank: number; genre?: string }

export async function topList(genre: number, kind: 'topfreeapplications' | 'topgrossingapplications', limit: number): Promise<AppleRankItem[]> {
  return cached(`ap_list_${genre}_${kind}_${limit}`, async () => {
    const j = await retry(() => getJson(`https://itunes.apple.com/${COUNTRY}/rss/${kind}/limit=${limit}/genre=${genre}/json`), `apple ${kind}`);
    const entries: any[] = j.feed?.entry ?? [];
    return entries.map((e, i) => ({
      id: e.id.attributes['im:id'],
      title: e['im:name'].label,
      developer: e['im:artist']?.label ?? '',
      rank: i + 1,
      genre: e.category?.attributes?.label,
    }));
  });
}

export async function lookup(ids: string[]): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const j = await cached(`ap_lookup_${chunk.join('_').slice(0, 150)}_${chunk.length}`, () =>
      retry(() => getJson(`https://itunes.apple.com/lookup?id=${chunk.join(',')}&country=${COUNTRY}&entity=software`), 'apple lookup'),
    );
    out.push(...(j.results ?? []));
  }
  return out;
}

export async function search(term: string, limit = 50): Promise<any[]> {
  return cached(`ap_search_${term}_${limit}`, async () => {
    const j = await retry(
      () => getJson(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=${COUNTRY}&entity=software&limit=${limit}`),
      `apple search ${term}`,
    );
    return j.results ?? [];
  });
}

export async function reviews(id: string, pages: number): Promise<any[]> {
  return cached(`ap_reviews_${id}_${pages}`, async () => {
    const out: any[] = [];
    for (let p = 1; p <= pages; p++) {
      let j: any;
      try {
        j = await retry(() => getJson(`https://itunes.apple.com/${COUNTRY}/rss/customerreviews/page=${p}/id=${id}/sortby=mostrecent/json`), `apple reviews ${id} p${p}`, 3);
      } catch {
        break;
      }
      let entries: any[] = j.feed?.entry ?? [];
      if (!Array.isArray(entries)) entries = [entries];
      const revs = entries.filter((e) => e['im:rating']);
      if (revs.length === 0) break;
      out.push(
        ...revs.map((e) => ({
          score: Number(e['im:rating'].label),
          title: e.title?.label,
          text: e.content?.label ?? '',
          date: e.updated?.label,
          version: e['im:version']?.label,
          thumbsUp: Number(e['im:voteSum']?.label ?? 0),
        })),
      );
      await sleep(300);
    }
    return out;
  });
}
