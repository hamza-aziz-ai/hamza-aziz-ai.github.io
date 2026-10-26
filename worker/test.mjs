// Self-check for the Worker's request handling. No network, no real keys:
// Gemini and Workers AI are both stubs. Run:  node worker/test.mjs
import assert from "node:assert/strict";
import worker, { toTurns, nextMidnight, geminiResetAt, timeContext, visitorZone, fixLinks, purgeOldLogs } from "./src/index.js";

const ORIGIN = "https://hamzaaziz.dev";
const NOTE = "Private note: the barrier token design.";
const env = (over = {}) => ({ ALLOWED_ORIGINS: ORIGIN, MODEL: "test-model", FALLBACK_MODEL: "@cf/test", GEMINI_API_KEY: "k",
  NOTES_KV: { get: async (key) => (key === "notes" ? NOTE : null) }, ...over });
const req = (body, { origin = ORIGIN, method = "POST", path = "/chat" } = {}) =>
  new Request(`https://w.example${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) },
    body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
const ask = { messages: [{ role: "user", text: "Hi" }, { role: "model", text: "Hello" }, { role: "user", text: "What does Hamza work on?" }] };

let geminiCalls = [];
const gemini = (status, payload) => {
  globalThis.fetch = async (url, init) => {
    geminiCalls.push({ url, init });
    return new Response(JSON.stringify(payload), { status });
  };
};
const geminiOK = () => gemini(200, { candidates: [{ content: { parts: [{ text: "From Gemini." }] } }] });
let aiCalls = [];
const ai = (impl) => ({ run: async (model, input) => { aiCalls.push({ model, input }); return impl(); } });
const reset = () => { geminiCalls = []; aiCalls = []; };

// Validation
assert.equal(toTurns([]), null, "empty rejected");
assert.equal(toTurns([{ role: "model", text: "hi" }]), null, "must end with user");
assert.equal(toTurns([{ role: "user", text: "x".repeat(801) }]), null, "over 800 chars rejected");
const longReply = toTurns([{ role: "user", text: "q" }, { role: "model", text: "y".repeat(3000) }, { role: "user", text: "follow-up" }]);
assert.equal(longReply.length, 3, "a long earlier reply does not block the follow-up");
assert.equal(longReply[1].text.length, 2500, "earlier replies are trimmed to bound cost");
assert.equal(toTurns([{ role: "system", text: "hi" }]), null, "unknown role rejected");
assert.equal(toTurns(Array.from({ length: 13 }, (_, i) => ({ role: i % 2 ? "model" : "user", text: "q" }))).length, 8, "trimmed to last 8");

// Routing and CORS
assert.equal((await worker.fetch(req(ask, { path: "/x" }), env())).status, 404);
assert.equal((await worker.fetch(req(null, { method: "OPTIONS" }), env())).status, 204, "preflight from allowed origin");
assert.equal((await worker.fetch(req(null, { method: "OPTIONS", origin: "https://evil.example" }), env())).status, 403);
assert.equal((await worker.fetch(req(ask, { origin: "https://evil.example" }), env())).status, 403, "POST from other origin");
assert.equal((await worker.fetch(req(ask, { origin: null }), env())).status, 403, "POST with no origin");
assert.equal((await worker.fetch(req(null, { method: "GET" }), env())).status, 405);
assert.equal((await worker.fetch(req("{not json"), env())).status, 400);
assert.equal((await worker.fetch(req({ messages: [] }), env())).status, 400);
assert.equal((await worker.fetch(req(ask), env({ GEMINI_API_KEY: "" }))).status, 503, "no backend at all");
assert.equal((await worker.fetch(req(ask), env({ CHAT_LIMITER: { limit: async () => ({ success: false }) } }))).status, 429);

// 1. Gemini answers: fallback never touched, key in header not URL
reset(); geminiOK();
let r = await worker.fetch(req(ask), env({ AI: ai(() => ({ response: "from AI" })) }));
assert.equal(r.status, 200);
assert.deepEqual(await r.json(), { reply: "From Gemini." });
assert.equal(r.headers.get("X-Chat-Backend"), "gemini");
assert.equal(r.headers.get("Access-Control-Allow-Origin"), ORIGIN);
assert.equal(aiCalls.length, 0, "fallback unused when Gemini answers");
assert.ok(geminiCalls[0].url.endsWith("/models/test-model:generateContent"));
assert.ok(!geminiCalls[0].url.includes("key="), "key never in URL");
assert.equal(geminiCalls[0].init.headers["x-goog-api-key"], "k");
const gBody = JSON.parse(geminiCalls[0].init.body);
assert.deepEqual(gBody.contents.map((c) => c.role), ["user", "model", "user"]);
const fullPromptLen = gBody.systemInstruction.parts[0].text.length;

// 2. Gemini out of quota -> Workers AI answers with the public prompt
reset(); gemini(429, { error: { message: "quota exceeded for project 123" } });
r = await worker.fetch(req(ask), env({ AI: ai(() => ({ response: "From Workers AI." })) }));
assert.equal(r.status, 200);
assert.deepEqual(await r.json(), { reply: "From Workers AI." });
assert.equal(r.headers.get("X-Chat-Backend"), "workers-ai");
assert.equal(aiCalls[0].model, "@cf/test");
const msgs = aiCalls[0].input.messages;
assert.deepEqual(msgs.map((m) => m.role), ["system", "user", "assistant", "user"], "model role mapped to assistant");
assert.ok(msgs[0].content.includes("Medical-ChatBot") && msgs[0].content.length < fullPromptLen, "fallback gets the public knowledge, without the notes");
assert.ok(msgs[0].content.includes("KNOWLEDGE"));
// Private notes reach Gemini when present, and never the fallback.
assert.ok(gBody.systemInstruction.parts[0].text.includes(NOTE), "Gemini gets the KV notes");
assert.ok(!msgs[0].content.includes("BACKGROUND (private)") && !msgs[0].content.includes(NOTE), "fallback never sees private notes");
// No KV binding, or a KV error: Gemini still answers, from the public text.
for (const NOTES_KV of [undefined, { get: async () => { throw new Error("kv down"); } }]) {
  reset(); geminiOK();
  assert.equal((await worker.fetch(req(ask), env({ NOTES_KV }))).status, 200);
  assert.ok(!JSON.parse(geminiCalls[0].init.body).systemInstruction.parts[0].text.includes("BACKGROUND (private)"));
}

// 3. Gemini 5xx, network error, or empty -> fallback too
for (const setup of [() => gemini(500, {}), () => gemini(200, { candidates: [] }), () => { globalThis.fetch = async () => { throw new Error("down"); }; }]) {
  reset(); setup();
  r = await worker.fetch(req(ask), env({ AI: ai(() => ({ response: "fb" })) }));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("X-Chat-Backend"), "workers-ai");
}

// 4. OpenAI-style Workers AI output shape is accepted
reset(); gemini(500, {});
r = await worker.fetch(req(ask), env({ AI: ai(() => ({ choices: [{ message: { content: "choices shape" } }] })) }));
assert.deepEqual(await r.json(), { reply: "choices shape" });

// 5. No Gemini key: Workers AI only
reset();
r = await worker.fetch(req(ask), env({ GEMINI_API_KEY: "", AI: ai(() => ({ response: "AI only" })) }));
assert.equal(r.status, 200);
assert.equal(geminiCalls.length, 0);

// 6. Both exhausted -> a limit with the earliest reset; both broken -> generic; nothing leaks
reset(); gemini(429, { error: { message: "project 123", details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "34s" }] } });
let before = Date.now();
r = await worker.fetch(req(ask), env({ AI: ai(() => { throw new Error("4006: daily free allocation exceeded"); }) }));
assert.equal(r.status, 503);
const limitBody = await r.json();
assert.ok(limitBody.error.includes("hamza.aziz.dev@gmail.com"));
assert.ok(!JSON.stringify(limitBody).includes("project 123") && !JSON.stringify(limitBody).includes("4006"), "upstream details not leaked");
const retryAt = Date.parse(limitBody.retryAt);
assert.ok(retryAt >= before + 34000 && retryAt <= Date.now() + 35000, "per-minute Gemini limit beats the daily Workers AI one");
reset(); gemini(500, {});
r = await worker.fetch(req(ask), env({ AI: ai(() => { throw new Error("internal"); }) }));
assert.equal(r.status, 502);
assert.ok(!("retryAt" in (await r.json())), "an outage has no reset time");

// Reset times: daily Gemini quota -> next midnight in Los Angeles; Workers AI -> next 00:00 UTC.
const T = Date.UTC(2026, 9, 20, 3, 0);            // 20 Oct 2026 03:00 UTC = 19 Oct 20:00 PDT
assert.equal(nextMidnight("UTC", T), Date.UTC(2026, 9, 21));
assert.equal(nextMidnight("America/Los_Angeles", T), Date.UTC(2026, 9, 20, 7));   // 00:00 PDT
assert.equal(nextMidnight("America/Los_Angeles", Date.UTC(2026, 10, 1, 12)), Date.UTC(2026, 10, 2, 8)); // DST ended: 00:00 PST
assert.equal(geminiResetAt([{ violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }], T), Date.UTC(2026, 9, 20, 7));
assert.equal(geminiResetAt([], T), T + 60000, "unknown limit: try again in a minute");

// 7. Gemini only, no AI binding: quota still reported as a limit
reset(); gemini(429, {});
assert.equal((await worker.fetch(req(ask), env())).status, 503);


// Current time: both prompts end with it; the visitor's zone is validated.
reset(); geminiOK();
await worker.fetch(req({ ...ask, tz: "Asia/Dubai" }), env());
assert.match(JSON.parse(geminiCalls[0].init.body).systemInstruction.parts[0].text, /CURRENT TIME\nThe visitor's local time is .+ \(Asia\/Dubai\)\.\nHamza is in India, where it is .+ \(IST\)\.\n$/);
assert.equal(visitorZone("Asia/Dubai", "Europe/London"), "Asia/Dubai");
assert.equal(visitorZone("Not/AZone", "Europe/London"), "Europe/London", "invalid zone falls back to Cloudflare's");
assert.equal(visitorZone(42, undefined), "UTC");
assert.equal(timeContext("UTC", Date.UTC(2026, 9, 20, 3, 30)),
  "\n\nCURRENT TIME\nThe visitor's local time is Tuesday, 20 October 2026 at 03:30 am (UTC).\nHamza is in India, where it is Tuesday, 20 October 2026 at 09:00 am (IST).\n");

console.log("worker self-check: all assertions passed");

// Links: only URLs from the prompt survive; near misses are repaired.
{
  const src = "Repos: https://github.com/hamza-aziz-ai/Medical-ChatBot and https://github.com/hamza-aziz-ai/HalalLens\nSite: https://hamzaaziz.dev/projects/voice-ai.html.";
  assert.equal(fixLinks("Here: https://github.com/hamza-aziz-ai/Medical-Medical-ChatBot", src),
    "Here: https://github.com/hamza-aziz-ai/Medical-ChatBot", "near-miss repo link repaired");
  assert.equal(fixLinks("See [the repo](https://github.com/hamza-aziz-ai/Medical-Medical-ChatBot).", src),
    "See [the repo](https://github.com/hamza-aziz-ai/Medical-ChatBot).", "Markdown link repaired");
  assert.equal(fixLinks("Code: https://github.com/hamza-aziz-ai/CCTV-Attendance.", src), "Code: .", "unknown link dropped");
  assert.equal(fixLinks("See [code](https://github.com/hamza-aziz-ai/CCTV-Attendance)", src), "See code", "unknown Markdown link keeps its text");
  assert.equal(fixLinks("Read https://hamzaaziz.dev/projects/voice-ai.html.", src), "Read https://hamzaaziz.dev/projects/voice-ai.html.", "known link and its full stop kept");
  assert.equal(fixLinks("https://evil.example/hamza-aziz-ai/Medical-ChatBot", src), "", "other host never repaired");
  assert.equal(fixLinks("No links here.", src), "No links here.");
  reset();
  gemini(200, { candidates: [{ content: { parts: [{ text: "Repo: https://github.com/hamza-aziz-ai/Medical-Medical-ChatBot" }] } }] });
  const fixed = await (await worker.fetch(req(ask), env())).json();
  assert.equal(fixed.reply, "Repo: https://github.com/hamza-aziz-ai/Medical-ChatBot", "Worker repairs a Gemini link from the real knowledge");
}
console.log("link checks passed");

// A slow Gemini is abandoned after the timeout and Workers AI answers.
{
  reset();
  globalThis.fetch = (url, init) => {
    geminiCalls.push({ url, init });
    return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
  };
  // Node does not let AbortSignal.timeout keep the process alive; Workers do.
  const keepAlive = setTimeout(() => {}, 5000);
  const t0 = Date.now();
  const r = await worker.fetch(req(ask), env({ GEMINI_TIMEOUT_MS: "50", AI: ai(() => ({ response: "From Workers AI." })) }));
  assert.equal(r.status, 200, "slow Gemini still gets an answer");
  assert.deepEqual(await r.json(), { reply: "From Workers AI." });
  assert.equal(r.headers.get("X-Chat-Backend"), "workers-ai");
  assert.ok(Date.now() - t0 < 2000, "gave up on Gemini at the timeout");
  assert.equal(aiCalls.length, 1);
  clearTimeout(keepAlive);
}
// A hung fallback is given up too: the visitor gets "unavailable", fast.
{
  reset(); gemini(500, {});
  const t0 = Date.now();
  const r = await worker.fetch(req(ask), env({ WORKERS_AI_TIMEOUT_MS: "50", AI: { run: () => new Promise(() => {}) } }));
  assert.equal(r.status, 502, "hung fallback ends as unavailable");
  assert.ok(Date.now() - t0 < 2000, "gave up on Workers AI at its limit");
}
console.log("timeout checks passed");


// Session logs (D-025): one session row and one message row per turn,
// written after the reply; /chat/end closes a session; old rows are purged.
{
  const fakeDb = () => {
    const db = { ran: [], prepare: (sql) => ({ bind: (...args) => ({ sql, args, run: async () => { db.ran.push({ sql, args }); } }) }),
      batch: async (stmts) => { for (const s of stmts) db.ran.push({ sql: s.sql, args: s.args }); } };
    return db;
  };
  const ctx = () => { const c = { pending: [], waitUntil: (p) => c.pending.push(p) }; return c; };
  const SID = "123e4567-e89b-42d3-a456-426614174000";
  const logReq = (body, path = "/chat") => {
    const r = new Request(`https://w.example${path}`, { method: "POST",
      headers: { "Content-Type": "text/plain", Origin: ORIGIN, "CF-Connecting-IP": "203.0.113.7", "User-Agent": "Mozilla/5.0 (iPhone)" },
      body: JSON.stringify(body) });
    Object.defineProperty(r, "cf", { value: { country: "AE", region: "Dubai", city: "Dubai", timezone: "Asia/Dubai", asOrganization: "Example Bank", asn: 64500 } });
    return r;
  };

  reset(); geminiOK();
  let db = fakeDb(), c = ctx();
  let r = await worker.fetch(logReq({ ...ask, session: SID, page: "/projects/voice-ai.html" }), env({ CHAT_LOGS: db, LOG_SALT: "s" }), c);
  assert.equal(r.status, 200);
  await Promise.all(c.pending);
  assert.equal(db.ran.length, 2, "session upsert + message insert");
  const [sess, msg] = db.ran;
  assert.match(sess.sql, /INSERT INTO sessions[\s\S]*ON CONFLICT\(id\) DO UPDATE/);
  assert.equal(sess.args[0], SID);
  assert.equal(sess.args[2], "visitor");
  assert.equal(sess.args[3], "/projects/voice-ai.html");
  assert.deepEqual(sess.args.slice(4, 10), ["AE", "Dubai", "Dubai", "Asia/Dubai", "Example Bank", 64500]);
  assert.match(sess.args[10], /^[0-9a-f]{16}$/, "IP stored only as a salted hash");
  assert.ok(!JSON.stringify(sess.args).includes("203.0.113.7"), "raw IP never stored");
  assert.equal(sess.args[11], "mobile");
  assert.equal(msg.args[0], SID);
  assert.equal(msg.args[2], "What does Hamza work on?");
  assert.equal(msg.args[3], "From Gemini.");
  assert.equal(msg.args[4], 200);
  assert.equal(msg.args[5], "gemini");

  // No salt: no hash. Bad session id: a fresh one, never the caller's string.
  reset(); geminiOK(); db = fakeDb(); c = ctx();
  await worker.fetch(logReq({ ...ask, session: "x'); DROP TABLE sessions;--", source: "eval" }), env({ CHAT_LOGS: db }), c);
  await Promise.all(c.pending);
  assert.match(db.ran[0].args[0], /^[0-9a-f-]{36}$/);
  assert.equal(db.ran[0].args[2], "eval");
  assert.equal(db.ran[0].args[10], null);

  // A failed turn is logged with its status and no backend.
  reset(); gemini(500, {}); db = fakeDb(); c = ctx();
  r = await worker.fetch(logReq({ ...ask, session: SID }), env({ CHAT_LOGS: db }), c);
  assert.equal(r.status, 502);
  await Promise.all(c.pending);
  assert.equal(db.ran[1].args[4], 502);
  assert.equal(db.ran[1].args[5], null);

  // No database bound: the chat still answers.
  reset(); geminiOK();
  assert.equal((await worker.fetch(logReq({ ...ask, session: SID }), env(), ctx())).status, 200);

  // /chat/end closes the session; other origins and bad ids are refused or ignored.
  db = fakeDb();
  r = await worker.fetch(logReq({ session: SID }, "/chat/end"), env({ CHAT_LOGS: db }));
  assert.equal(r.status, 204);
  assert.match(db.ran[0].sql, /UPDATE sessions SET ended_at/);
  assert.equal(db.ran[0].args[0], SID);
  db = fakeDb();
  await worker.fetch(logReq({ session: "nope" }, "/chat/end"), env({ CHAT_LOGS: db }));
  assert.equal(db.ran.length, 0);
  const foreign = new Request("https://w.example/chat/end", { method: "POST", headers: { Origin: "https://evil.example" }, body: JSON.stringify({ session: SID }) });
  assert.equal((await worker.fetch(foreign, env({ CHAT_LOGS: fakeDb() }))).status, 403);

  // Daily purge deletes sessions and their messages older than 365 days.
  db = fakeDb();
  await purgeOldLogs(db, Date.parse("2027-10-27T00:00:00Z"));
  assert.equal(db.ran.length, 2);
  assert.equal(db.ran[0].args[0], "2026-10-27T00:00:00.000Z");
  assert.match(db.ran[1].sql, /DELETE FROM sessions/);
}
console.log("session log checks passed");
