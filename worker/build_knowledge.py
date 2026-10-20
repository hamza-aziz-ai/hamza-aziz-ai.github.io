"""Build worker/src/knowledge.js: the plain text the chat assistant may answer from.

Sources: the whole public site, as sitemap.xml lists it, plus the CV page
(it lives in the separate hamza-aziz-cv repo and its own sitemap). Pages in
this repo are read from disk; anything else, and PDFs, from the live site.
A page added to the sitemap is picked up with no change here.

Two exports: KNOWLEDGE (everything, for Gemini) and KNOWLEDGE_CORE (homepage
and CV only, for the Workers AI fallback). Small fallback models can have an
~8k-token window and their free allowance is spent per token, so they get
the part that answers most recruiter questions, not the case-study depth.

Deliberately excluded: the matrimony page and the bio-data PDF. They are
public, but they are not what a portfolio assistant should discuss.

Private notes are not built here: worker/upload_notes.py puts them in KV, so
this public build can run in CI.

Rerun after changing any source page:  python -I worker/build_knowledge.py
(CI runs it on every deploy.) Needs pypdf for the CV PDF.
"""
import html
import io
import json
import pathlib
import re
import sys
import urllib.request

from pypdf import PdfReader

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = "https://hamzaaziz.dev/"
CV_PAGE = SITE + "hamza-aziz-cv/"
CORE = ("Homepage", "CV")
OUT = ROOT / "worker/src/knowledge.js"
# URL prefixes never read, and text that must never appear in the output.
EXCLUDED_URLS = (SITE + "matrimony", SITE + "assets/pdf/Hamza-BioData.pdf")
EXCLUDED = ("matrimony", "Hamza-BioData", "class-10.pdf", "class-12.pdf", "college-degree.pdf")


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "hamzaaziz-knowledge-build"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def sources() -> list[tuple[str, str, str]]:
    """(title, url, text) for every page in the sitemap, plus the CV page."""
    urls = re.findall(r"<loc>([^<]+)</loc>", (ROOT / "sitemap.xml").read_text(encoding="utf-8"))
    out = []
    for url in [*urls, CV_PAGE]:
        if url.startswith(EXCLUDED_URLS):
            continue
        local = ROOT / (url[len(SITE):] or "index.html")
        if url.endswith(".pdf"):
            pdf = PdfReader(io.BytesIO(local.read_bytes() if local.is_file() else fetch(url)))
            text = "\n".join((p.extract_text() or "") for p in pdf.pages)
            title = f"{local.stem.replace('_', ' ')} (PDF)"
        else:
            text = local.read_text(encoding="utf-8") if local.is_file() else fetch(url).decode("utf-8")
            title = {SITE: "Homepage", CV_PAGE: "CV"}.get(url) or page_title(text)
        out.append((title, url, text))
    return out


def page_title(raw: str) -> str:
    m = re.search(r"<title>(.*?)</title>", raw, re.S)
    return html.unescape(m.group(1)).split(" | ")[0].strip() if m else "Page"


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


def main() -> int:
    sections, raw = {}, {}
    for title, url, text in sources():
        raw[title] = text
        body = text if url.endswith(".pdf") else to_text(text)
        # The URL lets the assistant send visitors to the page itself.
        sections[title] = f"## {title}\nPage: {url}\n{body}"

    # Contact details sit behind icons and links, so to_text() drops them;
    # list them so "what's his LinkedIn / phone?" gets an answer. Only what
    # the homepage and CV already publish, and professional profiles only.
    pages = raw["Homepage"] + raw["CV"]
    links = sorted(set(re.findall(r'href="(https://(?:www\.)?(?:linkedin\.com|github\.com|medium\.com)/[^"]+)"', pages)))
    phones = sorted(set(re.findall(r'href="tel:(\+\d{8,15})"', pages)))
    whatsapp = sorted(set(re.findall(r'href="(https://wa\.me/\d{8,15})"', pages)))
    contact = ["Email: hamza.aziz.dev@gmail.com"]
    contact += [f"Phone: {p[:3]} {p[3:]}" for p in phones]
    contact += [f"WhatsApp: {w}" for w in whatsapp]
    sections["Homepage"] += (
        "\n\nContact:\n" + "\n".join(contact) + "\n\nProfiles and links:\n" + "\n".join(links)
    )
    knowledge = "\n\n".join(sections.values())
    core = "\n\n".join(sections[t] for t in CORE)

    # Guard against the exclusions being undone by a future edit.
    for banned in EXCLUDED:
        if banned.lower() in knowledge.lower():
            print(f"refusing to build: excluded content found ({banned})", file=sys.stderr)
            return 1

    OUT.write_text(
        "// GENERATED by worker/build_knowledge.py -- do not edit by hand.\n"
        f"export const KNOWLEDGE = {json.dumps(knowledge, ensure_ascii=False)};\n"
        f"export const KNOWLEDGE_CORE = {json.dumps(core, ensure_ascii=False)};\n",
        encoding="utf-8",
    )
    print(f"wrote {OUT.relative_to(ROOT)}: full {len(knowledge.split())} words, core {len(core.split())} words")
    return 0


if __name__ == "__main__":
    sys.exit(main())
