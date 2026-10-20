// Self-check for the Worker's request handling. No network, no real keys:
// Gemini and Workers AI are both stubs. Run:  node worker/test.mjs
import assert from "node:assert/strict";
import worker, { toTurns } from "./src/index.js";

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
assert.ok(!msgs[0].content.includes("PRIVATE NOTES") && !msgs[0].content.includes(NOTE), "fallback never sees private notes");
// No KV binding, or a KV error: Gemini still answers, from the public text.
for (const NOTES_KV of [undefined, { get: async () => { throw new Error("kv down"); } }]) {
  reset(); geminiOK();
  assert.equal((await worker.fetch(req(ask), env({ NOTES_KV }))).status, 200);
  assert.ok(!JSON.parse(geminiCalls[0].init.body).systemInstruction.parts[0].text.includes("PRIVATE NOTES"));
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

// 6. Both exhausted -> "today's limit"; both broken -> generic; nothing leaks
reset(); gemini(429, { error: { message: "project 123" } });
r = await worker.fetch(req(ask), env({ AI: ai(() => { throw new Error("4006: daily free allocation exceeded"); }) }));
assert.equal(r.status, 503);
const limitBody = await r.text();
assert.ok(limitBody.includes("today's limit"));
assert.ok(!limitBody.includes("project 123") && !limitBody.includes("4006"), "upstream details not leaked");
reset(); gemini(500, {});
r = await worker.fetch(req(ask), env({ AI: ai(() => { throw new Error("internal"); }) }));
assert.equal(r.status, 502);

// 7. Gemini only, no AI binding: quota still reported as a limit
reset(); gemini(429, {});
assert.equal((await worker.fetch(req(ask), env())).status, 503);

console.log("worker self-check: all assertions passed");
