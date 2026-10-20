"""Build worker/src/knowledge.js: the plain text the chat assistant may answer from.

Sources are Hamza's own public, professional pages. The CV page lives in the
separate hamza-aziz-cv repo, so it is fetched from the live site.

Two exports: KNOWLEDGE (everything, for Gemini) and KNOWLEDGE_CORE (homepage
and CV only, for the Workers AI fallback). Small fallback models can have an
~8k-token window and their free allowance is spent per token, so they get
the part that answers most recruiter questions, not the case-study depth.

Deliberately excluded: matrimony.html, the bio-data PDF and the marksheets.
They are public, but they are not what a portfolio assistant should discuss.

Private notes: worker/private/*.md (gitignored) become PRIVATE_NOTES in
worker/src/private.js (also gitignored), which only Gemini sees. They stay off
GitHub, but anything in them can be told to a visitor who asks, so write only
what you would say in an interview. The build refuses notes that look like
they hold addresses or credentials, and caps their size: the whole prompt is
sent with every message, and the free tier limits tokens per minute.

Rerun after changing any source page or note:  python -I worker/build_knowledge.py
Stdlib only.
"""
import html
import json
import pathlib
import re
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
LOCAL = [
    ("Homepage", ROOT / "index.html"),
    ("Case study: production voice AI for drive-thru ordering", ROOT / "projects/voice-ai.html"),
    ("Case study: face recognition attendance across 20+ camera streams", ROOT / "projects/cctv-face-recognition.html"),
    ("Case study: computer vision attendance with a PTZ camera", ROOT / "projects/computer-vision-attendance.html"),
    ("Case study: conversational AI for college ERP data", ROOT / "projects/conversational-erp.html"),
]
REMOTE = [("CV", "https://hamzaaziz.dev/hamza-aziz-cv/")]
CORE = ("Homepage", "CV")
OUT = ROOT / "worker/src/knowledge.js"
PRIVATE_DIR = ROOT / "worker/private"
PRIVATE_OUT = ROOT / "worker/src/private.js"
# ~40k tokens. With the site text that is ~50k tokens per message: room for a
# handful of messages a minute on the free tier before the fallback answers.
PRIVATE_MAX_CHARS = 160_000
LEAKY = {
    "an IPv4 address": r"\b(?:\d{1,3}\.){3}\d{1,3}\b",
    "a Google API key": r"AIza[0-9A-Za-z_-]{30,}",
    "an OpenAI-style key": r"\bsk-[A-Za-z0-9_-]{20,}",
    "a GitHub token": r"\bgh[pousr]_[A-Za-z0-9]{30,}",
    "a private key": r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
    "a password": r"(?i)\bpass(?:word|wd)?\s*[:=]",
}
EXCLUDED = ("matrimony", "Hamza-BioData", "class-10.pdf", "class-12.pdf", "college-degree.pdf")


def to_text(raw: str) -> str:
    raw = re.sub(r"<!--.*?-->", " ", raw, flags=re.S)
    # Drop machinery and chrome: code, styles, structured data, navigation,
    # forms and the footer carry no facts and would waste context.
    for tag in ("script", "style", "noscript", "svg", "nav", "form", "footer", "head"):
        raw = re.sub(rf"<{tag}\b.*?</{tag}>", " ", raw, flags=re.S | re.I)
    raw = re.sub(r"<(br|/p|/li|/h[1-6]|/div|/section|/article)\b[^>]*>", "\n", raw, flags=re.I)
    text = html.unescape(re.sub(r"<[^>]+>", " ", raw))
    lines = (re.sub(r"[ \t ]+", " ", ln).strip() for ln in text.splitlines())
    return "\n".join(ln for ln in lines if ln)


def private_notes() -> str:
    """Joined notes, or raises ValueError naming the file and what leaked."""
    notes = []
    for path in sorted(PRIVATE_DIR.glob("*.md")) if PRIVATE_DIR.is_dir() else []:
        text = path.read_text(encoding="utf-8").strip()
        for what, pattern in LEAKY.items():
            if m := re.search(pattern, text):
                # Line number, not the match: a key echoed to the terminal is a leak too.
                line = text.count("\n", 0, m.start()) + 1
                raise ValueError(f"{path.name} line {line} looks like it contains {what}")
        notes.append(f"## {path.stem.replace('-', ' ')}\n{text}")
    joined = "\n\n".join(notes)
    if len(joined) > PRIVATE_MAX_CHARS:
        raise ValueError(f"notes are {len(joined):,} chars; the cap is {PRIVATE_MAX_CHARS:,}")
    return joined


def main() -> int:
    sections = {}
    for title, path in LOCAL:
        sections[title] = f"## {title}\n{to_text(path.read_text(encoding='utf-8'))}"
    for title, url in REMOTE:
        req = urllib.request.Request(url, headers={"User-Agent": "hamzaaziz-knowledge-build"})
        with urllib.request.urlopen(req, timeout=30) as r:
            sections[title] = f"## {title}\n{to_text(r.read().decode('utf-8'))}"

    knowledge = "\n\n".join(sections.values())
    core = "\n\n".join(sections[t] for t in CORE)

    # Guard against the exclusions being undone by a future edit.
    for banned in EXCLUDED:
        if banned.lower() in knowledge.lower():
            print(f"refusing to build: excluded content found ({banned})", file=sys.stderr)
            return 1

    try:
        notes = private_notes()
    except ValueError as e:
        print(f"refusing to build: {e}", file=sys.stderr)
        return 1

    OUT.write_text(
        "// GENERATED by worker/build_knowledge.py -- do not edit by hand.\n"
        f"export const KNOWLEDGE = {json.dumps(knowledge, ensure_ascii=False)};\n"
        f"export const KNOWLEDGE_CORE = {json.dumps(core, ensure_ascii=False)};\n",
        encoding="utf-8",
    )
    # Written even when empty: index.js imports it, and a missing file fails
    # the deploy loudly instead of silently shipping without the notes.
    PRIVATE_OUT.write_text(
        "// GENERATED by worker/build_knowledge.py from worker/private/ -- never commit.\n"
        f"export const PRIVATE_NOTES = {json.dumps(notes, ensure_ascii=False)};\n",
        encoding="utf-8",
    )
    print(f"wrote {PRIVATE_OUT.relative_to(ROOT)}: {len(notes.split())} words from {PRIVATE_DIR.relative_to(ROOT)}/")
    print(f"wrote {OUT.relative_to(ROOT)}: full {len(knowledge.split())} words, core {len(core.split())} words")
    return 0


if __name__ == "__main__":
    sys.exit(main())
