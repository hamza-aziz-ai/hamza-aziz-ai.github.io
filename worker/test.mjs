// Self-check for the Worker's request handling. No network, no real keys:
// Gemini and Workers AI are both stubs. Run:  node worker/test.mjs
import assert from "node:assert/strict";
import worker, { toTurns, nextMidnight, geminiResetAt } from "./src/index.js";

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

// 2. Gemini out of quota -> Workers AI answers with the CORE prompt
reset(); gemini(429, { error: { message: "quota exceeded for project 123" } });
r = await worker.fetch(req(ask), env({ AI: ai(() => ({ response: "From Workers AI." })) }));
assert.equal(r.status, 200);
assert.deepEqual(await r.json(), { reply: "From Workers AI." });
assert.equal(r.headers.get("X-Chat-Backend"), "workers-ai");
assert.equal(aiCalls[0].model, "@cf/test");
const msgs = aiCalls[0].input.messages;
assert.deepEqual(msgs.map((m) => m.role), ["system", "user", "assistant", "user"], "model role mapped to assistant");
assert.ok(msgs[0].content.length < fullPromptLen / 2, "fallback gets the smaller core prompt");
assert.ok(msgs[0].content.includes("KNOWLEDGE"));
// Private notes reach Gemini when present, and never the fallback.
assert.ok(gBody.systemInstruction.parts[0].text.endsWith(NOTE), "Gemini gets the KV notes");
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

console.log("worker self-check: all assertions passed");
