#!/usr/bin/env python3
"""控件格式覆盖检查（ui-guard BLOCK 11 的实现）。

2026-09-04 控件统一：ui/Input、ui/Select、ui/Combobox 的尺寸已成本走 token 档位
（size 属性：sm 32 / md 40 / lg 48，字号一律 13px、圆角一律档位 token）。
页面再叠 h-8 / h-9 / text-xs / rounded-lg 等类，就是「长的长、扁的扁」的根源：
有的被组件未分层 CSS 压掉变成死代码，有的真生效把同一控件改成另一副面孔。

用法：check-control-format-overrides.py <file...>（stdin 也行）
输出：命中行（无命中则静默，exit 0）。
豁免：文件里写 `ui-guard-ignore: 控件格式 —— <理由>`。
"""
import re
import sys

BAD = re.compile(
    r'(?<![\w-])(?<!min-)(?<!max-)('
    r'h-\d+\b|h-\['                                   # 高度（min-h-*/max-h-* 放行）
    r'|text-(?:xs|sm|base|lg|xl)\b'                   # 字号
    r'|rounded-(?:sm|md|lg|full)\b'                    # 圆角
    r')'
)


def strip_braces(seg: str) -> str:
    prev = None
    while prev != seg:
        prev = seg
        seg = re.sub(r'\{[^{}]*\}', '', seg)
    return seg


def find_tags(src: str):
    """产出 (组件名, 直接属性区文本)。属性区用小型扫描器取：
    从 <Input/Select/Combobox 之后开始，跨字符串与 {...} 属性值（跳过其内容），
    直到标签自身的 '>'。这样 prefix={<LuSearch className="w-4 h-4"/>} 里的
    内嵌 className 不会被当成控件自己的属性。"""
    out = []
    for m in re.finditer(r'<(Input|Select|Combobox)\b(?!\.)', src):  # <Select.Option 不算
        name = m.group(1)
        i = m.end()
        n = len(src)
        while i < n:
            ch = src[i]
            if ch == '"' or ch == "'":
                q = ch
                i += 1
                while i < n and src[i] != q:
                    i += 1
                i += 1
            elif ch == '{':
                depth = 1
                i += 1
                while i < n and depth > 0:
                    c = src[i]
                    if c == '"' or c == "'":
                        q = c
                        i += 1
                        while i < n and src[i] != q:
                            i += 1
                    elif c == '{':
                        depth += 1
                    elif c == '}':
                        depth -= 1
                    i += 1
            elif ch == '>':
                break
            else:
                i += 1
        out.append((name, src[m.end():i]))
    return out


def check(src: str):
    findings = []
    for name, attrs in find_tags(src):
        # {...} 属性值原文还在 attrs 里（扫描只用于找到标签结束位置），
        # 查 className 前先剥掉，避免内嵌元素的 className 被误报。
        attrs = strip_braces(attrs)
        for cm in re.finditer(r'className=(?:"([^"]*)"|\'([^\']*)\')', attrs):
            cls = (cm.group(1) or cm.group(2) or '').strip()
            hit = BAD.search(cls)
            if hit:
                findings.append(
                    f'{name}: className 含 {hit.group(0)}'
                    f'（尺寸/字号/圆角只认 size 属性）'
                )
                break
    return findings


def main():
    files = sys.argv[1:]
    out = []
    for f in files:
        try:
            src = open(f, encoding='utf-8').read()
        except OSError:
            continue
        if re.search(r'ui-guard-ignore:[^\n]*控件格式[^\n]*——', src):
            continue
        out.extend(check(src))
    if out:
        print('\n'.join(out))


if __name__ == '__main__':
    main()
