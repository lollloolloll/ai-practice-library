# Prompt Lexicon · 프롬프트 언어 사전

같은 원본에 용어 하나만 넣었을 때 결과가 어떻게 달라지는지 나란히 보여 주는 사전이에요.
이미지·동영상·영상 편집·음악·3D·디자인·글쓰기·코딩, 8개 분야의 용어 1,374개와 조합 133개, 기법 210개, 브리프 틀 12개가 들어 있어요.

## 실행

```bash
python -m http.server 8765
```

브라우저에서 http://127.0.0.1:8765 를 열어요. 파일을 직접 열면(file://) 이미지 효과가 동작하지 않아요.

## 구조

| 층 | 내용 | 위치 |
|---|---|---|
| ① 용어 | 단어 하나와 그 효과 | `research/<분야>.json` → `data/dict.js` |
| ② 조합 | 함께 쓰면 잘 맞는 용어 묶음 | 같은 파일의 `combos` |
| ③ 기법 | 참고 이미지, 시드, 부분 수정 같은 프롬프트 밖의 방법 | `research/interaction.json` |
| ④ 브리프 | 실제로 만들 때 AI에게 주는 맥락 | `interaction.json`의 `brief_templates` |

결과는 두 가지예요.

- **이론 결과**: 원리를 재현한 도해예요. `js/r-<분야>.js`가 원본(`assets/primary/`)에 용어를 적용해 그려요.
- **실제 결과**: AI가 실제로 만든 결과물이에요. 글쓰기·코딩은 `data/results-*.js`에 있고, 이미지·영상·음악·3D·디자인은 직접 추가해요.
- **영상 편집**: 자막·전환·효과·색보정·오디오 편집처럼 브라우저에서 실제로 만들 수 있는 편집은 진짜 결과로, AI 편집(배경 바꾸기 등)은 도해로 보여 줘요.

## 고치고 넣는 법

- **용어·설명 수정**: `research/<분야>.json`(원문) 또는 `research/ko/<분야>.json`(문체 수정본)을 고친 뒤 `python -I tools/build_data.py`
- **실제 결과 추가**:
  ```bash
  python -I tools/add_result.py image rim-light 결과.png --model "Midjourney V7" --prompt "..."
  ```
  `assets/results/`에 복사되고 사이트의 '실제 결과' 칸에 나타나요. `--list`로 목록을, `--remove`로 삭제를 해요.
- **사이트에서 바로 올리기**: '실제 결과' 칸의 '결과 올리기'로 올리면 그 브라우저에만 저장돼요. 개인 연습용이에요.
- **코딩 결과 점검**: 서버를 켠 뒤 `tools/test-coding.html`을 열면 실행 가능한 결과 전체를 돌려 오류를 모아 줘요.

## 문체

토스 라이팅 원칙(https://toss.tech/article/8-writing-principles-of-toss)을 따라요. 해요체, 한 문장에 한 메시지, 꼭 필요한 말만 써요.

## 원본 출처

인물 Christopher Campbell · 거리 Laura Bilger · 머그 NordWood Themes (Unsplash License) / 회화 John Constable 〈The Hay Wain〉(퍼블릭 도메인) / 영상 Kmeel.com Videos (Pexels License) / 의자 SheenChair (Khronos, CC0) / HDRI studio_small_08 (Poly Haven, CC0) / 기타 루프 ValentinSosnitskiy · 낭독 Sample_Me (Freesound, CC0)
