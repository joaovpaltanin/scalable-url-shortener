import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";

const dbHits = new Counter("db_hits");
const redirectLatency = new Trend("redirect_latency", true);

// ---------------------------------------------------------------------------
// Phase 1 (setup): Seed the database with short URLs for read operations.
// ---------------------------------------------------------------------------
export function setup() {
  const codes = [];
  const seedCount = parseInt(__ENV.SEED_COUNT || "1000");

  console.log(`Seeding ${seedCount} URLs...`);

  for (let i = 0; i < seedCount; i++) {
    const payload = JSON.stringify({
      url: `https://example.com/page/${i}`,
    });

    const res = http.post(`${BASE_URL}/api/shorten`, payload, {
      headers: { "Content-Type": "application/json" },
    });

    if (res.status === 201) {
      const body = JSON.parse(res.body);
      const code = body.shortUrl.split("/r/")[1];
      codes.push(code);
    }
  }

  console.log(`Seeded ${codes.length} URLs successfully.`);
  return { codes };
}

// ---------------------------------------------------------------------------
// Phase 2: Near-critical stress — push toward the breaking point.
// Tuned for local Docker environments (all containers share the same CPU).
//
//   Stage 1 — Warm-up:        10 → 200 VUs   (quick ramp to known safe zone)
//   Stage 2 — Previous peak: 200 → 500 VUs   (previous stress level)
//   Stage 3 — Beyond:        500 → 600 VUs   (3x baseline)
//   Stage 4 — Critical:      600 → 700 VUs   (3.5x baseline, expect degradation)
//   Stage 5 — Hold peak:     700 VUs          (sustain to reveal failures)
//   Stage 6 — Cool-down:     700 → 0   VUs
//
// Mix: 90% reads, 10% writes (same as baseline for fair comparison).
// ---------------------------------------------------------------------------
export const options = {
  scenarios: {
    gradual_stress: {
      executor: "ramping-vus",
      startVUs: 10,
      stages: [
        { duration: "15s", target: 200 },
        { duration: "30s", target: 500 },
        { duration: "30s", target: 600 },
        { duration: "30s", target: 700 },
        { duration: "20s", target: 700 },
        { duration: "15s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    http_req_duration: [
      { threshold: "p(95)<500", abortOnFail: false },
    ],
    http_req_failed: [
      { threshold: "rate<0.01", abortOnFail: false },
    ],
  },
};

export default function (data) {
  const codes = data.codes;

  if (Math.random() < 0.9 && codes.length > 0) {
    const code = codes[Math.floor(Math.random() * codes.length)];
    const res = http.get(`${BASE_URL}/r/${code}`, { redirects: 0 });

    check(res, {
      "redirect 302": (r) => r.status === 302,
      "has Location header": (r) => r.headers["Location"] !== undefined,
    });

    dbHits.add(1);
    redirectLatency.add(res.timings.duration);
  } else {
    const payload = JSON.stringify({
      url: `https://example.com/dynamic/${Date.now()}/${Math.random()}`,
    });

    const res = http.post(`${BASE_URL}/api/shorten`, payload, {
      headers: { "Content-Type": "application/json" },
    });

    check(res, {
      "created 201": (r) => r.status === 201,
    });
  }

  sleep(0.07);
}

// ---------------------------------------------------------------------------
// Summary: compare each stage against the baseline numbers.
// ---------------------------------------------------------------------------
export function handleSummary(data) {
  const p95 = data.metrics.http_req_duration
    ? data.metrics.http_req_duration.values["p(95)"]
    : "N/A";
  const p90 = data.metrics.http_req_duration
    ? data.metrics.http_req_duration.values["p(90)"]
    : "N/A";
  const avg = data.metrics.http_req_duration
    ? data.metrics.http_req_duration.values["avg"]
    : "N/A";
  const max = data.metrics.http_req_duration
    ? data.metrics.http_req_duration.values["max"]
    : "N/A";
  const rps = data.metrics.http_reqs
    ? data.metrics.http_reqs.values.rate
    : "N/A";
  const fails = data.metrics.http_req_failed
    ? data.metrics.http_req_failed.values.rate
    : "N/A";
  const totalReqs = data.metrics.http_reqs
    ? data.metrics.http_reqs.values.count
    : "N/A";

  const fmt = (v, d = 1) => (typeof v === "number" ? v.toFixed(d) : v);

  const summary = `
╔══════════════════════════════════════════════════╗
║         V1 STRESS TEST — RESULTS                 ║
╠══════════════════════════════════════════════════╣
║  Peak VUs:       700                             ║
║  Total requests: ${String(fmt(totalReqs, 0)).padEnd(30)}║
║  Throughput:     ${String(fmt(rps) + " req/s").padEnd(30)}║
║  Latency avg:    ${String(fmt(avg) + " ms").padEnd(30)}║
║  Latency p90:    ${String(fmt(p90) + " ms").padEnd(30)}║
║  Latency p95:    ${String(fmt(p95) + " ms").padEnd(30)}║
║  Latency max:    ${String(fmt(max) + " ms").padEnd(30)}║
║  Error rate:     ${String(fmt(fails * 100, 2) + "%").padEnd(30)}║
╠══════════════════════════════════════════════════╣
║  BASELINE (200 VUs):  1125 req/s | p95: 4.1 ms  ║
╚══════════════════════════════════════════════════╝
`;

  console.log(summary);

  return {
    stdout: summary,
    "stress-results.json": JSON.stringify(data, null, 2),
  };
}
