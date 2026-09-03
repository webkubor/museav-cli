#!/usr/bin/env python3
"""图标语义 vs 语义色 一致性检查（供 scripts/ui-guard.sh 调用）。

由来：2026-09-02 模型详情页的免费额度提示条用 LuInfo 图标配 mg-warning 配色，
被需求方反馈「黄色感觉和 warning 一样，有点吓人」。写代码时图标选对了（这是条
告知信息），但颜色走了另一套推理（限频→限制→风险→warning），两个判断没有交叉
校验。ui-guard 原有规则只查形式违规（硬编码颜色、禁用圆角），token 用的是合法的
mg-warning，形式完全合规，所以拦不住这种语义错配。

只查语义无歧义的图标。LuCircleAlert / LuAlertCircle 这类通用告警图标语义模糊
（开票失败配 mg-danger 是对的，接近限额配 mg-warning 也是对的），一律不查 ——
误报会让门禁失去公信力，接着就是所有人想办法绕过它。

用法：check-icon-color-semantics.py <file.tsx>
输出：每行一条 "行号:说明"，无命中则无输出。
"""
import re
import sys

# 图标 → 它明确表达的语义。只收无歧义的。
ICON_SEMANTICS = [
    (r'\bLuInfo\b', 'info', '信息告知'),
    (r'\bLu(?:TriangleAlert|AlertTriangle)\b', 'warning', '需要注意'),
    (r'\bLu(?:CircleCheck|CheckCircle)\b', 'success', '成功/完成'),
]

# 语义色 → 它表达的严重程度
COLOR_SEMANTICS = ('info', 'warning', 'success', 'danger')

# 允许的搭配：图标语义 → 可接受的颜色语义
COMPATIBLE = {
    'info': {'info'},
    'warning': {'warning', 'danger'},   # 三角警告配 danger 属加重，可接受
    'success': {'success'},
}

WINDOW = 2  # 图标与配色需在同一 JSX 元素附近才算一对，窗口越宽误报越多


def check(path):
    try:
        lines = open(path, encoding='utf-8').read().split('\n')
    except OSError:
        return []

    findings = []
    for idx, line in enumerate(lines):
        for pattern, icon_sem, desc in ICON_SEMANTICS:
            if not re.search(pattern, line):
                continue
            lo, hi = max(0, idx - WINDOW), min(len(lines), idx + WINDOW + 1)
            for near in range(lo, hi):
                for color in COLOR_SEMANTICS:
                    if not re.search(rf'\bmg-{color}\b', lines[near]):
                        continue
                    if color in COMPATIBLE[icon_sem]:
                        continue
                    icon = re.search(pattern, line).group(0)
                    findings.append(
                        f'{idx + 1}:{icon} 表示「{desc}」(语义 {icon_sem})，'
                        f'但第 {near + 1} 行用了 mg-{color} 配色 —— '
                        f'图标与配色的严重程度不一致，用户按颜色读'
                    )
                    break
                else:
                    continue
                break
    return findings


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(0)
    for f in sys.argv[1:]:
        for hit in check(f):
            print(hit)
