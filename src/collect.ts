import { CATEGORIES, LIMITS, type CategoryConfig } from './config.js';
import * as gp from './lib/gplay.js';
import * as ap from './lib/apple.js';
import { pMap, sleep, writeJson } from './lib/util.js';
import type { AppRecord, KeywordRecord, ReviewRecord } from './types.js';

const only = process.argv[2]; // 특정 카테고리만: npm run collect -- food

async function collectGplay(cat: CategoryConfig) {
  console.log(`[gplay] ${cat.label}: 순위 수집`);
  const free = await gp.topList(cat.gplayCategory, 'TOP_FREE', LIMITS.topListSize);
  // 매출 순위는 Google Play 응답 구조가 불안정해서 크기를 줄여가며 시도하고, 끝내 실패하면 비워둔다.
  let gross: any[] = [];
  for (const n of [LIMITS.topListSize, 50, 30]) {
    try { gross = await gp.topList(cat.gplayCategory, 'GROSSING', n); break; } catch { console.warn(`  ! 매출 순위 ${n}개 실패`); }
  }

  const apps = new Map<string, AppRecord>();
  const touch = (id: string, title: string, developer: string, src: string) => {
    const a = apps.get(id) ?? { store: 'gplay' as const, id, title, developer, category: cat.key, source: [] };
    if (!a.source.includes(src)) a.source.push(src);
    apps.set(id, a);
    return a;
  };
  free.forEach((x, i) => (touch(x.appId, x.title, x.developer, 'top_free').freeRank = i + 1));
  gross.forEach((x, i) => (touch(x.appId, x.title, x.developer, 'grossing').grossingRank = i + 1));

  console.log(`[gplay] ${cat.label}: 앱 상세 ${apps.size}개`);
  await pMap([...apps.values()], 4, async (a) => {
    try {
      const d = await gp.appDetail(a.id);
      Object.assign(a, {
        genre: d.genre,
        score: d.score,
        ratings: d.ratings,
        reviewsCount: d.reviews,
        installs: d.installs,
        minInstalls: d.minInstalls,
        histogram: d.histogram,
        free: d.free,
        offersIAP: d.offersIAP,
        iapRange: d.IAPRange,
        adSupported: d.adSupported,
        containsAds: d.containsAds,
        released: d.released,
        updated: d.updated,
        url: d.url,
        summary: d.summary,
      });
    } catch (e) {
      console.warn(`  ! 상세 실패 ${a.id}: ${(e as Error).message}`);
    }
  });

  // 리뷰 대상: 인기 상위 + 매출 상위
  const targets = [
    ...free.slice(0, LIMITS.reviewAppsFromFree).map((x) => x.appId),
    ...gross.slice(0, LIMITS.reviewAppsFromGrossing).map((x) => x.appId),
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  console.log(`[gplay] ${cat.label}: 리뷰 수집 ${targets.length}개 앱`);
  const reviews: ReviewRecord[] = [];
  await pMap(targets, 2, async (id) => {
    try {
      const rs = await gp.reviews(id, LIMITS.gplayReviewsPerApp);
      const title = apps.get(id)?.title ?? id;
      for (const r of rs) {
        reviews.push({
          store: 'gplay', appId: id, appTitle: title, category: cat.key,
          score: r.score, text: r.text ?? '', date: r.date, thumbsUp: r.thumbsUp, version: r.version,
        });
      }
      console.log(`  - ${title}: ${rs.length}`);
    } catch (e) {
      console.warn(`  ! 리뷰 실패 ${id}: ${(e as Error).message}`);
    }
  });

  // 키워드: 자동완성으로 확장 → 검색 상위 앱의 강도
  console.log(`[gplay] ${cat.label}: 키워드 확장/검색`);
  const kwPairs: { seed: string; keyword: string }[] = [];
  for (const seed of cat.seedKeywords) {
    let sug: string[] = [];
    try { sug = await gp.suggest(seed); } catch { /* ignore */ }
    for (const k of [seed, ...sug.slice(0, LIMITS.suggestionsPerSeed)]) {
      if (!kwPairs.some((p) => p.keyword === k)) kwPairs.push({ seed, keyword: k });
    }
  }
  const keywords: KeywordRecord[] = await pMap(kwPairs, 2, async ({ seed, keyword }) => {
    let res: any[] = [];
    try { res = await gp.search(keyword, LIMITS.searchResultsPerKeyword); } catch (e) { console.warn(`  ! 검색 실패 ${keyword}`); }
    const results = await pMap(res.slice(0, LIMITS.searchResultsPerKeyword), 3, async (r: any) => {
      let d: any = {};
      try { d = await gp.appDetail(r.appId); } catch { /* ignore */ }
      const norm = (s: string) => s.replace(/\s/g, '');
      return {
        appId: r.appId, title: r.title, developer: r.developer,
        score: d.score, minInstalls: d.minInstalls, ratings: d.ratings, genre: d.genre, updated: d.updated,
        titleHasKeyword: norm(r.title ?? '').includes(norm(keyword)),
      };
    });
    return { category: cat.key, seed, keyword, results };
  });

  return { apps: [...apps.values()], reviews, keywords };
}

async function collectApple(cat: CategoryConfig) {
  const apps = new Map<string, AppRecord>();
  const touch = (id: string, title: string, developer: string, src: string) => {
    const a = apps.get(id) ?? { store: 'apple' as const, id, title, developer, category: cat.key, source: [] };
    if (!a.source.includes(src)) a.source.push(src);
    apps.set(id, a);
    return a;
  };

  if (cat.appleGenre) {
    console.log(`[apple] ${cat.label}: 순위 수집`);
    const free = await ap.topList(cat.appleGenre, 'topfreeapplications', LIMITS.topListSize);
    const gross = await ap.topList(cat.appleGenre, 'topgrossingapplications', LIMITS.topListSize);
    free.forEach((x) => (touch(x.id, x.title, x.developer, 'top_free').freeRank = x.rank));
    gross.forEach((x) => (touch(x.id, x.title, x.developer, 'grossing').grossingRank = x.rank));
  }
  console.log(`[apple] ${cat.label}: 검색어로 후보 수집`);
  for (const term of cat.appleSearchTerms) {
    let rs: any[] = [];
    try { rs = await ap.search(term, 50); } catch { console.warn(`  ! 애플 검색 실패: ${term}`); }
    await sleep(3000); // 애플 검색 API는 연속 호출 시 403을 준다
    rs.forEach((r) => touch(String(r.trackId), r.trackName, r.sellerName, `search:${term}`));
  }

  const details = await ap.lookup([...apps.keys()]);
  for (const d of details) {
    const a = apps.get(String(d.trackId));
    if (!a) continue;
    Object.assign(a, {
      genre: d.primaryGenreName,
      score: d.averageUserRating,
      ratings: d.userRatingCount,
      free: d.price === 0,
      released: d.releaseDate,
      updated: d.currentVersionReleaseDate,
      url: d.trackViewUrl,
      summary: (d.description ?? '').slice(0, 300),
    });
  }

  // 리뷰 대상
  let targets: string[];
  const list = [...apps.values()];
  if (cat.appleGenre) {
    const free = list.filter((a) => a.freeRank).sort((a, b) => a.freeRank! - b.freeRank!).slice(0, 8);
    const gross = list.filter((a) => a.grossingRank).sort((a, b) => a.grossingRank! - b.grossingRank!).slice(0, 4);
    targets = [...free, ...gross].map((a) => a.id);
  } else {
    // 카테고리가 없는 경우: 검색 후보 중 관련성 있는 앱을 평가 수 기준으로
    // 생리·배란 앱은 '임신' 검색에 걸리지만 육아 앱이 아니므로 제외
    const rel = /육아|아기|임신|아이|어린이|출산|맘|베이비|태교|이유식|키즈/;
    const excl = /생리|배란|피임|가임/;
    targets = list
      .filter((a) => rel.test(a.title) && !excl.test(a.title))
      .sort((a, b) => (b.ratings ?? 0) - (a.ratings ?? 0))
      .map((a) => a.id);
  }
  targets = targets.filter((v, i, arr) => arr.indexOf(v) === i).slice(0, LIMITS.appleReviewApps);

  console.log(`[apple] ${cat.label}: 리뷰 수집 ${targets.length}개 앱`);
  const reviews: ReviewRecord[] = [];
  for (const id of targets) {
    const rs = await ap.reviews(id, LIMITS.appleReviewPages);
    const title = apps.get(id)?.title ?? id;
    rs.forEach((r) => reviews.push({ store: 'apple', appId: id, appTitle: title, category: cat.key, ...r }));
    console.log(`  - ${title}: ${rs.length}`);
  }
  return { apps: list, reviews };
}

for (const cat of CATEGORIES) {
  if (only && only !== cat.key) continue;
  const g = await collectGplay(cat);
  const a = await collectApple(cat);
  const dir = `data/raw/${cat.key}`;
  writeJson(`${dir}/apps.json`, [...g.apps, ...a.apps]);
  writeJson(`${dir}/reviews.json`, [...g.reviews, ...a.reviews]);
  writeJson(`${dir}/keywords.json`, g.keywords);
  console.log(`✔ ${cat.label}: 앱 ${g.apps.length + a.apps.length}, 리뷰 ${g.reviews.length + a.reviews.length}, 키워드 ${g.keywords.length}`);
}
