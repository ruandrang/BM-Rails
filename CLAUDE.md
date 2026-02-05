# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

농구 클럽 관리 웹 애플리케이션 (BM-Rail)
- **프레임워크**: Ruby on Rails 8.1.2
- **Ruby 버전**: 3.3.5 (rbenv)
- **데이터베이스**: SQLite3
- **프론트엔드**: Tailwind CSS v4 + DaisyUI v5 + Stimulus.js

## 주요 명령어

```bash
# 개발 서버 실행 (웹서버 + CSS 컴파일러 동시 실행)
bin/dev

# 데이터베이스 설정
bin/rails db:create db:migrate
bin/rails db:reset              # 초기화 후 재마이그레이션

# 콘솔
bin/rails console

# 린트
rubocop                         # Ruby 코드 스타일 검사
rubocop -a                      # 자동 수정

# 보안 검사
brakeman                        # 정적 보안 분석
bundle audit                    # 의존성 보안 감사
```

## 아키텍처

### 모델 관계도

```
User (1)
  └── Clubs (N)

Club (1)
  ├── Members (N)      # 선수 명단
  └── Matches (N)      # 경기 목록

Match (1)
  ├── Teams (2~3)      # 팀 (2팀 or 3팀전)
  └── Games (N)        # 개별 게임 결과

Team (1)
  └── TeamMembers ──── Members (N:N 조인)
```

### 서비스 객체 (app/services/)

| 서비스 | 역할 |
|--------|------|
| `TeamBalancer` | 포지션 균형 + 승률 기반 팀 자동 배정 |
| `StatsCalculator` | 선수별 승/패/무 통계 집계 |
| `ClubExporter` | 클럽 데이터 JSON 내보내기 |
| `ClubImporter` | 클럽 데이터 JSON 가져오기 |

### 주요 라우트 구조

```
/                           → 클럽 목록 (홈)
/clubs/:club_id/members     → 선수 관리
/clubs/:club_id/matches     → 경기 관리
/clubs/:club_id/stats       → 통계 대시보드
/admin                      → 관리자 패널
```

## 인증/인가

- **인증**: 세션 기반 (bcrypt 패스워드 해싱)
- **인가**: `users.admin` 플래그로 관리자 구분
- `ApplicationController`에서 `before_action :require_login` 적용

## 코드 컨벤션

- **스타일**: rubocop-rails-omakase (Rails 공식 권장)
- **뷰**: ERB 템플릿 + Tailwind/DaisyUI 클래스
- **JS**: Stimulus 컨트롤러 (app/javascript/controllers/)

## 데이터베이스 스키마 요약

| 테이블 | 주요 컬럼 | 비고 |
|--------|-----------|------|
| users | email, password_digest, admin | 인증 |
| clubs | user_id, name, icon | 12가지 아이콘 |
| members | club_id, name, position, jersey_number | Guard/Forward/Center |
| matches | club_id, played_on, teams_count | 2팀 또는 3팀전 |
| teams | match_id, label, color | 6가지 색상 |
| games | match_id, home_team_id, away_team_id, result | 경기 결과 |

## 개발 시 참고사항

- `bin/dev` 실행 시 Procfile.dev에 정의된 웹서버와 Tailwind 워처가 동시에 실행됨
- 실시간 기능을 위한 ActionCable 인프라 구축됨 (app/channels/)
- 한글 CSV 처리 시 UTF-8 BOM 인코딩 필요
