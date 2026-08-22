#!/usr/bin/env bash
# Jenkins 部署辅助脚本（由 Makefile deploy-test / deploy-status 调用）
# 用法：
#   ./scripts/jenkins.sh trigger <job_path> <branch>   触发构建，回显构建号+进度链接
#   ./scripts/jenkins.sh status  <job_path>            查最近一次构建状态
# token 走 cs secrets（CortexOS 二进制真源，不依赖 zsh function），不回显、不硬编码。
# cs 路径自动发现（$CS_BIN > $CORTEXOS_ROOT > 已知位置），无需手动传 CS_BIN。
set -euo pipefail

# cs 二进制真源。优先显式 CS_BIN，其次 $CORTEXOS_ROOT，再退到已知安装位置。
# 不写死单一绝对路径：CortexOS 仓迁过目录（2026-08-19 重组，Documents/ → dev/gitlab/），
# 原来写死的 $HOME/Documents/CortexOS 当天就失效，而失效表现只是「未取到 Jenkins token」，
# 从报错看不出根因在路径上（2026-08-21 部署时踩到，只能手动传 CS_BIN= 绕过）。
# $CORTEXOS_ROOT 由 ~/.zshenv 导出 —— .zshenv 对非交互 shell 也生效，脚本里拿得到。
CS_BIN="${CS_BIN:-}"
if [ -z "$CS_BIN" ] || [ ! -x "$CS_BIN" ]; then
  for cand in \
    "${CORTEXOS_ROOT:+$CORTEXOS_ROOT/bin/cs}" \
    "$HOME/dev/gitlab/webkubor/CortexOS/bin/cs" \
    "$HOME/Documents/CortexOS/bin/cs"; do
    if [ -n "$cand" ] && [ -x "$cand" ]; then CS_BIN="$cand"; break; fi
  done
fi
if [ -z "$CS_BIN" ] || [ ! -x "$CS_BIN" ]; then
  echo "ERROR: 找不到可执行的 cs 二进制。" >&2
  echo "  已试：\$CS_BIN / \$CORTEXOS_ROOT/bin/cs / ~/dev/gitlab/webkubor/CortexOS/bin/cs / ~/Documents/CortexOS/bin/cs" >&2
  echo "  显式指定：CS_BIN=/path/to/cs make deploy-test" >&2
  exit 1
fi

JENKINS_HOST="${JENKINS_HOST:-https://jenkins.ops.modelgo.com}"
JENKINS_USER="${JENKINS_USER:-wangenbo}"
JOB_PATH="${JOB_PATH:-test/modelgo-console-web}"
ACTION="${1:-status}"

# job_path（test/modelgo-console-web）→ Jenkins URL 段（test/job/modelgo-console-web）
job_url() { echo "$1" | sed 's|/|/job/|g'; }

JT="$("$CS_BIN" secrets get secret://jenkins/modelgo 2>/dev/null || true)"
if [ -z "$JT" ]; then
  # 到这里 CS_BIN 已确认可执行，所以问题在密钥库那侧，不是路径 —— 报错要说清是哪一层，
  # 否则和「cs 找不到」混成同一句「未取到 token」，排查时会先去怀疑路径。
  echo "ERROR: cs 可用（$CS_BIN）但未取到 Jenkins token。" >&2
  echo "  自查：$CS_BIN kyvault list | grep jenkins" >&2
  echo "  缺失则写入：$CS_BIN kyvault set secret://jenkins/modelgo" >&2
  exit 1
fi

case "$ACTION" in
  status)
    curl -s -u "$JENKINS_USER:$JT" "$JENKINS_HOST/job/$(job_url "$JOB_PATH")/lastBuild/api/json" \
      | python3 -c 'import sys,json; d=json.loads(sys.stdin.read()); print("构建 #%s  结果: %s  耗时: %.1fmin  %s" % (d.get("number"), d.get("result") or "BUILDING", d.get("duration",0)/60000, d.get("url","")))'
    ;;
  trigger)
    BRANCH="${2:-main}"
    echo "==> 触发 Jenkins $JOB_PATH @ $BRANCH"
    CRUMB="$(curl -s -u "$JENKINS_USER:$JT" "$JENKINS_HOST/crumbIssuer/api/json" \
      | python3 -c 'import sys,json;print(json.loads(sys.stdin.read())["crumb"])')"
    LOC="$(curl -s -D - -o /dev/null -X POST -u "$JENKINS_USER:$JT" -H "Jenkins-Crumb: $CRUMB" \
      "$JENKINS_HOST/job/$(job_url "$JOB_PATH")/buildWithParameters" \
      --data-urlencode "GIT_BRANCH=$BRANCH" | grep -i '^location:' | tr -d '\r')"
    QUEUE="$(echo "$LOC" | python3 -c 'import sys,re; m=re.search(r"/queue/item/(\d+)", sys.stdin.read()); print(m.group(1) if m else "")')"
    if [ -z "$QUEUE" ]; then
      echo "ERROR: 未拿到 queue id，触发可能失败（LOC=$LOC）" >&2
      exit 1
    fi
    echo "已入队 queue/$QUEUE"
    echo "==> 等 Jenkins 分配构建号..."
    EXEC=""
    for i in $(seq 1 10); do
      EXEC="$(curl -s -u "$JENKINS_USER:$JT" "$JENKINS_HOST/queue/item/$QUEUE/api/json?tree=executable[number]" 2>/dev/null \
        | python3 -c 'import sys,json; d=json.loads(sys.stdin.read()); print(d.get("executable",{}).get("number",""))' 2>/dev/null || true)"
      [ -n "$EXEC" ] && break
      sleep 2
    done
    if [ -z "$EXEC" ]; then
      echo "已触发，构建号暂未分配。进度：$JENKINS_HOST/job/$(job_url "$JOB_PATH")/"
      exit 0
    fi
    echo "==> 构建号 #$EXEC"
    echo "进度：$JENKINS_HOST/job/$(job_url "$JOB_PATH")/$EXEC/"
    echo "验收：https://console.test.modelgo.com"
    ;;
  *)
    echo "未知 action: $ACTION（支持: trigger / status）" >&2
    exit 1
    ;;
esac
