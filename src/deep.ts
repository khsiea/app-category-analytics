// 스캔(scan.ts)에서 고른 주제를 키워드·리뷰로 깊게 판다.
// 주제별: 시드 → 자동완성 확장 → 검색 상위 10개 앱의 강도·신규 진입 → 상위 앱 리뷰 불만/요청.
// 사용: npm run deep [-- 주제키]
import * as gp from './lib/gplay.js';
import { pMap, writeJson } from './lib/util.js';
import { COMPLAINTS, WISH } from './taxonomy.js';

interface Theme { key: string; label: string; seeds: string[]; reviewApps: number }

export const THEMES: Theme[] = [
  { key: 'budget', label: '가계부·공동 돈관리', reviewApps: 8, seeds: ['가계부', '공유가계부', '부부가계부', '커플가계부', '모임회비', '용돈기입장', '여행가계부', '고정지출'] },
  { key: 'gov', label: '공공·지원금·청약', reviewApps: 8, seeds: ['청약', '지원금', '정부지원금', '연말정산', '실업급여', '국민연금', '건강보험', '자격증 시험일정'] },
  { key: 'saju', label: 'AI 사주·운세', reviewApps: 8, seeds: ['사주', '운세', '타로', '궁합', '만세력', '작명'] },
  { key: 'smallbiz', label: '소상공인·셀러 도구', reviewApps: 8, seeds: ['소상공인', '스마트스토어', '플레이스 순위', '매출관리', '직원관리', '급여계산', '예약관리', '사장님'] },
  { key: 'study', label: '시험·어학 공부', reviewApps: 8, seeds: ['단어장', 'JLPT', '토익스피킹', '자격증', '공무원 공부', '강의 녹음'] },
];

const SUGGEST_PER_SEED = 4;
const REVIEWS_PER_APP = 300;
const only = process.argv[2];
const parseKoDate = (s?: string) => {
  const m = s?.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : undefined;
};
const YEAR = 365 * 864e5;
const median = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const man = (n: number) => (n >= 1e4 ? `${Math.round(n / 1e4)}만` : `${n}`);

