# Chat assistant Worker

Backend for the "Ask about Hamza" chat on hamzaaziz.dev. GitHub Pages is
static and a model API key cannot live in page JavaScript, so this
Cloudflare Worker holds it and the widget (`assets/js/chat.js`) calls it.

```
hamzaaziz.dev widget ──POST /chat──▶ Worker ──▶ Gemini 2.5 Flash-Lite (full site text)
                                        └─ on quota/error ─▶ Workers AI (homepage + CV text)
```

Cost: $0. Gemini's free tier, Workers' free plan and Workers AI's free daily
allocation. When a free quota runs out the visitor sees "today's limit"; nothing
is charged, because the Google project has no billing account.

## Files

| File | Purpose |
|---|---|
| `src/index.js` | The Worker: origin check, rate limit, validation, Gemini then Workers AI |
| `src/knowledge.js` | GENERATED. The text the assistant may answer from |
| `build_knowledge.py` | Regenerates `knowledge.js` from the site's own pages |
| `test.mjs` | Self-check with both models stubbed: `node worker/test.mjs` |
| `wrangler.toml` | Worker config: allowed origin, models, AI binding, rate limit |

## Deploy (one time)

1. **Gemini key.** At aistudio.google.com → **Get API key** → create it in a
   project that has **no billing account**, so the free tier can never bill.
   Keep it out of every repo folder.
2. **Check the fallback model id.** Cloudflare dashboard → AI → Models. Confirm
   `@cf/meta/llama-3.1-8b-instruct-fp8` exists, or set `FALLBACK_MODEL` in
   `wrangler.toml` to another free `@cf/` text model. Third-party models such
   as `anthropic/...` are billed separately; don't use them here.
3. From the repo root:
   ```
   cd worker
   npx wrangler login
   npx wrangler secret put GEMINI_API_KEY     # paste the key when prompted
   npx wrangler deploy
   ```
   `deploy` prints the Worker URL, e.g.
   `https://hamzaaziz-chat.<your-subdomain>.workers.dev`.
4. Put that URL **plus `/chat`** into the script tag at the end of
   `index.html`:
   ```html
   <script src="assets/js/chat.js" data-endpoint="https://hamzaaziz-chat.<sub>.workers.dev/chat" defer></script>
   ```
   While `data-endpoint` is empty the widget renders nothing.

## After changing the site's content

The assistant only knows what was in the pages when `knowledge.js` was last
built. After editing the homepage, a case study or the CV:

```
python -I worker/build_knowledge.py
cd worker && npx wrangler deploy
```

## Checking which backend answered

Every reply carries an `X-Chat-Backend: gemini` or `workers-ai` header.
Seeing `workers-ai` during the day means Gemini's free quota ran out or
Gemini errored, and the fallback is doing its job.
