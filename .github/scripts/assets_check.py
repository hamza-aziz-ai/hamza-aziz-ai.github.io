"""Fail if a page references a local file that is not in the repo.

Checks src= and href= values that point inside the site (relative paths or
paths starting with /), resolved from each page's folder. External URLs,
anchors, mailto: and tel: are skipped.
Run from the repo root:  python -I .github/scripts/assets_check.py *.html projects/*.html
"""
import os
import re
import sys
from urllib.parse import unquote, urlsplit

ATTR = re.compile(r'''\b(?:src|href)\s*=\s*["']([^"']+)["']''', re.I)
COMMENT = re.compile(r'<!--.*?-->', re.S)
# Served at hamzaaziz.dev but not from this repo: the Cloudflare Google tag
# gateway, and the hamza-aziz-cv repo's Pages site.
ELSEWHERE = ('/iitk/', '/hamza-aziz-cv/')


def local_target(page, ref):
    parts = urlsplit(ref)
    if parts.scheme or parts.netloc or not parts.path or ref.startswith('#'):
        return None
    path = unquote(parts.path)
    if path.startswith(ELSEWHERE):
        return None
    base = '.' if path.startswith('/') else os.path.dirname(page)
    target = os.path.normpath(os.path.join(base, path.lstrip('/')))
    if path.endswith('/'):
        target = os.path.join(target, 'index.html')
    elif not os.path.splitext(target)[1] and os.path.isfile(target + '.html'):
        target += '.html'  # GitHub Pages serves /page from page.html
    return target


def main(pages):
    missing = 0
    for page in pages:
        with open(page, encoding='utf-8') as f:
            text = COMMENT.sub('', f.read())
        for ref in sorted(set(ATTR.findall(text))):
            target = local_target(page, ref)
            if target and not os.path.exists(target):
                print(f'MISSING  {page}: {ref}  ->  {target}')
                missing += 1
    print(f'{missing} missing')
    return 1 if missing else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
