# 대규모 파일 분할 리팩토링 작업

## 작업 목표
비대해진 JS/Ruby 파일들을 적절한 크기로 분할하고, 기존 기능이 깨지지 않도록 검증한다.

## 작업 규칙
- 모호한 부분은 네가 판단해서 진행하고, 판단 근거를 docs/refactor-decisions.md에 기록해
- 문제가 생기면 docs/refactor-issues.md에 기록하고 다음 단계로 넘어가
- 각 단계 완료 시 한국어로 커밋해
- 기존 기능을 절대 깨뜨리지 마. 분할만 하고 로직 변경은 하지 마
- 파일 하나 분할할 때마다 테스트/동작 확인 후 다음 파일로 넘어가

## 1단계: 현재 상태 분석

다음을 확인하고 docs/refactor-analysis.md에 정리해:
- app/javascript/ 폴더의 모든 JS 파일 목록과 각 줄 수
- app/controllers/ 폴더의 모든 Ruby 파일 목록과 각 줄 수
- app/models/ 폴더의 모든 Ruby 파일 목록과 각 줄 수
- app/views/ 에서 인라인 JS가 50줄 이상인 파일 목록
- 100줄 이상인 파일을 "분할 대상"으로 표시
- 각 파일의 역할과 의존 관계를 간단히 정리

## 2단계: JS 파일 분할

application.js 및 기타 큰 JS 파일을 분할해:
- Stimulus 컨트롤러 패턴 사용 (이미 사용 중이면 그 패턴 따르기)
- 관련 기능끼리 묶어서 별도 파일로 분리
- import/export 정리
- 뷰에서 인라인으로 들어있는 JS는 Stimulus 컨트롤러로 추출
- 분할 후 브라우저에서 동작할 수 있도록 import 경로 확인
- 분할한 파일마다 상단에 한국어 주석으로 역할 설명 추가

분할 후 확인:
- bin/rails assets:precompile 이 에러 없이 통과하는지 확인
- 기존 Stimulus 컨트롤러가 정상 연결되는지 확인

## 3단계: Ruby 파일 분할 (필요 시)

컨트롤러나 모델이 200줄 이상이면:
- 컨트롤러: concerns로 추출하거나 서비스 객체로 분리
- 모델: concerns로 추출 (예: Scoreable, Statsable 등)
- 기존 테스트가 있으면 실행해서 통과 확인
- bin/rubocop 실행해서 위반 없는지 확인

## 4단계: 최종 검증

- bin/rails assets:precompile 통과
- bin/rubocop 통과
- bin/brakeman 통과 (보안 검사)
- 기존 테스트가 있으면 전부 실행
- 분할 전후 기능 목록 대조 (빠진 기능 없는지)

## 5단계: 리포트 작성

docs/refactor-report.md에 다음 내용 정리:
- 분할한 파일 목록 (before → after)
- 각 파일의 줄 수 변화
- 발견된 문제와 해결 방법
- 추가로 개선하면 좋을 점
