# app-category-analytics

앱스토어(Google Play, App Store) 한국 스토어의 카테고리 순위, 앱 상세, 리뷰, 자동완성 키워드를 모아서 "수요·불만·지불" 세 가지 신호로 공략할 만한 영역을 찾는 분석 도구예요.

- `src/collect.ts`: 순위·상세·리뷰·키워드 수집 (`src/config.ts`에서 카테고리와 수집량 설정)
- `src/collect-niche.ts`: 니치 키워드 상위 앱 리뷰 추가 수집
- `src/analyze.ts`, `src/taxonomy.ts`: 세그먼트 분류, 불만 유형 집계, 키워드 기회 점수
- `src/newcomers.ts`: 키워드별 신규 진입 앱 비율
- `src/scan.ts`, `src/deep.ts`: 여러 카테고리 넓게 훑기, 주제별 키워드·리뷰 심층 분석
- 결과 보고서: [docs/report-2026-11.md](docs/report-2026-11.md) (육아·음식), [docs/report-2026-11-other-categories.md](docs/report-2026-11-other-categories.md) (그 외 카테고리)

클라우드 환경에서는 `play.google.com`, `itunes.apple.com` 접근이 허용돼 있어야 해요. Node는 `NODE_USE_ENV_PROXY=1`로 프록시를 쓰도록 npm 스크립트에 설정돼 있어요.
