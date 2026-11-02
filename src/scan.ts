// 카테고리 넓게 훑기: 여러 카테고리의 무료·매출 순위와 앱 상세만 모아서
// "작은/새 앱이 돈을 벌고 있는 카테고리"를 찾는다. 리뷰·키워드는 수집하지 않는다.
// 사용: npm run scan            (결과: data/analysis/scan.json + 콘솔 표)
import * as gp from './lib/gplay.js';
import * as ap from './lib/apple.js';
import { pMap, writeJson } from './lib/util.js';

interface ScanCat { key: string; label: string; gplay: string; apple: number | null }

export const SCAN_CATEGORIES: ScanCat[] = [
  { key: 'productivity', label: '생산성', gplay: 'PRODUCTIVITY', apple: 6007 },
  { key: 'finance', label: '금융', gplay: 'FINANCE', apple: 6015 },
  { key: 'health', label: '건강·피트니스', gplay: 'HEALTH_AND_FITNESS', apple: 6013 },
  { key: 'medical', label: '의료', gplay: 'MEDICAL', apple: 6020 },
  { key: 'education', label: '교육', gplay: 'EDUCATION', apple: 6017 },
  { key: 'lifestyle', label: '라이프스타일', gplay: 'LIFESTYLE', apple: 6012 },
  { key: 'books', label: '도서·참고자료', gplay: 'BOOKS_AND_REFERENCE', apple: 6006 },
  { key: 'tools', label: '도구·유틸리티', gplay: 'TOOLS', apple: 6002 },
  { key: 'photo', label: '사진', gplay: 'PHOTOGRAPHY', apple: 6008 },
  { key: 'travel', label: '여행', gplay: 'TRAVEL_AND_LOCAL', apple: 6003 },
  { key: 'business', label: '비즈니스', gplay: 'BUSINESS', apple: 6000 },
  { key: 'house', label: '부동산·홈', gplay: 'HOUSE_AND_HOME', apple: null },
  { key: 'auto', label: '자동차', gplay: 'AUTO_AND_VEHICLES', apple: null },
  { key: 'sports', label: '스포츠', gplay: 'SPORTS', apple: 6004 },
  { key: 'music', label: '음악', gplay: 'MUSIC_AND_AUDIO', apple: 6011 },
  { key: 'social', label: '소셜', gplay: 'SOCIAL', apple: 6005 },
  { key: 'dating', label: '데이트', gplay: 'DATING', apple: null },
  { key: 'beauty', label: '뷰티', gplay: 'BEAUTY', apple: null },
  { key: 'shopping', label: '쇼핑', gplay: 'SHOPPING', apple: 6024 },
  { key: 'entertainment', label: '엔터테인먼트', gplay: 'ENTERTAINMENT', apple: 6016 },
  { key: 'personalization', label: '개인화', gplay: 'PERSONALIZATION', apple: null },
  { key: 'parenting', label: '육아(비교용)', gplay: 'PARENTING', apple: null },
  { key: 'food', label: '음식(비교용)', gplay: 'FOOD_AND_DRINK', apple: 6023 },
];

const only = process.argv[2];
const YEAR = 365 * 864e5;
const now = Date.now();
const parseKoDate = (s?: string) => {
  const m = s?.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : undefined;
};
const hangul = /[가-힣]/;

export interface ScanApp {
  store: 'gplay' | 'apple'; list: 'free' | 'grossing'; rank: number; id: string; title: string; developer: string;
  installs?: number; ratings?: number; score?: number; released?: number; korean: boolean; genre?: string;
}

async function scanGplay(c: ScanCat): Promise<ScanApp[]> {
  const free = await gp.topList(c.gplay, 'TOP_FREE', 100).catch(() => [] as any[]);
  let gross: any[] = [];
  for (const n of [100, 50, 30]) {
    try { gross = await gp.topList(c.gplay, 'GROSSING', n); break; } catch { /* 다음 크기로 */ }
  }
  const rows = [
    ...gross.map((x, i) => ({ x, list: 'grossing' as const, rank: i + 1 })),
    ...free.slice(0, 50).map((x, i) => ({ x, list: 'free' as const, rank: i + 1 })),
  ];
  return pMap(rows, 4, async ({ x, list, rank }) => {
    let d: any = {};
    try { d = await gp.appDetail(x.appId); } catch { /* 상세 실패 */ }
    return {
      store: 'gplay', list, rank, id: x.appId, title: x.title, developer: x.developer,
      installs: d.minInstalls, ratings: d.ratings, score: d.score, released: parseKoDate(d.released),
      korean: hangul.test(`${x.title}${d.description ?? ''}`.slice(0, 400)) && hangul.test(x.title + x.developer), genre: d.genre,
    } satisfies ScanApp;
  });
}

