# Local TCG Pack Opener

Netlify 정적 배포용 포켓몬/TCG 카드팩 개봉 시뮬레이터입니다.

## 구조

```text
netlify.toml
public/
  index.html
  app.js
  style.css
  data/
    cards.json
netlify/
  functions/
    pokemon-tcg-proxy.js
```

## 로컬 실행

빌드 명령은 필요 없습니다.

```powershell
cd C:\Users\kl903\OneDrive\문서\pkTCG\public
python -m http.server 8765 --bind 127.0.0.1
```

- 앱: `http://127.0.0.1:8765/`
- 관리자 모드: `http://127.0.0.1:8765/?admin=true`

## Netlify 배포

- Publish directory: `public`
- Functions directory: `netlify/functions`
- Node version: `20`
- API 키는 Netlify 환경 변수 `POKEMON_TCG_API_KEY`에 넣습니다.

관리자 동기화는 `/.netlify/functions/pokemon-tcg-proxy`를 통해 Pokemon TCG API를 호출합니다.

## 프록시 테스트

배포 후 아래 URL은 JavaScript 코드가 아니라 JSON을 반환해야 합니다.

```text
/.netlify/functions/pokemon-tcg-proxy?path=/v2/cards&query=pageSize=1
```

## 데이터

`public/data/cards.json`이 있으면 자동 로드하고, 없어도 `public/app.js`의 내장 샘플 카드로 즉시 실행됩니다.
