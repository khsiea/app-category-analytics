export type Store = 'gplay' | 'apple';

export interface AppRecord {
  store: Store;
  id: string;
  title: string;
  developer: string;
  category: string; // 수집 대상 카테고리 key
  genre?: string;
  freeRank?: number;
  grossingRank?: number;
  score?: number;
  ratings?: number;
  reviewsCount?: number;
  installs?: string;
  minInstalls?: number;
  histogram?: Record<string, number>;
  free?: boolean;
  offersIAP?: boolean;
  iapRange?: string;
  adSupported?: boolean;
  containsAds?: boolean;
  released?: string;
  updated?: number | string;
  url?: string;
  summary?: string;
  source: string[]; // 어디서 발견됐는지 (top_free, grossing, search:육아 ...)
}

export interface ReviewRecord {
  store: Store;
  appId: string;
  appTitle: string;
  category: string;
  score: number;
  title?: string;
  text: string;
  date?: string;
  thumbsUp?: number;
  version?: string;
}

export interface KeywordRecord {
  category: string;
  seed: string;
  keyword: string;
  results: {
    appId: string;
    title: string;
    developer: string;
    score?: number;
    minInstalls?: number;
    ratings?: number;
    genre?: string;
    updated?: number;
    titleHasKeyword: boolean;
  }[];
}
