import { CATEGORIES } from './config.js';
import { readJson, writeJson } from './lib/util.js';
import { COMPLAINTS, WISH, segmentOf } from './taxonomy.js';
import type { AppRecord, KeywordRecord, ReviewRecord } from './types.js';
import fs from 'node:fs';

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

for (const cat of CATEGORIES) {
  const dir = `data/raw/${cat.key}`;
  const apps = readJson<AppRecord[]>(`${dir}/apps.json`);
  const reviews = [
    ...readJson<ReviewRecord[]>(`${dir}/reviews.json`),
    ...(fs.existsSync(`${dir}/reviews-niche.json`) ? readJson<ReviewRecord[]>(`${dir}/reviews-niche.json`) : []),
  ].filter((r) => r.text && r.text.trim().length >= 5);

  // 1. 세그먼트별 시장 구조 (순위에 든 앱 기준)
  const ranked = apps.filter((a) => a.freeRank || a.grossingRank);
  const segs = new Map<string, any>();
  for (const a of ranked) {
    const s = segmentOf(cat.key, a.title);
    const e = segs.get(s) ?? { segment: s, gplayFree: 0, gplayGrossing: 0, appleFree: 0, appleGrossing: 0, gplayFreeTop30: 0, appleGrossingTop30: 0, gplayGrossingTop30: 0, apps: [] as string[], installsSum: 0 };
    if (a.store === 'gplay') {
      if (a.freeRank) { e.gplayFree++; if (a.freeRank <= 30) e.gplayFreeTop30++; e.installsSum += a.minInstalls ?? 0; }
      if (a.grossingRank) { e.gplayGrossing++; if (a.grossingRank <= 30) e.gplayGrossingTop30++; }
    } else {
      if (a.freeRank) e.appleFree++;
      if (a.grossingRank) { e.appleGrossing++; if (a.grossingRank <= 30) e.appleGrossingTop30++; }
    }
    if (e.apps.length < 6 && !e.apps.includes(a.title)) e.apps.push(a.title);
    segs.set(s, e);
  }

  // 2. 리뷰 불만 분석 (앱별 + 세그먼트별)
  const byApp = new Map<string, any>();
  for (const r of reviews) {
    const key = `${r.store}:${r.appId}`;
    const e = byApp.get(key) ?? { store: r.store, appId: r.appId, title: r.appTitle, segment: segmentOf(cat.key, r.appTitle), n: 0, low: 0, wish: 0, complaints: {} as Record<string, number> };
    e.n++;
    if (r.score <= 3) {
      e.low++;
      for (const [name, re] of COMPLAINTS) if (re.test(r.text)) e.complaints[name] = (e.complaints[name] ?? 0) + 1;
    }
    if (WISH.test(r.text)) e.wish++;
    byApp.set(key, e);
  }
  const appStats = [...byApp.values()].map((e) => ({ ...e, lowPct: pct(e.low, e.n), wishPct: pct(e.wish, e.n) })).sort((a, b) => b.n - a.n);

  const segReview = new Map<string, any>();
  for (const e of appStats) {
    const s = segReview.get(e.segment) ?? { segment: e.segment, apps: 0, n: 0, low: 0, wish: 0, complaints: {} as Record<string, number> };
    s.apps++; s.n += e.n; s.low += e.low; s.wish += e.wish;
    for (const [k, v] of Object.entries(e.complaints)) s.complaints[k] = (s.complaints[k] ?? 0) + (v as number);
    segReview.set(e.segment, s);
  }
  const segReviewStats = [...segReview.values()].map((s) => ({
    ...s, lowPct: pct(s.low, s.n), wishPct: pct(s.wish, s.n),
    topComplaints: Object.entries(s.complaints as Record<string, number>).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${pct(v, s.low)}%`),
  })).sort((a, b) => b.n - a.n);

  // 3. 키워드 기회 점수: 자동완성에 뜨는 키워드인데 상위 앱이 약할수록 높다
  const keywords = readJson<KeywordRecord[]>(`${dir}/keywords.json`);
  const kwStats = keywords.map((k) => {
    const r = k.results;
    const inst = r.map((x) => x.minInstalls ?? 0).sort((a, b) => a - b);
    const median = inst[Math.floor(inst.length / 2)] ?? 0;
    const top3 = r.slice(0, 3).map((x) => x.minInstalls ?? 0);
    const scores = r.filter((x) => x.score).map((x) => x.score!);
    const avgScore = scores.reduce((a, b) => a + b, 0) / (scores.length || 1);
    const stale = r.filter((x) => x.updated && Date.now() - x.updated > 365 * 864e5).length;
    const titleMatch = r.filter((x) => x.titleHasKeyword).length;
    // 약함 지표: 상위3 평균 설치 수가 낮을수록, 평점 낮을수록, 방치 앱 많을수록
    const top3Avg = top3.reduce((a, b) => a + b, 0) / (top3.length || 1);
    const weakness = (top3Avg < 1e5 ? 2 : top3Avg < 1e6 ? 1 : 0) + (avgScore < 4.2 ? 1 : 0) + (stale >= 2 ? 1 : 0) + (titleMatch <= 2 ? 1 : 0);
    return { keyword: k.keyword, seed: k.seed, isSeed: k.keyword === k.seed, top3: r.slice(0, 3).map((x) => `${x.title.slice(0, 20)}(${((x.minInstalls ?? 0) / 1e4).toFixed(0)}만,★${(x.score ?? 0).toFixed(1)})`), median, top3Avg, avgScore: +avgScore.toFixed(2), stale, titleMatch, weakness };
  }).sort((a, b) => b.weakness - a.weakness || a.top3Avg - b.top3Avg);

  // 4. 저평점·요청 리뷰 샘플 (세그먼트별, 공감 많은 순) - 사람이 읽고 해석하기 위한 원문
  const samples: Record<string, { app: string; score: number; thumbs: number; text: string }[]> = {};
  const wishes: Record<string, { app: string; score: number; thumbs: number; text: string }[]> = {};
  for (const r of [...reviews].sort((a, b) => (b.thumbsUp ?? 0) - (a.thumbsUp ?? 0))) {
    const s = segmentOf(cat.key, r.appTitle);
    const item = { app: r.appTitle.slice(0, 20), score: r.score, thumbs: r.thumbsUp ?? 0, text: r.text.replace(/\s+/g, ' ').slice(0, 260) };
    if (r.score <= 3 && r.text.length >= 25) ((samples[s] ??= []).length < 40) && samples[s].push(item);
    if (WISH.test(r.text) && r.text.length >= 20) ((wishes[s] ??= []).length < 40) && wishes[s].push(item);
  }

  const out = { category: cat.key, segments: [...segs.values()].sort((a, b) => b.gplayFree + b.appleFree - (a.gplayFree + a.appleFree)), segReviewStats, appStats, kwStats };
  writeJson(`data/analysis/${cat.key}.json`, out);
  writeJson(`data/analysis/${cat.key}-review-samples.json`, { lowStar: samples, wishes });

  console.log(`\n######## ${cat.label}  (리뷰 ${reviews.length}건)`);
  console.log('\n# 세그먼트 구조 (순위 진입 앱 수)  gp무료/gp무료30 | gp매출/gp매출30 | ap무료 | ap매출/ap매출30 | 설치합');
  for (const s of out.segments) console.log(`${s.segment.padEnd(22)} ${s.gplayFree}/${s.gplayFreeTop30} | ${s.gplayGrossing}/${s.gplayGrossingTop30} | ${s.appleFree} | ${s.appleGrossing}/${s.appleGrossingTop30} | ${(s.installsSum / 1e4).toFixed(0)}만 | ${s.apps.slice(0, 4).join(', ')}`);
  console.log('\n# 세그먼트별 리뷰: 앱수 리뷰수 저평점% 요청% 주요불만');
  for (const s of segReviewStats) console.log(`${s.segment.padEnd(22)} ${s.apps} ${s.n} ${s.lowPct}% ${s.wishPct}% | ${s.topComplaints.join(', ')}`);
  console.log('\n# 앱별 저평점 비율 (리뷰 100건 이상)');
  for (const a of appStats.filter((a) => a.n >= 100).sort((a, b) => b.lowPct - a.lowPct).slice(0, 25)) {
    const top = Object.entries(a.complaints as Record<string, number>).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, v]) => `${k}${pct(v, a.low)}%`).join(' ');
    console.log(`${a.store} ${a.title.slice(0, 26).padEnd(26)} n=${a.n} 저=${a.lowPct}% 요청=${a.wishPct}% | ${top}`);
  }
  console.log('\n# 키워드 기회 (약함 점수 높은 순)');
  for (const k of kwStats.slice(0, 15)) console.log(`${k.weakness} ${k.keyword.padEnd(12)} top3평균=${(k.top3Avg / 1e4).toFixed(1)}만 ★${k.avgScore} 방치=${k.stale} 제목일치=${k.titleMatch} | ${k.top3.join(' / ')}`);
}
