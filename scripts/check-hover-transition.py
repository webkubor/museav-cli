#!/usr/bin/env python3
"""
查「:hover 改了样式却没有 transition」—— 交互反馈是"跳"的不是"过渡"的。

只看**本次新增的行**（ui-guard 传文件名，这里自己取 diff），避免存量刷屏。

为什么只查 CSS 不查 Tailwind 的 `hover:` 工具类：后者在本项目普遍配着
`transition-colors` 之类一起写，且 Tailwind 的 hover 变体本身就是成套用法；
裸 CSS 的 `:hover` 才是"改了颜色忘了过渡"的高发区。

判定放得很松（误报会让门禁失去公信力）：
  1. 新增行里出现 `:hover` 选择器块
  2. 块内改了**视觉属性**（color/background/border/box-shadow/transform/opacity）
  3. 该选择器的基选择器（去掉 :hover）在**整份文件**里没有 transition/animation

第 3 条查的是整份文件而不是新增行 —— 基础样式通常是早就写好的存量，
只要它有 transition，新增 hover 就是对的，不该报。
"""
import re
import subprocess
import sys

VISUAL = re.compile(
    r"^\s*(color|background(-color|-image)?|border(-color|-top-color|-bottom-color)?"
    r"|box-shadow|transform|opacity|filter|backdrop-filter)\s*:",
    re.M,
)
TRANSITION = re.compile(r"\b(transition|animation)\b")


def added_lines(path: str) -> str:
    """本次相对 HEAD 新增的行；拿不到 diff（如新文件未 add）就退回整份文件。"""
    for args in (["git", "diff", "--cached", "-U0", "--", path],
                 ["git", "diff", "-U0", "--", path]):
        try:
            out = subprocess.run(args, capture_output=True, text=True, timeout=10).stdout
        except Exception:
            continue
        if out.strip():
            return "\n".join(l[1:] for l in out.splitlines()
                             if l.startswith("+") and not l.startswith("+++"))
    return ""


def base_selector_has_transition(text: str, selector: str) -> bool:
    """基选择器（去掉 :hover/:focus 等）在整份文件里有没有 transition。

    **刻意放宽**：只要某个规则块的选择器里**出现过**这个基选择器串、且块内有
    transition，就算它有。因为过渡常常挂在更具体的选择器上 ——
    `.rank-row:hover` 没写 transition，但 `.rank-row.is-clickable` 写了，
    实际交互是有过渡的（2026-09-14 实测到的第一个误报就是这个形状）。
    宁可漏报不可误报：门禁一旦开始喊狼来了就没人看了。
    """
    base = re.sub(r":(hover|focus|focus-within|active)\b", "", selector).strip()
    # 复合选择器取最后一段做锚（`.a .b` 取 `.b`），它才是被 hover 的那个元素
    base = base.split(",")[0].strip().split()[-1] if base.strip() else ""
    if not base:
        return False
    for m in re.finditer(r"([^{}]*)\{([^}]*)\}", text):
        if base in m.group(1) and TRANSITION.search(m.group(2)):
            return True
    return False


def main() -> int:
    path = sys.argv[1] if len(sys.argv) > 1 else ""
    if not path.endswith(".css"):
        return 0
    try:
        full = open(path, encoding="utf-8").read()
    except OSError:
        return 0

    added = added_lines(path)
    if ":hover" not in added:
        return 0

    hits = []
    # 在整份文件里找 hover 块，但只报「块头出现在新增行里」的那些
    for m in re.finditer(r"([^{}]*:hover[^{}]*)\{([^}]*)\}", full):
        selector, body = m.group(1).strip(), m.group(2)
        head = selector.splitlines()[-1].strip()
        if head not in added:
            continue
        if not VISUAL.search(body):
            continue
        if TRANSITION.search(body) or base_selector_has_transition(full, selector):
            continue
        line = full[: m.start()].count("\n") + 1
        hits.append(f"{line}: {head} {{ … }} — 改了视觉属性但没有 transition")

    for h in hits:
        print(h)
    return 0


if __name__ == "__main__":
    sys.exit(main())