for (const t of THEMES) {
  if (only && only !== t.key) continue;
  console.log(`\n######## ${t.label}`);

  // 1. 키워드 확장
  const kws: { seed: string; keyword: string }[] = [];
  for (const seed of t.seeds) {
    let sug: string[] = [];
    try { sug = await gp.suggest(seed); } catch { /* 무시 */ }
    for (const k of [seed, ...sug.slice(0, SUGGEST_PER_SEED)]) if (!kws.some((x) => x.keyword === k)) kws.push({ seed, keyword: k });
  }

  // 2. 키워드별 검색 상위 10개 앱
  const apps = new Map<string, any>();
  const kwStats = await pMap(kws, 2, async ({ seed, keyword }) => {
    let res: any[] = [];
    try { res = await gp.search(keyword, 10); } catch { /* 무시 */ }
    const rows = await pMap(res.slice(0, 10), 3, async (r: any) => {
      let d: any = {};
      try { d = await gp.appDetail(r.appId); } catch { /* 무시 */ }
      const row = {
        appId: r.appId, title: r.title, installs: d.minInstalls ?? 0, score: d.score ?? 0, ratings: d.ratings ?? 0,
        released: parseKoDate(d.released), iap: !!d.offersIAP, iapRange: d.IAPRange, ads: !!d.adSupported,
        updatedDaysAgo: d.updated ? Math.round((Date.now() - d.updated) / 864e5) : undefined,
      };
      apps.set(r.appId, row);
      return row;
    });
    const fresh = rows.filter((r) => r.released && Date.now() - r.released < YEAR);
    const old = rows.filter((r) => r.released && Date.now() - r.released >= YEAR);
    return {
      seed, keyword, n: rows.length,
      top3: rows.slice(0, 3).map((r) => `${r.title.slice(0, 16)}(${man(r.installs)},★${r.score.toFixed(1)})`),
      top3MaxInstalls: Math.max(0, ...rows.slice(0, 3).map((r) => r.installs)),
      avgScore: +(rows.reduce((a, r) => a + r.score, 0) / (rows.length || 1)).toFixed(2),
      iapApps: rows.filter((r) => r.iap).length,
      fresh: fresh.length, freshMaxInstalls: Math.max(0, ...fresh.map((r) => r.installs)),
      freshMedian: median(fresh.map((r) => r.installs)), oldMedian: median(old.map((r) => r.installs)),
      stale: rows.filter((r) => (r.updatedDaysAgo ?? 0) > 365).length,
    };
  });

  // 3. 리뷰: 이 주제 검색에 자주 등장한 앱 중 설치 1만+ 앱을 등장 횟수·설치 순으로
  const appear = new Map<string, number>();
  for (const k of kwStats) for (const r of (await gp.search(k.keyword, 10).catch(() => [])).slice(0, 10)) appear.set(r.appId, (appear.get(r.appId) ?? 0) + 1);
  const targets = [...apps.values()]
    .filter((a) => a.installs >= 1e4)
    .sort((a, b) => (appear.get(b.appId) ?? 0) - (appear.get(a.appId) ?? 0) || b.installs - a.installs)
    .slice(0, t.reviewApps);
  const appReview = await pMap(targets, 2, async (a) => {
    let rs: any[] = [];
    try { rs = await gp.reviews(a.appId, REVIEWS_PER_APP); } catch { /* 무시 */ }
    rs = rs.filter((r) => (r.text ?? '').trim().length >= 5);
    const low = rs.filter((r) => r.score <= 3);
    const complaints: Record<string, number> = {};
    for (const r of low) for (const [name, re] of COMPLAINTS) if (re.test(r.text)) complaints[name] = (complaints[name] ?? 0) + 1;
    const byThumbs = [...rs].sort((x, y) => (y.thumbsUp ?? 0) - (x.thumbsUp ?? 0));
    const clip = (r: any) => ({ score: r.score, thumbs: r.thumbsUp ?? 0, text: r.text.replace(/\s+/g, ' ').slice(0, 240) });
    return {
      appId: a.appId, title: a.title, installs: a.installs, score: a.score, iap: a.iap, iapRange: a.iapRange, ads: a.ads,
      n: rs.length, lowPct: pct(low.length, rs.length), wishPct: pct(rs.filter((r) => WISH.test(r.text)).length, rs.length),
      topComplaints: Object.entries(complaints).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([k, v]) => `${k} ${pct(v, low.length)}%`),
      lowSamples: byThumbs.filter((r) => r.score <= 3 && r.text.length >= 25).slice(0, 8).map(clip),
      wishSamples: byThumbs.filter((r) => WISH.test(r.text) && r.text.length >= 20).slice(0, 8).map(clip),
    };
  });

  writeJson(`data/analysis/deep-${t.key}.json`, { theme: t, kwStats, appReview });

  console.log('\n# 키워드: 신규/전체 · 신규최대 · 기존중앙 · 상위3최대 · ★평균 · 유료앱 | 상위3');
  for (const k of [...kwStats].sort((a, b) => a.top3MaxInstalls - b.top3MaxInstalls))
    console.log(`${k.keyword.padEnd(14)} ${k.fresh}/${k.n} · ${man(k.freshMaxInstalls)} · ${man(k.oldMedian)} · ${man(k.top3MaxInstalls)} · ★${k.avgScore} · ${k.iapApps} | ${k.top3.join(' / ')}`);
  console.log('\n# 리뷰: 앱(설치,★) n 저평점% 요청% | 주요불만');
  for (const a of appReview) console.log(`${a.title.slice(0, 24).padEnd(24)} (${man(a.installs)},★${a.score.toFixed(1)},${a.iap ? `IAP ${a.iapRange ?? ''}` : '무료'}) n=${a.n} 저=${a.lowPct}% 요청=${a.wishPct}% | ${a.topComplaints.join(', ')}`);
}
