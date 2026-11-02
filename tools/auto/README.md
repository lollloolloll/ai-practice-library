# 자동 실제 결과

PC가 켜져 있을 때 하루 10개씩, ChatGPT 구독(Codex CLI)으로 이미지 용어의 실제 결과를 만들어 사이트에 올려요.

## 흐름

1. **고르기** (`run.py`): 실제 결과가 없는 이미지 용어를 고르고, 이론 결과와 같은 원본(`js/r-image.js`의 PRIM)을 정해요. 프롬프트는 `원본 프롬프트, 용어`로 고정해요.
2. **만들기** (GPT): 원본 이미지를 함께 주고 그 용어 하나만 적용하게 해요. 규칙은 [AGENTS.md](AGENTS.md), 답 형식은 [schema.json](schema.json)이에요. 작업 폴더 밖에는 쓸 수 없어요.
3. **검사** (`run.py`): 파일, 크기, 원본과 같은지 확인해요. 실패 2번이거나 GPT가 건너뛰면 [skipped.json](skipped.json)에 남기고 다시 하지 않아요.
4. **올리기** (`run.py`): `assets/results/image/`에 넣고 `data/results-media.*`에 등록해서 `main`에 푸시해요. 사이트에는 "GPT 자동 생성"으로 표시돼요.

## 어디서 도나

- 작업 폴더가 아니라 `%LOCALAPPDATA%\lexicon-auto\repo` 복사본에서 돌아요. 원래 폴더는 `git pull`만 하면 결과가 따라와요.
- 예약 작업 `LexiconAuto`: 로그인 10분 뒤, 매일 13시(놓치면 켜졌을 때). 하루 몫을 채웠으면 바로 끝나요.
- 기록: `%LOCALAPPDATA%\lexicon-auto\logs\날짜.log`, 저장소에는 [log.md](log.md)

## 손볼 때

- 하루 분량, 분야 순서: `run.py`의 `DAILY`, `ORDER`, `SKIP_CATS`
- 다시 시도: `skipped.json`에서 그 용어를 지워요
- 결과 지우기: `python -I tools/add_result.py image <용어id> --remove`
- 끄기: `Unregister-ScheduledTask -TaskName LexiconAuto -Confirm:$false`
