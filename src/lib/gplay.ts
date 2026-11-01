// google-play-scraper (ESM). 타입 정의가 부정확해서 느슨하게 사용한다.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import gplayImport from 'google-play-scraper';
import { COUNTRY, LANG } from '../config.js';
import { cached, retry } from './util.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const gplay: any = (gplayImport as any).default ?? gplayImport;
const base = { country: COUNTRY, lang: LANG, throttle: 5 };

export async function topList(category: string, collection: 'TOP_FREE' | 'GROSSING', num: number) {
  return cached(`gp_list_${category}_${collection}_${num}`, () =>
    retry(() => gplay.list({ ...base, category: gplay.category[category], collection: gplay.collection[collection], num }), `gplay list ${category} ${collection}`),
  ) as Promise<any[]>;
}

export async function appDetail(appId: string) {
  return cached(`gp_app_${appId}`, () => retry(() => gplay.app({ ...base, appId }), `gplay app ${appId}`)) as Promise<any>;
}

export async function reviews(appId: string, num: number) {
  return cached(`gp_reviews_${appId}_${num}`, async () => {
    const out: any[] = [];
    let token: string | undefined;
    while (out.length < num) {
      const res: any = await retry(
        () => gplay.reviews({ ...base, appId, sort: gplay.sort.NEWEST, num: 150, paginate: true, nextPaginationToken: token }),
        `gplay reviews ${appId}`,
      );
      out.push(...res.data);
      token = res.nextPaginationToken;
      if (!token || res.data.length === 0) break;
    }
    return out.slice(0, num);
  }) as Promise<any[]>;
}

export async function suggest(term: string) {
  return cached(`gp_suggest_${term}`, () => retry(() => gplay.suggest({ ...base, term }), `gplay suggest ${term}`)) as Promise<string[]>;
}

export async function search(term: string, num: number) {
  return cached(`gp_search_${term}_${num}`, () => retry(() => gplay.search({ ...base, term, num }), `gplay search ${term}`)) as Promise<any[]>;
}
