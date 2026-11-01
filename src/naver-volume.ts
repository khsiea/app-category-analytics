// 네이버 검색광고 API(키워드 도구)로 월간 검색량을 조회한다.
// 필요 환경변수: NAVER_AD_CUSTOMER_ID, NAVER_AD_API_KEY, NAVER_AD_SECRET
// 네트워크 허용: api.searchad.naver.com
import crypto from 'node:crypto';
import { writeJson } from './lib/util.js';

const { NAVER_AD_CUSTOMER_ID, NAVER_AD_API_KEY, NAVER_AD_SECRET } = process.env;
if (!NAVER_AD_CUSTOMER_ID || !NAVER_AD_API_KEY || !NAVER_AD_SECRET) {
  console.error('NAVER_AD_CUSTOMER_ID / NAVER_AD_API_KEY / NAVER_AD_SECRET 환경변수가 필요합니다.');
  process.exit(1);
}

// 1순위 주제별 시드 키워드 (공백 없이 입력해야 API가 받는다)
export const TOPICS: Record<string, string[]> = {
  '어린이집 입소': ['어린이집입소', '어린이집입소대기', '어린이집대기순번', '어린이집입소순위', '유보통합포털'],
  '보육료·시간제보육': ['보육료', '어린이집보육료', '부모부담금', '시간제보육', '어린이집필요경비'],
  '육아휴직 급여': ['육아휴직급여', '육아휴직급여계산기', '육아휴직급여신청', '6+6부모육아휴직', '출산휴가급여'],
  '지원금': ['부모급여', '아동수당', '첫만남이용권', '출산지원금', '육아지원금'],
};

async function keywordTool(hints: string[]) {
  const uri = '/keywordstool';
  const ts = Date.now().toString();
  const sig = crypto.createHmac('sha256', NAVER_AD_SECRET!).update(`${ts}.GET.${uri}`).digest('base64');
  const url = `https://api.searchad.naver.com${uri}?hintKeywords=${encodeURIComponent(hints.join(','))}&showDetail=1`;
  const res = await fetch(url, {
    headers: { 'X-Timestamp': ts, 'X-API-KEY': NAVER_AD_API_KEY!, 'X-Customer': NAVER_AD_CUSTOMER_ID!, 'X-Signature': sig },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()).keywordList as any[];
}

// "< 10" 같은 값은 5로 본다
const num = (v: unknown) => (typeof v === 'number' ? v : 5);

const result: any[] = [];
for (const [topic, hints] of Object.entries(TOPICS)) {
  const list = await keywordTool(hints); // 한 번에 최대 5개
  const seeds = new Set(hints);
  const rows = list.map((k) => ({
    topic, keyword: k.relKeyword, isSeed: seeds.has(k.relKeyword),
    pc: num(k.monthlyPcQcCnt), mobile: num(k.monthlyMobileQcCnt),
    total: num(k.monthlyPcQcCnt) + num(k.monthlyMobileQcCnt), competition: k.compIdx,
  }));
  result.push(...rows);
  const seedSum = rows.filter((r) => r.isSeed).reduce((a, r) => a + r.total, 0);
  const relSum = rows.reduce((a, r) => a + r.total, 0);
  console.log(`\n## ${topic}  시드 합계 ${seedSum.toLocaleString()} / 연관 포함 ${relSum.toLocaleString()} (월간)`);
  rows.sort((a, b) => b.total - a.total).slice(0, 12).forEach((r) => console.log(`  ${r.keyword.padEnd(16)} ${r.total.toLocaleString().padStart(9)}  경쟁 ${r.competition}${r.isSeed ? ' *' : ''}`));
  await new Promise((r) => setTimeout(r, 500));
}
writeJson('data/analysis/naver-volume.json', result);
