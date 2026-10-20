"""Turn the raw design docs in worker/private/source/ into detailed chat notes.

Keeps the engineering detail (components, flows, decisions, trade-offs,
numbers, known weaknesses) and strips what must not reach a visitor:
diagrams with hosts and ports, IP addresses, file:line evidence, links to
private pages, and any line about credentials, authentication or exposure.
Names listed in worker/private/redactions.txt (one "term => replacement" per
line, gitignored) are replaced, e.g. "Tacos El 24 => a QSR brand".

Output: worker/private/<source name>.md, one per source doc. Read them before
deploying; regexes cannot judge confidentiality. Then:
  python -I worker/build_knowledge.py

Run:  python -I worker/sanitize_notes.py
Stdlib only.
"""
import pathlib
import re
import sys

PRIVATE = pathlib.Path(__file__).resolve().parent / "private"
SOURCE = PRIVATE / "source"
REDACTIONS = PRIVATE / "redactions.txt"

# Whole sections dropped by heading: they describe exposure or bookkeeping.
DROP_SECTION = re.compile(
    r"security|trust|privacy|credential|secret|unauthenticat|key in query|plaintext|port and protocol"
    r"|evidence legend|how to read|uncertainty|open questions"
    r"|not verified|source register|sources|appendix|contents",
    re.I,
)
# Single lines dropped wherever they appear.
DROP_LINE = re.compile(
    r"password|credential|secret|plaintext|unauthenticat|no auth|without auth|authenticat"
    r"|\bauth\b|authori|static token|shared token|token is shared|token check|root token|bad token"
    r"|ships the same|permission|membership|server-side identity|per-user identity|oauth|\broot\b"
    r"|cors|api[_ -]?key|access-token|csrf|as root|root user|user=root|expos|published port"
    r"|rotate|debug=true|exploit|attack|forge|ssrf|leak|claude\.ai/artifact|^\s*\d+\.\s*\["
    r"|^(branch|checkout|repository|inspected|status:|evidence:|source:|built from|companion"
    r"|agreed by|reviewed by|solution architecture ·|software & system design ·)",
    re.I,
)
FILE_REF = re.compile(
    r"`?[\w./\\-]+\.(?:py|ya?ml|sh|html|json|txt|env|md|ipynb|vue|js|csv|xlsx|toml|pkl)`?"
    r"(?::[\d–,: -]+)?"
)
# No leading \b: refs are often glued to the previous word ("JSONT:1393").
SHORT_REF = re.compile(r"(?:T|M|S|POS|DT|CFG|HC|SM|DF|RQ|EXP|Clean|Menu|BL):\d[\d–,:-]*")
PORT = re.compile(
    r":\d{4,5}\b|\b\d{4,5}(?:\s*/\s*\d{4,5})*\s*(?:→|->)\s*\d{4,5}\b|\bport \d{4,5}\b|\bHTTPS? \d{4,5}\b"
)
BARE_LINES = re.compile(r"(?<![\w)]):\d+(?:[–-]\d+)?")
LINE_REF = re.compile(r"\(?\bL\d+(?:-\d+)?\)?")
IP = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b|\blocalhost:\d+\b")
COMMIT = re.compile(r"\b(?:commit|checkout|HEAD|rev\.?)\s+\**[0-9a-f]{7,40}\**", re.I)


def redactions() -> list[tuple[str, str]]:
    if not REDACTIONS.exists():
        return []
    pairs = []
    for line in REDACTIONS.read_text(encoding="utf-8").splitlines():
        if "=>" in line and not line.lstrip().startswith("#"):
            term, repl = (s.strip() for s in line.split("=>", 1))
            pairs.append((term, repl))
    # Longest first, so "Tacos El 24" wins over "Tacos".
    return sorted(pairs, key=lambda p: -len(p[0]))


def clean(text: str, pairs: list[tuple[str, str]]) -> str:
    text = re.sub(r"```mermaid.*?```", "", text, flags=re.S)
    out, skipping = [], False
    for line in text.splitlines():
        heading = re.match(r"^#{1,4}\s*(.*)", line)
        if heading:
            skipping = bool(DROP_SECTION.search(heading.group(1)))
        if skipping or DROP_LINE.search(line):
            continue
        for rx in (FILE_REF, SHORT_REF, LINE_REF, IP, PORT, BARE_LINES, COMMIT):
            line = rx.sub("", line)
        # Tidy what the removals leave behind: "()", "; ;", doubled spaces.
        line = re.sub(r"\(\s*[;,]?\s*\)", "", line)
        line = re.sub(r"(?:\s*[;,·]\s*){2,}", "; ", line)
        line = re.sub(r"[ \t]{2,}", " ", line).rstrip(" ·;,")
        out.append(line)
    text = "\n".join(out)
    for term, repl in pairs:
        text = re.sub(re.escape(term), repl, text, flags=re.I)
    return re.sub(r"\n{3,}", "\n\n", text).strip() + "\n"


def main() -> int:
    if not SOURCE.is_dir():
        print(f"nothing to do: {SOURCE} does not exist", file=sys.stderr)
        return 1
    pairs = redactions()
    for src in sorted(SOURCE.glob("*.md")):
        dst = PRIVATE / src.name
        dst.write_text(clean(src.read_text(encoding="utf-8"), pairs), encoding="utf-8")
        print(f"{src.name}: {len(src.read_text(encoding='utf-8')):,} -> {len(dst.read_text(encoding='utf-8')):,} chars")
    left = [t for t, _ in pairs for f in PRIVATE.glob("*.md") if t.lower() in f.read_text(encoding="utf-8").lower()]
    if left:
        print(f"redacted terms still present: {sorted(set(left))}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
