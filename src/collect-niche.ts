// 키워드 분석에서 나온 니치 키워드의 검색 상위 앱 리뷰를 추가 수집한다.
// (collect.ts 실행 후 실행)
import * as gp from './lib/gplay.js';
import { pMap, readJson, writeJson } from './lib/util.js';
import type { KeywordRecord, ReviewRecord } from './types.js';

export const NICHE_KEYWORDS: Record<string, string[]> = {
  parenting: ['이유식', '이유식계산기', '어린이집 입소대기', '어린이집', '육아휴직계산기', '육아휴직', '육아기록', '아이 일정', '육아 가계부'],
  food: ['레시피', '레시피북', '요리레시피', '냉장고파먹기', '냉장고 관리', '식비가계부', '식비', '장보기리스트', '식단표', '유아식', '유아식단표', '밀키트'],
};
const PER_KEYWORD = 4;
const REVIEWS_PER_APP = 400;

for (const [cat, kws] of Object.entries(NICHE_KEYWORDS)) {
  const keywords = readJson<KeywordRecord[]>(`data/raw/${cat}/keywords.json`);
  const existing = readJson<ReviewRecord[]>(`data/raw/${cat}/reviews.json`);
  const have = new Set(existing.filter((r) => r.store === 'gplay').map((r) => r.appId));

  const targets = new Map<string, { title: string; keyword: string }>();
  for (const kw of kws) {
    const rec = keywords.find((k) => k.keyword === kw);
    if (!rec) { console.warn(`! 키워드 없음: ${kw}`); continue; }
    rec.results.slice(0, PER_KEYWORD).forEach((r) => {
      if (!have.has(r.appId) && !targets.has(r.appId)) targets.set(r.appId, { title: r.title, keyword: kw });
    });
  }
  console.log(`[niche] ${cat}: ${targets.size}개 앱`);
  const out: (ReviewRecord & { nicheKeyword: string })[] = [];
  await pMap([...targets.entries()], 2, async ([id, t]) => {
    try {
      const rs = await gp.reviews(id, REVIEWS_PER_APP);
      rs.forEach((r) => out.push({
        store: 'gplay', appId: id, appTitle: t.title, category: cat, nicheKeyword: t.keyword,
        score: r.score, text: r.text ?? '', date: r.date, thumbsUp: r.thumbsUp, version: r.version,
      }));
      console.log(`  - [${t.keyword}] ${t.title}: ${rs.length}`);
    } catch (e) {
      console.warn(`  ! ${id}: ${(e as Error).message}`);
    }
  });
  writeJson(`data/raw/${cat}/reviews-niche.json`, out);
}
