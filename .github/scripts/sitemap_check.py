"""Verify every sitemap <loc> resolves to a file in this repo.

A sitemap entry pointing at a deleted file hands Google a 404 deliberately.
Run from the repo root:  python -I .github/scripts/sitemap_check.py
"""
import os
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
SITE = "https://hamzaaziz.dev/"


def serves(url, timeout=10):
    """True if the URL answers 2xx. Used only when there is no local file."""
    request = urllib.request.Request(url, method="HEAD")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return 200 <= response.status < 300
    except (urllib.error.URLError, OSError):
        return False


def main(path="sitemap.xml"):
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError as exc:
        print(f"FAIL  {path} is not well-formed XML: {exc}")
        return 1

    bad = 0
    for loc in root.iter(NS + "loc"):
        url = (loc.text or "").strip()
        # a bare directory URL is served by its index.html
        local = url.replace(SITE, "") or "index.html"
        if local.endswith("/"):
            local += "index.html"
        elif "." not in os.path.basename(local) and os.path.isfile(local + ".html"):
            # GitHub Pages serves an extensionless URL from page.html
            local += ".html"
        if os.path.exists(local):
            print(f"OK    {url}")
        elif serves(url):
            # Not every sitemap URL has a file here. A user site also serves
            # each project repo at /<repo-name>/, e.g. /hamza-aziz-cv/ comes
            # from the hamza-aziz-cv repo. Those are valid; check them live.
            print(f"OK    {url}  (served, no local file: another repo)")
        else:
            print(f"MISS  {url}  ->  no {local}, and the URL does not serve")
            bad += 1

    print(f"\n{bad} broken entr{'y' if bad == 1 else 'ies'}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:]))