async function scanApple(c: ScanCat): Promise<ScanApp[]> {
  if (!c.apple) return [];
  const free = await ap.topList(c.apple, 'topfreeapplications', 100).catch(() => []);
  const gross = await ap.topList(c.apple, 'topgrossingapplications', 100).catch(() => []);
  const details = new Map((await ap.lookup([...new Set([...free, ...gross].map((x) => x.id))])).map((d) => [String(d.trackId), d]));
  const row = (x: ap.AppleRankItem, list: 'free' | 'grossing'): ScanApp => {
    const d = details.get(x.id) ?? {};
    return {
      store: 'apple', list, rank: x.rank, id: x.id, title: x.title, developer: x.developer,
      ratings: d.userRatingCount, score: d.averageUserRating, released: d.releaseDate ? Date.parse(d.releaseDate) : undefined,
      korean: hangul.test(x.title + x.developer), genre: d.primaryGenreName,
    };
  };
  return [...gross.map((x) => row(x, 'grossing')), ...free.slice(0, 50).map((x) => row(x, 'free'))];
}

const median = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);

/** 매출 순위 안에서 "작은 앱", "젊은 앱", "국내 앱"이 얼마나 있는지 */
function grossingStats(apps: ScanApp[], store: 'gplay' | 'apple') {
  const g = apps.filter((a) => a.store === store && a.list === 'grossing');
  if (!g.length) return null;
  const small = store === 'gplay' ? (a: ScanApp) => (a.installs ?? 0) <= 100_000 : (a: ScanApp) => (a.ratings ?? 0) <= 500;
  const young = (a: ScanApp) => a.released !== undefined && now - a.released < 2 * YEAR;
  return {
    n: g.length,
    small: g.filter(small).length,
    young: g.filter(young).length,
    smallYoung: g.filter((a) => small(a) && young(a)).length,
    korean: g.filter((a) => a.korean).length,
    koreanSmall: g.filter((a) => a.korean && small(a)).length,
    // 사람이 보고 판단할 후보: 작거나 젊은 국내 앱 (매출 순위 순)
    picks: g.filter((a) => a.korean && (small(a) || young(a))).slice(0, 12)
      .map((a) => `${a.rank}.${a.title.slice(0, 22)}(${store === 'gplay' ? `${((a.installs ?? 0) / 1e4).toFixed(0)}만` : `평가${a.ratings ?? 0}`},${a.released ? new Date(a.released).getFullYear() : '?'})`),
  };
}

const results: any[] = [];
for (const c of SCAN_CATEGORIES) {
  if (only && only !== c.key) continue;
  console.log(`[scan] ${c.label}`);
  const apps = [...(await scanGplay(c)), ...(await scanApple(c))];
  const freeG = apps.filter((a) => a.store === 'gplay' && a.list === 'free');
  results.push({
    key: c.key, label: c.label,
    gplay: grossingStats(apps, 'gplay'),
    apple: grossingStats(apps, 'apple'),
    freeTop50: {
      medianScore: +median(freeG.filter((a) => a.score).map((a) => a.score!)).toFixed(2),
      lowRated: freeG.filter((a) => a.score && a.score < 3.5).length,
      lowRatedTitles: freeG.filter((a) => a.score && a.score < 3.5).slice(0, 8).map((a) => `${a.rank}.${a.title.slice(0, 18)}(★${a.score!.toFixed(1)},${((a.installs ?? 0) / 1e4).toFixed(0)}만)`),
    },
    apps,
  });
}

writeJson(only ? `data/analysis/scan-${only}.json` : 'data/analysis/scan.json', results.map(({ apps, ...r }) => r));
writeJson(only ? `data/raw/scan/${only}.json` : 'data/raw/scan/apps.json', results.map((r) => ({ key: r.key, apps: r.apps })));

console.log('\n카테고리        | GP매출 n 작은 젊은 작고젊은 국내 국내작은 | AP매출 n 작은 젊은 작고젊은 국내 국내작은 | 무료50 ★중앙 저평점');
for (const r of results) {
  const f = (s: any) => (s ? `${s.n} ${s.small} ${s.young} ${s.smallYoung} ${s.korean} ${s.koreanSmall}` : '-');
  console.log(`${r.label.padEnd(14)} | ${f(r.gplay).padEnd(22)} | ${f(r.apple).padEnd(22)} | ${r.freeTop50.medianScore} ${r.freeTop50.lowRated}`);
}
console.log('\n# 국내 작은/젊은 매출 앱 후보');
for (const r of results) {
  console.log(`\n## ${r.label}`);
  if (r.gplay?.picks.length) console.log(`  GP: ${r.gplay.picks.join(' · ')}`);
  if (r.apple?.picks.length) console.log(`  AP: ${r.apple.picks.join(' · ')}`);
  if (r.freeTop50.lowRatedTitles.length) console.log(`  무료 저평점: ${r.freeTop50.lowRatedTitles.join(' · ')}`);
}
