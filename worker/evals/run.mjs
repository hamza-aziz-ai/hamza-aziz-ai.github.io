// Answer checks against the live chat assistant (D-023). Asks every case in
// cases.mjs, checks the reply's facts, and records how long it took and which
// backend answered. A case that fails is asked once more, because model
// replies vary; it fails only if both answers break a rule.
// Exit 1 if any case fails or a reply is too slow, so CI goes red.
// Run:  node worker/evals/run.mjs   (ENDPOINT overrides the live URL)
import cases from "./cases.mjs";
import { appendFileSync } from "node:fs";

const ENDPOINT = process.env.ENDPOINT || "https://hamzaaziz-chat.hamza-aziz-ai.workers.dev/chat";
const ORIGIN = "https://hamzaaziz.dev";
// The Worker allows 10 messages a minute per IP; stay under it.
const MIN_GAP_MS = 6500;
// Gemini gives up at 8 s and the fallback answers in a few seconds, so a
// reply slower than this means the timeout or the fallback is broken.
const MAX_REPLY_MS = 20000;

let lastStart = 0;
async function ask(q) {
  const wait = lastStart + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastStart = Date.now();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ messages: [{ role: "user", text: q }], tz: "Asia/Kolkata" }),
    signal: AbortSignal.timeout(60000),
  }).catch((err) => ({ ok: false, status: 0, headers: new Headers(), json: async () => ({ error: String(err) }) }));
  const ms = Date.now() - lastStart;
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ms, backend: res.headers.get("X-Chat-Backend") || "-", reply: data.reply || "", error: data.error };
}

function problems(c, a) {
  if (!a.reply) return [`no reply (HTTP ${a.status}${a.error ? `: ${a.error}` : ""})`];
  const out = [];
  for (const re of c.must || []) if (!re.test(a.reply)) out.push(`missing ${re}`);
  for (const re of c.mustNot || []) if (re.test(a.reply)) out.push(`contains ${re}`);
  if (c.maxWords && a.reply.split(/\s+/).length > c.maxWords) out.push(`over ${c.maxWords} words`);
  return out;
}

const rows = [];
for (const c of cases) {
  let a = await ask(c.q);
  let bad = problems(c, a);
  let note = "";
  if (bad.length) {
    const retry = await ask(c.q);
    const badRetry = problems(c, retry);
    note = badRetry.length ? "failed twice" : "passed on retry";
    if (!badRetry.length) bad = [];
    a = retry;
    if (badRetry.length) bad = badRetry;
  }
  const slow = a.ms > MAX_REPLY_MS;
  rows.push({ id: c.id, ok: !bad.length && !slow, ms: a.ms, backend: a.backend, note: [note, slow ? `slow (>${MAX_REPLY_MS / 1000} s)` : "", ...bad].filter(Boolean).join("; "), reply: a.reply });
  console.log(`${!bad.length && !slow ? "PASS" : "FAIL"}  ${c.id.padEnd(18)} ${String(a.ms).padStart(6)} ms  ${a.backend.padEnd(10)} ${rows.at(-1).note}`);
  if (bad.length || slow) console.log(`      reply: ${a.reply.replace(/\s+/g, " ").slice(0, 300)}`);
}

const times = rows.map((r) => r.ms).sort((x, y) => x - y);
const p50 = times[Math.floor(times.length / 2)];
const p90 = times[Math.min(times.length - 1, Math.floor(times.length * 0.9))];
const fallback = rows.filter((r) => r.backend === "workers-ai").length;
const failed = rows.filter((r) => !r.ok);
const summary = [
  `${rows.length - failed.length}/${rows.length} passed. Reply time p50 ${(p50 / 1000).toFixed(1)} s, p90 ${(p90 / 1000).toFixed(1)} s. ` +
    `Answered by Gemini ${rows.length - fallback}, by the Workers AI fallback ${fallback}.`,
];
console.log("\n" + summary[0]);

if (process.env.GITHUB_STEP_SUMMARY) {
  const table = ["| Case | Result | Time | Backend | Note |", "|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.id} | ${r.ok ? "pass" : "**FAIL**"} | ${(r.ms / 1000).toFixed(1)} s | ${r.backend} | ${r.note.replace(/\|/g, "\\|")} |`)];
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Chat answer checks\n\n${summary[0]}\n\n${table.join("\n")}\n`);
}
process.exit(failed.length ? 1 : 0);
