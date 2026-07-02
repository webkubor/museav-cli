PKG := pnpm
MODE ?= development

.PHONY: help install dev build build-test build-prod preview test lint clean

help:
	@echo "Available targets:"
	@echo "  make install     - install dependencies"
	@echo "  make dev         - start local dev server with MODE (default: development)"
	@echo "  make build       - production build (default mode)"
	@echo "  make build-test  - build with test env"
	@echo "  make build-prod  - build with production env"
	@echo "  make preview     - preview built bundle"
	@echo "  make test        - run unit tests"
	@echo "  make lint        - run eslint"
	@echo "  make clean       - remove dist and vite cache"
	@echo "  make tag         - create a minute-precision git tag on main and push"
	@echo "  make deploy-test - 部署测试环境（Jenkins，默认 main，可 BRANCH=xxx）"
	@echo "  make deploy-status - 查最近一次 Jenkins 构建状态"

node_modules: package.json pnpm-lock.yaml
	$(PKG) install
	@touch node_modules

install: node_modules

dev: node_modules
	$(PKG) exec vite --host --mode $(MODE)

build: node_modules
	$(PKG) run build

build-test: node_modules
	$(PKG) run build:test

build-prod: node_modules
	$(PKG) run build:prod

preview: node_modules
	$(PKG) run preview

test: node_modules
	$(PKG) run test

lint: node_modules
	$(PKG) run lint

clean:
	rm -rf dist node_modules/.vite .vite

# ─── git tag（时间形式，精确到分钟）─────────────────────────────────────────
# make tag   仅允许在 main 分支执行：创建形如 202606291430（YYYYMMDDHHMM）的
#            注解 tag，push 到 origin，并校验远程确实存在该 tag。
RELEASE_BRANCH ?= main

.PHONY: tag
tag:
	@set -e; \
	branch=$$(git rev-parse --abbrev-ref HEAD); \
	if [ "$$branch" != "$(RELEASE_BRANCH)" ]; then \
	  echo "ERROR: 当前在 '$$branch' 分支，tag 只能在 '$(RELEASE_BRANCH)' 分支打"; exit 1; fi; \
	new_tag=$$(date +%Y%m%d%H%M); \
	if git rev-parse -q --verify "refs/tags/$$new_tag" >/dev/null; then \
	  echo "ERROR: tag $$new_tag 已存在"; exit 1; fi; \
	echo "==> 创建 tag $$new_tag"; \
	git tag -a "$$new_tag" -m "release $$new_tag"; \
	echo "==> push $$new_tag -> origin"; \
	git push origin "$$new_tag"; \
	echo "==> 校验远程 tag $$new_tag"; \
	if git ls-remote --tags origin "refs/tags/$$new_tag" | grep -q "$$new_tag"; then \
	  echo "OK: origin 已存在 tag $$new_tag"; \
	else \
	  echo "ERROR: 远程未找到 tag $$new_tag"; exit 1; fi; \
	git --no-pager log -1 --format='指向 commit %h  %ci  %s' "$$new_tag"

# ─── 部署测试环境（走 Jenkins，非 GitLab CI）───────────────────────────────
# make deploy-test            触发 Jenkins test/modelgo-console-web 构建 main
# make deploy-test BRANCH=xxx 部署指定分支（须先 push origin）
# make deploy-status          查最近一次 Jenkins 构建状态（不触发）
# 一步到位：逻辑在 scripts/jenkins.sh（trigger/status）。token 走 cs secrets，
# 不回显、不硬编码；cs 是 zsh function 故脚本里直接调 CortexOS 二进制真源。
# 红线：触发前确保目标分支已 push origin；Jenkins 从远端拉，不读本地工作区。
JOB_PATH ?= test/modelgo-console-web

.PHONY: deploy-test deploy-status
deploy-test: BRANCH ?= main
deploy-test:
	@JOB_PATH=$(JOB_PATH) bash scripts/jenkins.sh trigger $(BRANCH)

deploy-status:
	@JOB_PATH=$(JOB_PATH) bash scripts/jenkins.sh status
