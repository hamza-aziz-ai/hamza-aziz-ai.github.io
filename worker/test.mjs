// Self-check for the Worker's request handling. No network, no real key:
// Gemini is replaced by a stub. Run:  node worker/test.mjs
import assert from "node:assert/strict";
import worker, { toContents } from "./src/index.js";

const ORIGIN = "https://hamzaaziz.dev";
const env = (over = {}) => ({ ALLOWED_ORIGINS: ORIGIN, MODEL: "test-model", GEMINI_API_KEY: "k", ...over });
const req = (body, { origin = ORIGIN, method = "POST", path = "/chat" } = {}) =>
  new Request(`https://w.example${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) },
    body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
const ask = { messages: [{ role: "user", text: "What does Hamza work on?" }] };

let upstreamCalls = [];
const stub = (status, payload) => {
  globalThis.fetch = async (url, init) => {
    upstreamCalls.push({ url, init });
    return new Response(JSON.stringify(payload), { status });
  };
};

// toContents validation
assert.equal(toContents([]), null, "empty rejected");
assert.equal(toContents([{ role: "model", text: "hi" }]), null, "must end with user");
assert.equal(toContents([{ role: "user", text: "x".repeat(801) }]), null, "over 800 chars rejected");
assert.equal(toContents([{ role: "system", text: "hi" }]), null, "unknown role rejected");
assert.equal(toContents(Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? "model" : "user", text: "q" })).concat({ role: "user", text: "last" })).length, 8, "trimmed to last 8");

// Routing and CORS
assert.equal((await worker.fetch(req(ask, { path: "/x" }), env())).status, 404);
assert.equal((await worker.fetch(req(null, { method: "OPTIONS" }), env())).status, 204, "preflight from allowed origin");
assert.equal((await worker.fetch(req(null, { method: "OPTIONS", origin: "https://evil.example" }), env())).status, 403, "preflight from other origin");
assert.equal((await worker.fetch(req(ask, { origin: "https://evil.example" }), env())).status, 403, "POST from other origin");
assert.equal((await worker.fetch(req(ask, { origin: null }), env())).status, 403, "POST with no origin");
assert.equal((await worker.fetch(req(null, { method: "GET" }), env())).status, 405);

// Input and config errors
assert.equal((await worker.fetch(req("{not json"), env())).status, 400);
assert.equal((await worker.fetch(req({ messages: [] }), env())).status, 400);
assert.equal((await worker.fetch(req(ask), env({ GEMINI_API_KEY: "" }))).status, 503, "missing key");

// Rate limiter
const limited = await worker.fetch(req(ask), env({ CHAT_LIMITER: { limit: async () => ({ success: false }) } }));
assert.equal(limited.status, 429, "rate limited");

// Happy path: reply returned, key sent as header not in URL, CORS echoed
upstreamCalls = [];
stub(200, { candidates: [{ content: { parts: [{ text: "He builds voice AI." }] } }] });
let r = await worker.fetch(req(ask), env({ CHAT_LIMITER: { limit: async () => ({ success: true }) } }));
assert.equal(r.status, 200);
assert.deepEqual(await r.json(), { reply: "He builds voice AI." });
assert.equal(r.headers.get("Access-Control-Allow-Origin"), ORIGIN);
assert.equal(upstreamCalls.length, 1);
assert.ok(upstreamCalls[0].url.endsWith("/models/test-model:generateContent"));
assert.ok(!upstreamCalls[0].url.includes("key="), "key never in URL");
assert.equal(upstreamCalls[0].init.headers["x-goog-api-key"], "k");
const sent = JSON.parse(upstreamCalls[0].init.body);
assert.ok(sent.systemInstruction.parts[0].text.includes("KNOWLEDGE"), "knowledge sent");
assert.equal(sent.generationConfig.maxOutputTokens, 450);

// Upstream failures are mapped, never passed through
stub(429, { error: { message: "quota exceeded for project 123" } });
r = await worker.fetch(req(ask), env());
assert.equal(r.status, 503);
assert.ok(!(await r.text()).includes("project 123"), "upstream body not leaked");
stub(500, { error: "boom" });
assert.equal((await worker.fetch(req(ask), env())).status, 502);
stub(200, { candidates: [] });
assert.equal((await worker.fetch(req(ask), env())).status, 502, "empty answer");
globalThis.fetch = async () => { throw new Error("network down"); };
assert.equal((await worker.fetch(req(ask), env())).status, 503, "network error");

console.log("worker self-check: all assertions passed");
