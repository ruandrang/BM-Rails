#!/usr/bin/env bash
# Render 배포 시 빌드 스크립트
set -o errexit

bundle install
npm ci

bundle exec rails assets:precompile
bundle exec rails db:prepare

# ADMIN_EMAIL 환경변수가 설정되어 있으면 해당 사용자에게 관리자 권한 부여
if [ -n "$ADMIN_EMAIL" ]; then
  bundle exec rails admin:grant["$ADMIN_EMAIL"] || true
fi
