export const COUNTRY = 'kr';
export const LANG = 'ko';

export interface CategoryConfig {
  key: string;
  label: string;
  /** google-play-scraper category key */
  gplayCategory: string;
  /** Apple genre id; null when Apple has no matching category (e.g. 육아) */
  appleGenre: number | null;
  /** Apple 검색어 (genre가 없을 때 앱 후보를 모으는 용도) */
  appleSearchTerms: string[];
  /** 자동완성 확장용 시드 키워드 */
  seedKeywords: string[];
}

export const CATEGORIES: CategoryConfig[] = [
  {
    key: 'parenting',
    label: '육아',
    gplayCategory: 'PARENTING',
    appleGenre: null,
    appleSearchTerms: ['육아', '아기 기록', '임신', '어린이집', '이유식', '육아 지원금'],
    seedKeywords: ['육아', '아기', '임신', '신생아', '이유식', '어린이집', '육아휴직', '출산', '아이 일정', '육아 가계부'],
  },
  {
    key: 'food',
    label: '음식 및 음료',
    gplayCategory: 'FOOD_AND_DRINK',
    appleGenre: 6023,
    appleSearchTerms: ['레시피', '장보기', '식단', '냉장고'],
    seedKeywords: ['레시피', '요리', '장보기', '식단', '냉장고', '식비', '반찬', '도시락', '밀키트', '유아식'],
  },
];

export const LIMITS = {
  topListSize: 100,
  /** 카테고리별 리뷰를 수집할 상위 앱 수 (인기 순위 기준) */
  reviewAppsFromFree: 20,
  reviewAppsFromGrossing: 10,
  gplayReviewsPerApp: 600,
  appleReviewPages: 10, // 50개/페이지, 최대 10페이지
  appleReviewApps: 12,
  suggestionsPerSeed: 5,
  searchResultsPerKeyword: 10,
};
