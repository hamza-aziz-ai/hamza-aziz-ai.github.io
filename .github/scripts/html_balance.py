"""Fail if any page has a mismatched or unclosed tag.

This is the check that would have caught the commented-out card whose stray
</article> nested one card inside another.
Run from the repo root:  python -I .github/scripts/html_balance.py *.html projects/*.html
"""
import html.parser
import sys

VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}


class Balance(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack, self.errors = [], []

    def handle_starttag(self, tag, attrs):
        if tag not in VOID:
            self.stack.append((tag, self.getpos()))

    def handle_endtag(self, tag):
        if self.stack and self.stack[-1][0] == tag:
            self.stack.pop()
        elif tag not in VOID:
            self.errors.append(f'MISMATCH </{tag}> at line {self.getpos()[0]}')


def main(paths):
    bad = 0
    for path in paths:
        parser = Balance()
        with open(path, encoding='utf-8') as f:
            parser.feed(f.read())
        problems = parser.errors + [f'UNCLOSED <{t}> from line {pos[0]}' for t, pos in parser.stack]
        print(f"{'OK  ' if not problems else 'FAIL'}  {path}")
        for p in problems:
            print(f'      {p}')
        bad += bool(problems)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
