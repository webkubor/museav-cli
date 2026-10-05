#!/usr/bin/env python3
"""自动化任务执行台账 —— 让"跑了什么"变成能亲眼核对的东西。

## 为什么要有这个（别再存个没人看得见的地方）

owner 的原话：「你电脑里面随便存个地方，你执没执行我不知道，我也看不到。」

DSH 的调度真源在 `~/.dsh/storages/schedule.json`，它记的是**任务定义**，
每条只有 `status` 和空的 `deliveryHistory` —— **跑没跑、跑出了什么，一个字段都没有**。
launchd 那 20 个任务更糟：日志在 `/tmp` 或各任务自己的路径，格式不一、没人去翻。

所以台账必须满足三条：
1. **单一真源**：所有自动化任务跑完都往这一个文件追加，人和 agent 读同一份
2. **有内容**：不只记"跑过"，记下这次**改了什么 / 发现了什么 / 剩什么没做**
3. **能主动汇报**：配一个 `daily` 汇总，早 9 点把昨天的事推给 owner
   （否则还是等于没人看）

## 格式：JSONL（append-only）
一行一条记录，`jq` / `grep` / 任何工具都能读；不需要起数据库、不需要装东西。
坏行跳过不阻断（`report` 有容错，`write` 出错即退出非零）。

## 用法
    # 记一条（自动化任务跑完调这个）
    ~/dev/muse/museav-cli/scripts/automation-log.sh run "任务名" "改了什么" "发现了什么" "没做什么"

    # 追加结构化补充（如耗时、MR 链接）
    ~/dev/muse/museav-cli/scripts/automation-log.sh run "沸雪收口" "合了 3 个 MR" "" "" --meta '{"mr":[7,8]}'

    # 看最近 N 条
    ~/dev/muse/museav-cli/scripts/automation-log.sh recent 20

    # 早报：昨天到现在，按任务分组，只列"有动作"的
    ~/dev/muse/museav-cli/scripts/automation-log.sh daily

    # 自检：台账文件是否可读、格式是否还对
    ~/dev/muse/museav-cli/scripts/automation-log.sh doctor
"""
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone

TZ = timezone(timedelta(hours=8))  # Asia/Taipei，日账按本地日切
LEDGER = os.path.expanduser("~/.dsh/automation-ledger.jsonl")


def now_iso():
    return datetime.now(TZ).isoformat(timespec="seconds")


def write_entry(task, action, found, remaining, meta):
    entry = {
        "ts": now_iso(),
        "task": task,
        "action": action or "",
        "found": found or "",
        "remaining": remaining or "",
        "pid": os.getpid(),
    }
    if meta:
        try:
            entry["meta"] = json.loads(meta)
        except json.JSONDecodeError:
            entry["meta_raw"] = meta
    os.makedirs(os.path.dirname(LEDGER), exist_ok=True)
    with open(LEDGER, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    return entry


def read_all(limit=None):
    if not os.path.exists(LEDGER):
        return []
    rows = []
    with open(LEDGER, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                # 坏行不阻断整个报告：台账自己不能成为故障点
                continue
    return rows[-limit:] if limit else rows


def cmd_run(argv):
    task = argv[0] if argv else "(未命名)"
    action = argv[1] if len(argv) > 1 else ""
    found = argv[2] if len(argv) > 2 else ""
    remaining = argv[3] if len(argv) > 3 else ""
    meta = None
    if "--meta" in argv:
        i = argv.index("--meta")
        meta = argv[i + 1] if len(argv) > i + 1 else None
    e = write_entry(task, action, found, remaining, meta)
    print(f"📝 已记账 {e['ts']} · {task}")
    if action:
        print(f"   动作: {action}")
    if found:
        print(f"   发现: {found}")
    if remaining:
        print(f"   遗留: {remaining}")
    return 0


def cmd_recent(argv):
    n = int(argv[0]) if argv else 20
    rows = read_all(n)
    if not rows:
        print("台账是空的 —— 说明还没有自动化任务跑过。")
        print(f"真源路径: {LEDGER}")
        return 0
    print(f"最近 {len(rows)} 条（共 {len(read_all())} 条）· 真源 {LEDGER}\n")
    for r in rows:
        flag = "⚠️" if r.get("remaining") else "·"
        print(f"{r['ts']} {flag} [{r['task']}]")
        for k in ("action", "found", "remaining"):
            if r.get(k):
                print(f"    {k}: {r[k]}")
    return 0


def cmd_daily(argv):
    """按本地日切，只列有动作的；owner 要的是'今天系统自己干了什么'。"""
    since = datetime.now(TZ) - timedelta(days=1)
    rows = [r for r in read_all() if r.get("ts", "") >= since.isoformat(timespec="seconds")]
    if not rows:
        print("过去 24 小时没有记账。")
        return 0
    by_task = {}
    for r in rows:
        by_task.setdefault(r["task"], []).append(r)
    print(f"📋 自动化台账 · 过去 24 小时 · {len(rows)} 条 / {len(by_task)} 个任务")
    print(f"真源: {LEDGER}\n")
    acted = 0
    for task, items in sorted(by_task.items()):
        acts = [i for i in items if i.get("action")]
        founds = [i for i in items if i.get("found")]
        left = [i for i in items if i.get("remaining")]
        if not (acts or founds):
            continue
        acted += 1
        print(f"【{task}】 跑了 {len(items)} 次")
        for a in acts:
            print(f"   ✅ {a['action']}")
        for fo in founds:
            print(f"   🔍 {fo['found']}")
        for lo in left:
            print(f"   ⏳ 待办: {lo['remaining']}")
        print()
    quiet = [t for t, i in by_task.items() if not any(x.get("action") or x.get("found") for x in i)]
    if quiet:
        print(f"（本轮无动作的任务: {'、'.join(quiet)}）")
    if not acted:
        print("（全部任务本轮只检查、未动手 —— 这是正常的，不是故障）")
    return 0


def cmd_doctor(argv):
    ok = True
    print(f"台账真源: {LEDGER}")
    if not os.path.exists(LEDGER):
        print("  ⚠️ 文件还不存在（还没有任务跑过）。任务第一次跑会自动创建。")
    else:
        rows = read_all()
        bad = 0
        with open(LEDGER, encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    try:
                        json.loads(line)
                    except json.JSONDecodeError:
                        bad += 1
        print(f"  ✅ 可读，{len(rows)} 条有效记录，{bad} 条坏行（坏行会被跳过，不影响报告）")
        if rows:
            print(f"  最近一次: {rows[-1]['ts']} · {rows[-1]['task']}")
    sch = os.path.expanduser("~/.dsh/storages/schedule.json")
    if os.path.exists(sch):
        try:
            d = json.load(open(sch, encoding="utf-8"))
            tasks = d.get("tables", {}).get("tasks", {})
            n = len(tasks) if hasattr(tasks, "__len__") else 0
            print(f"  ✅ DSH 调度真源: {sch}（{n} 个任务）")
        except json.JSONDecodeError as e:
            print(f"  ❌ DSH 调度文件解析失败: {e}")
            ok = False
    else:
        print(f"  ⚠️ 找不到 DSH 调度真源 {sch}")
    return 0 if ok else 1


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 0
    cmd, rest = sys.argv[1], sys.argv[2:]
    fn = {"run": cmd_run, "recent": cmd_recent, "daily": cmd_daily, "doctor": cmd_doctor}.get(cmd)
    if not fn:
        print(f"未知子命令 {cmd}；可用: run / recent / daily / doctor")
        return 1
    return fn(rest)


if __name__ == "__main__":
    sys.exit(main())
