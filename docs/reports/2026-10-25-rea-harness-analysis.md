# rea 저장소 분석 보고서

- 날짜: 2026-10-25
- 대상: https://github.com/morluto/rea (MIT, TypeScript)
- 방법: GitHub API로 README, AGENTS, DISCLAIMER, `reverse-engineer-anything` 스킬 전체, references 4종, docs(architecture, cli, limits-and-recovery, browser-observation), Kuna 사례, `src/contracts/*ToolContracts.ts`를 읽었어요. 저장소를 내려받거나 코드를 실행하지는 않았어요.

## 1. 한 줄 정의

**rea는 npm 패키지(`rea-agents`) 하나에 MCP 서버, CLI, 에이전트 스킬 묶음이 같이 들어 있는 구조예요.** MCP와 CLI는 같은 분석 로직을 공유하고, 스킬은 `.agents/skills/reverse-engineer-anything`에 있어요.

- **설치**: `npx rea-agents setup`이 에이전트에 MCP 서버를 등록하고 스킬을 깔아요. 바꿀 내용을 먼저 보여 주고, 승인을 받은 뒤 백업하고 써요.
- **분석 엔진은 대부분 사용자가 직접 준비해요.** Ghidra, IDA(ida-pro-mcp 경유), Kuna, JADX, JEB, Binwalk/Unblob, tshark, sigrok, WABT, pwntools/pwndbg, objdump/Rizin, GDB, Frida, LLDB(macOS)가 여기에 해당해요. rea가 직접 설치하는 건 승인 시 Hopper 하나뿐이에요.
- **그 밖의 연동**
  - Cutter는 실행 중인 Cutter에 bridge로 붙어요.
  - mitmproxy는 저장된 캡처를 읽는 용도예요.
  - 브라우저는 Chrome DevTools Protocol로 관찰해요. 사용자가 조작하는 걸 지켜보는 수동 관찰과, 에이전트가 미리 선언한 동작을 실행하는 시나리오 방식이 있어요.
- **내장 파서**: Go, Rust, IL2CPP, PE/ELF, APK 서명, SQLite, GGUF 등은 외부 엔진 없이 정적으로 읽어요.
- **MCP 도구는 150개가 넘어요.** 대표적으로 `open_binary`, `analyze_function`, `analyze_javascript_application`, `capture_browser_scenario`, `inspect_web_network_capture`, `start_frida_session`, `gdb_console`, `inspect_analysis_view`, `record_unknown`, `export_evidence_bundle`, `correlate_static_and_runtime`, `verify_reconstruction`이 있어요.

## 2. 스킬이 정한 분석 순서

1. **필요할 때만 연결해요.** 도구가 있으면 바로 대상으로 가요. 막혔을 때만 복구 가이드를 봐요.
2. **대상 형식에 맞는 첫 도구를 골라요.** ASAR이면 JavaScript 분석, APK면 Android 도구, 네이티브면 `open_binary`예요. "my app"처럼 대상이 모호하면 먼저 물어봐요.
3. **질문 체크리스트를 만들어요.** 질문마다 필요한 증거를 정하고, 기존 세션과 증거는 다시 써요.
4. **요약부터 받아요.** `detail:"summary"`로 받은 뒤, 서버에 보관된 증거에서 필요한 페이지만 `inspect_analysis_view`로 꺼내요.
5. **정적 분석이 먼저예요.** 답이 안 나올 때만 실행 관찰로 넘어가요. 실행 전에 대상, 입력, 기대 결과, 실패 신호, 종료 조건을 적어 둬요.
6. **결론에 맞는 종류의 증거로 확인해요.** `correlate_static_and_runtime`, `compare_*`, `verify_reconstruction`을 써요.
7. **결론 기록표를 유지해요.** 결론마다 증거 ID, 증거 종류와 확신 정도, 찾아본 범위, 남은 미해결 질문을 적어요.
8. **마지막에 체크리스트로 돌아가요.** 질문마다 답함·일부·미해결로 표시하고 세션을 닫아요.

핵심 규칙(원문 인용)

- "Every conclusion must distinguish observations, inferences, and unknowns." — SKILL
- "never imply that static analysis observed execution." — SKILL
- "do not infer behavior from filenames, strings, or layout alone." — SKILL
- "matching patterns are hypotheses, not causality." — evidence-workflows
- "Do not repeat an identical analysis or rejected call without a changed input" — SKILL
- "Only qualifying observed evidence can verify a resolution." — evidence-workflows

## 3. 맨 Claude와 rea를 붙인 Claude의 차이

