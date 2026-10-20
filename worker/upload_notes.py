"""Upload the private notes (worker/private/*.md) to the Worker's KV store.

The notes never go into git or into the Worker's code: the Worker reads them
from KV at request time, so CI can deploy without them. Only Gemini sees
them. They stay off GitHub, but anything in them can be told to a visitor
who asks, so they must hold only what Hamza would say in an interview.

Refuses notes that look like they hold an address or a credential, and caps
their size: the whole prompt is sent with every message, and the free tier
limits tokens per minute. Visitors see an upload within about five minutes
(the Worker's edge cache).

Run from anywhere:  python -I worker/upload_notes.py
Needs `npx wrangler login` once. Stdlib only.
"""
import pathlib
import re
import shutil
import subprocess
import sys

WORKER = pathlib.Path(__file__).resolve().parent
PRIVATE_DIR = WORKER / "private"
OUT = PRIVATE_DIR / ".notes-upload.txt"
WRANGLER = "wrangler@4.151.2"
# ~40k tokens. With the site text that is ~50k tokens per message: room for a
# handful of messages a minute on the free tier before the fallback answers.
MAX_CHARS = 160_000
LEAKY = {
    "an IPv4 address": r"\b(?:\d{1,3}\.){3}\d{1,3}\b",
    "a Google API key": r"AIza[0-9A-Za-z_-]{30,}",
    "an OpenAI-style key": r"\bsk-[A-Za-z0-9_-]{20,}",
    "a GitHub token": r"\bgh[pousr]_[A-Za-z0-9]{30,}",
    "a private key": r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
    "a password": r"(?i)\bpass(?:word|wd)?\s*[:=]",
}


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
    if not joined:
        raise ValueError(f"no notes in {PRIVATE_DIR}")
    if len(joined) > MAX_CHARS:
        raise ValueError(f"notes are {len(joined):,} chars; the cap is {MAX_CHARS:,}")
    return joined


def main() -> int:
    try:
        notes = private_notes()
    except ValueError as e:
        print(f"refusing to upload: {e}", file=sys.stderr)
        return 1
    OUT.write_text(notes, encoding="utf-8")
    npx = shutil.which("npx")
    if not npx:
        print("npx not found; install Node.js", file=sys.stderr)
        return 1
    # --remote: wrangler 4 writes to a local simulator by default.
    cmd = [npx, "--yes", WRANGLER, "kv", "key", "put", "notes", "--path", str(OUT), "--binding", "NOTES_KV", "--remote"]
    try:
        done = subprocess.run(cmd, cwd=WORKER)
    finally:
        OUT.unlink(missing_ok=True)
    if done.returncode == 0:
        print(f"uploaded {len(notes.split()):,} words ({len(notes):,} chars)")
    return done.returncode


if __name__ == "__main__":
    sys.exit(main())
