#!/usr/bin/env bash
# Render 배포 시 빌드 스크립트
set -o errexit

bundle install
npm ci

bundle exec rails assets:precompile
bundle exec rails db:prepare