| 항목 | 맨 Claude | Claude + rea |
|---|---|---|
| 도구 | 문자열과 상식으로 추측해요 | 실제 디컴파일러, 디버거, 브라우저 관찰, 캡처 파서의 출력을 받아요 |
| 증거 | 출처 없는 서술이에요 | 결과마다 증거 기록이 붙어요(증거 ID, 대상 파일의 SHA-256, 한계, 분석이 닿은 범위). 관찰·추론·미해결도 구분해요 |
| 상태 | 대화 안에만 있어요 | 증거 장부와 미해결 질문 목록이 서버에 남아요. 다시 조회하거나 파일로 내보낼 수 있어요 |
| 컨텍스트 | 큰 파일을 통째로 붙여 넣어요 | 요약과 페이지 단위로 받아요. 334MB짜리 Obsidian 분석 결과도 요약은 약 10KB예요 |
| 장애 복구 | 없어요 | 오류가 종류별로 와요(`provider_timeout`, `cleanup_incomplete`, `resource_constraint` 등). 서버가 안내하는 조치만 따르고, 같은 호출을 그대로 반복하지 않아요 |
| 환경 확인 | 모르는 상태예요 | `rea doctor`와 `binary_session.tool_availability`로 쓸 수 있는 엔진과 도구를 확인해요 |
| 가드레일 | 모델 정책에만 기대요 | DISCLAIMER가 DRM 우회, 게임 치트, 인증 우회, 독점 코드 복제를 지원 대상에서 빼요. 실행 계열 도구의 부작용도 문서에 밝혀요. 비밀번호는 환경변수로 받아 기록에서 가려요 |
| 검증과 재현성 | 없어요 | 실제 엔진으로 돌리는 CI 워크플로가 있어요(`real-ghidra`, `real-browser` 등). Kuna 사례는 대상과 엔진의 SHA-256을 고정하고 결과 digest를 비교했어요 |

검증되지 않았거나 주의할 점

- Kuna 사례 문서 스스로 토큰 감소나 조사 결과 개선은 입증되지 않았다고 적고 있어요.
- 저장소 main 기준 기능 중 일부는 npm 최신 릴리스에 아직 없을 수 있어요.
- 실제 엔진 검증은 주로 Linux와 macOS에서 했고, Windows용 Ghidra 지원은 실험 단계예요.

## 4. 숏폼 영상 분석에 옮겨 쓸 원칙

1. **관찰·추론·미해결을 나눠 적기**: "0:03에 컷 전환"은 관찰, "특정 모델로 생성"은 추론, "원본 프롬프트 문구"는 미해결이에요.
2. **증거마다 ID와 출처 붙이기**: 프레임 캡처, 타임코드, 메타데이터에 ID를 붙이고 결론에서 인용해요.
3. **요약부터 보고 필요한 구간만 열기**: 장면 목록부터 만든 뒤, 필요한 구간의 프레임과 오디오만 꺼내요.
4. **겉모습만 보고 단정하지 않기**: "느낌상 AI"가 아니라 메타데이터, 압축 흔적, 장면 간 일관성 오류를 근거로 삼아요.
5. **가설을 세우고 재현으로 확인하기**: 추정 프롬프트로 다시 만들어 정해 둔 항목(구도, 카메라 무빙, 컷 길이)만 비교해요. 통과해도 그 항목만 같다는 뜻이에요.
6. **미해결 질문 목록 유지하기**: "BGM 출처", "보정 LUT" 같은 질문을 지지·반박 증거와 함께 추적하고 마지막에 상태를 표시해요.
7. **"없다"는 찾아본 범위 안에서만 말하기**: "워터마크 없음"은 검사한 범위에서 못 찾았다는 뜻이라고 적어요.

## 5. 한계와 주의점

- **엔진을 직접 준비해야 하고 운영체제 제약이 커요.** Frida, GDB, LLDB, 패킷 도구는 Linux나 macOS 전용인 경우가 많아서, Windows에서는 쓸 수 있는 범위가 줄어요.
- **실행 계열 도구는 대상을 바꿀 수 있어요.** Frida, GDB, Rizin, 브라우저 시나리오는 대상의 상태, 파일, 네트워크에 영향을 줄 수 있어요. 문서도 프로세스 캡처가 보안 샌드박스가 아니라고 밝혀요.
- **디컴파일과 재구성 결과는 틀릴 수 있어요.** 결과물을 얻었다고 원본에 대한 권리가 생기지도 않아요(DISCLAIMER).
- **영상은 rea가 다루는 분야가 아니에요.** 비디오나 생성 모델을 분석하는 도구는 없고, 가장 가까운 건 GGUF/safetensors 모델 파일 헤더 읽기예요. 그래서 4번은 방법론만 빌려 쓴 거예요.
