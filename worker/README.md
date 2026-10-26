# Chat assistant Worker

Backend for the "Ask about Hamza" chat on hamzaaziz.dev. GitHub Pages is
static and a model API key cannot live in page JavaScript, so this
Cloudflare Worker holds it and the widget (`assets/js/chat.js`) calls it.

```
hamzaaziz.dev widget ──POST /chat──▶ Worker ──▶ Gemini 3.5 Flash-Lite (full site text)
                                        └─ on quota/error ─▶ Workers AI (homepage + CV text)
```

Cost: $0. Gemini's free tier, Workers' free plan and Workers AI's free daily
allocation. When a free quota runs out the visitor sees "today's limit"; nothing
is charged, because the Google project has no billing account.

## Files

| File | Purpose |
|---|---|
| `src/index.js` | The Worker: origin check, rate limit, validation, Gemini then Workers AI |
| `src/knowledge.js` | GENERATED. The public site text the assistant may answer from |
| `build_knowledge.py` | Regenerates `knowledge.js` from every sitemap page, the CV page and the PDFs they link, except matrimony and the bio-data PDF; marksheets keep results only (CI runs it) |
| `sanitize_notes.py` | Cleans raw design docs into private notes |
| `upload_notes.py` | Uploads the private notes to Workers KV |
| `test.mjs` | Self-check with both models and KV stubbed: `node worker/test.mjs` |
| `wrangler.toml` | Worker config: origin, models, AI, KV and rate-limit bindings |
| `../.github/workflows/worker.yml` | Builds, checks and deploys on every relevant push to `main` |

## How it deploys

**Automatically.** `.github/workflows/worker.yml` runs on every push to
`main` that touches `worker/`, `index.html`, `projects/`, `assets/pdf/` or `sitemap.xml`, weekly (to pick up
CV edits, since the CV page lives in another repo), and on demand from the
Actions tab. It rebuilds `knowledge.js`, runs the self-check and deploys.
It needs one repository secret, `CLOUDFLARE_API_TOKEN`: Cloudflare dashboard
→ My Profile → API Tokens → Create Token → template **Edit Cloudflare
Workers**, scoped to this account only.

**By hand**, if ever needed: `pip install pypdf`, `python worker/build_knowledge.py`, then
`cd worker && npx wrangler deploy`.

One-time setup, already done: the `GEMINI_API_KEY` Worker secret (an AI
Studio key in a project with **no billing account**), the `workers.dev`
subdomain, the KV namespace in `wrangler.toml`, and the endpoint in the
script tag at the end of `index.html`. The fallback model must be a free
`@cf/` model; third-party models such as `anthropic/...` are billed
separately.

## Private notes

For questions the site does not answer ("tell me something that is not on
your resume"), the Worker adds Hamza's private notes to Gemini's prompt. They
live in Workers KV, never in git or in the Worker's code, so CI can deploy
without them. Only Gemini sees them; the fallback does not.

- **Anything in them can be told to a visitor who asks.** No employer or
  client internals under NDA, no customer names, no addresses, keys or
  security weaknesses. The upload refuses notes that look like they hold an
  IP address, key or password.
- Cap: 160,000 characters (about 40k tokens). The whole prompt goes with
  every message, and the free tier limits tokens per minute.
- Prose, not diagrams: the assistant reads text only.

Workflow:

1. Raw design docs go in `worker/private/source/`; names to anonymise go in
   `worker/private/redactions.txt`, one `term => replacement` per line. Both
   are gitignored.
2. `python -I worker/sanitize_notes.py` writes a cleaned copy of each doc
   into `worker/private/`: diagrams, IP addresses, ports, file:line
   references, private links and every line about credentials,
   authentication or exposure are removed. Hand-written `.md` notes can sit
   beside them. Regexes cannot judge confidentiality: read the output.
3. `python -I worker/upload_notes.py` uploads every `worker/private/*.md`.
   Visitors see the change within about five minutes. No deploy needed.

## Checking which backend answered

Every reply carries an `X-Chat-Backend: gemini` or `workers-ai` header.
Seeing `workers-ai` during the day means Gemini's free quota ran out or
Gemini errored, and the fallback is doing its job.

## Chat session logs

Every chat turn is stored in the D1 database `hamzaaziz-chat-logs` (DECISIONS D-025): `sessions` (one row per chat: times, page, country/region/city, network operator and ASN, hashed IP, device, user agent, `source` visitor|internal|eval: internal = Hamza's home network, from the secret HOME_IP_PREFIXES) and `messages` (question, answer, HTTP status, backend, ms). Kept 365 days; a daily cron purges older sessions. The schema is in `migrations/`; a new migration is applied with `npx wrangler d1 migrations apply hamzaaziz-chat-logs --remote`.

Read them in the Cloudflare dashboard (Storage & Databases → D1 → hamzaaziz-chat-logs → Console) or from `worker/`:

```bash
# Latest visitor sessions
npx wrangler d1 execute hamzaaziz-chat-logs --remote --command \
  "SELECT id, started_at, ended_at, messages, country, city, as_org, page FROM sessions WHERE source='visitor' ORDER BY started_at DESC LIMIT 20"
# One conversation
npx wrangler d1 execute hamzaaziz-chat-logs --remote --command \
  "SELECT at, question, answer, backend, ms FROM messages WHERE session_id='<id>' ORDER BY at"
```
