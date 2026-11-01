// 키워드별 검색 상위 앱 중 최근 1년 내 출시된 '신규 진입 앱' 비율과 그 성과
import fs from 'node:fs';
import { CATEGORIES } from './config.js';
import { readJson, writeJson } from './lib/util.js';
import type { KeywordRecord } from './types.js';

const parseDate = (s?: string) => {
  if (!s) return undefined;
  const m = s.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : undefined;
};
const CUTOFF = new Date('2025-11-01');
const out: any[] = [];
for (const cat of CATEGORIES) {
  const kws = readJson<KeywordRecord[]>(`data/raw/${cat.key}/keywords.json`);
  for (const k of kws) {
    const rows = k.results.map((r) => {
      const f = `data/cache/gp_app_${r.appId}.json`;
      const d = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
      return { title: r.title, released: parseDate(d.released), installs: d.minInstalls ?? 0 };
    });
    const fresh = rows.filter((r) => r.released && r.released >= CUTOFF);
    const old = rows.filter((r) => r.released && r.released < CUTOFF);
    const median = (a: number[]) => (a.length ? a.sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
    out.push({
      category: cat.key, keyword: k.keyword, n: rows.length, fresh: fresh.length,
      freshMaxInstalls: Math.max(0, ...fresh.map((r) => r.installs)),
      freshMedianInstalls: median(fresh.map((r) => r.installs)),
      oldMedianInstalls: median(old.map((r) => r.installs)),
      freshTitles: fresh.map((r) => `${r.title.slice(0, 18)}(${r.installs})`),
    });
  }
}
writeJson('data/analysis/newcomers.json', out);
for (const r of out.filter((r) => r.fresh >= 2).sort((a, b) => b.fresh - a.fresh))
  console.log(`${r.category.padEnd(9)} ${r.keyword.padEnd(12)} 신규 ${r.fresh}/${r.n}  신규 최대설치 ${r.freshMaxInstalls}  신규 중앙 ${r.freshMedianInstalls}  기존 중앙 ${r.oldMedianInstalls}`);
const all = out.reduce((a, r) => a + r.n, 0), fr = out.reduce((a, r) => a + r.fresh, 0);
console.log(`\n전체 검색 상위 결과 중 최근 1년 출시: ${fr}/${all}`);
