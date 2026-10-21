"""Set every <lastmod> in sitemap.xml to the date that URL's file last changed in git.

Google only trusts lastmod if it is consistently accurate, and hand-written
dates drift: on 2026-10-19 matrimony.html was edited while the sitemap still
said 2026-09-20. Deriving the date from git makes it correct by construction.

Full W3C timestamps (git %cI), not dates: two edits on the same day must
still produce two different lastmod values, or Google sees no change.

Stdlib only. Prints one line per URL and exits 0 whether or not anything
changed; the workflow decides what to do from `git diff`.
"""
import pathlib
import re
import subprocess
import sys

SITE = "https://hamzaaziz.dev/"
SITEMAP = pathlib.Path("sitemap.xml")

ENTRY = re.compile(r"(<loc>" + re.escape(SITE) + r"([^<]*)</loc>\s*<lastmod>)([^<]+)(</lastmod>)")


def file_for(path: str) -> pathlib.Path:
    # "" is the homepage; "dir/" is that directory's index.html; an extensionless
    # "page" is page.html (GitHub Pages serves /matrimony from matrimony.html, even
    # though a matrimony/ redirect directory also exists).
    if path == "" or path.endswith("/"):
        return pathlib.Path(path) / "index.html"
    html = pathlib.Path(path + ".html")
    if "." not in pathlib.Path(path).name and html.is_file():
        return html
    return pathlib.Path(path)


def last_changed(f: pathlib.Path) -> str | None:
    out = subprocess.run(
        ["git", "log", "-1", "--format=%cI", "--", str(f)],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    return out or None


def main() -> int:
    text = SITEMAP.read_text(encoding="utf-8")
    missing = []

    def fix(m: re.Match) -> str:
        path, old = m.group(2), m.group(3)
        f = file_for(path)
        new = last_changed(f)
        if new is None:
            missing.append(f"/{path} -> {f}")
            return m.group(0)
        print(f"{'UPDATED' if new != old else 'ok     '}  {old} -> {new}  /{path}")
        return m.group(1) + new + m.group(4)

    updated = ENTRY.sub(fix, text)
    if missing:
        # A sitemap URL with no tracked file behind it is a real defect, not
        # something to paper over with a guessed date.
        print("No git history for:", *missing, sep="\n  ", file=sys.stderr)
        return 1
    if updated != text:
        SITEMAP.write_text(updated, encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
