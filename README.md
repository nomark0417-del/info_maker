# A4 스마트 맞춤형 안내판 스튜디오 Pro

행사 안내판, 직무연수 안내, 협의회 안내 등 기관·업무용 A4 안내판을 빠르고 품격 있게 제작·인쇄·보관하는 웹앱입니다.

## 🌐 배포 주소 및 저장소
- **라이브 웹앱**: https://info-maker.friendly-rule-564.workers.dev
- **GitHub 저장소**: https://github.com/nomark0417-del/info_maker

## ✨ 주요 기능
- **업무 맞춤형 템플릿**: 🎓 직무연수 안내, 🤝 협의회 회의 안내, 🎉 행사·세미나 안내, ➡️ 행사장 방향 안내, 📋 등록·접수처 안내 등 14종 빠른 템플릿 + 16종 디자인 룩북 스타일
- **정밀 글자 크기 조절**: 전체 글자 크기 일괄 배율(`85% ~ 130%`) 및 영역별 슬라이더(메인 타이틀, 보조 설명, 요약 표, 체크리스트, 상단 뱃지, 하단 발행처), 줄간격·자간·여백 제어
- **보관함 (Cloudflare D1 연동)**: 제작한 안내판을 저장하고, 추후 불러와 세부 문구·날짜·글자 크기를 고친 뒤 **수정 저장(덮어쓰기)** 하거나 **새 안내판으로 복제 저장**

## 🚀 Cloudflare Workers 자동 배포 안내 (`info-maker.friendly-rule-564.workers.dev`)
1. GitHub 저장소 **Settings → Secrets and variables → Actions**에 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` 시크릿이 등록되어 있는지 확인합니다.
2. `wrangler.toml`의 `[[d1_databases]]` `database_id`를 실제 Cloudflare D1 ID로 설정합니다.
3. [`a4.html`](./a4.html) 또는 API 코드를 수정하고 `main` 브랜치에 `git push`하면 GitHub Actions가 테스트·빌드 후 `https://info-maker.friendly-rule-564.workers.dev`로 자동 배포합니다.
4. 수동 배포 시에는 `npm run deploy`를 실행하면 됩니다.
