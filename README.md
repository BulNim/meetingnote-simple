# 회의록 정리기 (심플 바이브)

녹취 파일을 올리면 받아쓰고, 요약 · 결정 사항 · 할 일로 나눠 저장하는 웹 앱.
9장 실습 결과물 - 설계 문서 없이 프롬프트 한 개로 만들었다.

## 스택

- 백엔드: Node.js (기본 모듈만, 외부 의존성 없음)
- 프론트: HTML / CSS / JavaScript
- 저장: `data/notes.json` (JSON 파일)
- 받아쓰기 · 정리: Gemini API (`gemini-3.1-flash-lite`)

## 설치

의존성 설치 없음. Node.js v24 이상만 있으면 된다. `.env` 에 키를 넣는다.

```
GEMINI_API_KEY=발급받은키
GEMINI_MODEL=gemini-3.1-flash-lite
```

## 실행

```powershell
node server.js
```

브라우저에서 http://localhost:8100

## 기능

- 녹취 파일(mp3 · wav) 업로드 후 받아쓰기
- 받아쓴 글을 요약 · 결정사항 · 할 일 세 갈래로 구분
- 회의록 저장 · 목록 · 상세 보기 · 삭제
- 받아쓰기가 실패하면 2초 · 4초 · 6초 간격으로 세 번까지 다시 시도

## API

| 메서드 | 경로 | 하는 일 |
|---|---|---|
| GET | `/api/notes` | 목록 |
| POST | `/api/notes` | 정리하고 저장 |
| GET | `/api/notes/{id}` | 단건 조회 |
| DELETE | `/api/notes/{id}` | 삭제 |
| POST | `/api/upload` | 녹취 파일 받아쓰기 |

## 폴더 구조

```
D:\meetingnote-simple\
├── data\notes.json   <- 저장소 (JSON 파일)
├── public\           <- 프런트엔드
│   ├── app.js
│   ├── index.html
│   └── styles.css
└── server.js         <- 백엔드 (Node)
```

## 한계

- DB 없음 (JSON 파일) - 동시 접속 · 검색 한계
- 로그인 없음
- 테스트 없음
- 세 갈래 구분 기준이 고정돼 있지 않아 실행마다 결과가 달라진다
