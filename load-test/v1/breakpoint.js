import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";

const dbHits = new Counter("db_hits");
const redirectLatency = new Trend("redirect_latency", true);

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
      const code = JSON.parse(res.body).shortUrl.split("/r/")[1];
      codes.push(code);
    }
  }

  console.log(`Seeded ${codes.length} URLs successfully.`);
  return { codes };
}

// ---------------------------------------------------------------------------
// Breakpoint test: ramp linearly until something breaks.
//
// The idea is simple — keep adding VUs until errors appear or latency
// explodes. This finds the real ceiling of a single-instance system.
//
//   0:00 – 0:30    10 → 500 VUs    (fast ramp past known safe zone)
//   0:30 – 1:00    500 → 1000 VUs  (double baseline peak)
//   1:00 – 1:30    1000 → 1500 VUs (unknown territory)
//   1:30 – 2:00    1500 → 2000 VUs (likely breaking point)
//   2:00 – 2:20    2000 VUs        (hold at peak to confirm failures)
//   2:20 – 2:40    2000 → 0 VUs    (cool-down)
//
// Thresholds do NOT abort — we want the full picture.
// ---------------------------------------------------------------------------
export const options = {
  scenarios: {
    breakpoint: {
      executor: "ramping-vus",
      startVUs: 10,
      stages: [
        { duration: "30s", target: 500 },
        { duration: "30s", target: 1000 },
        { duration: "30s", target: 1500 },
        { duration: "30s", target: 2000 },
        { duration: "20s", target: 2000 },
        { duration: "20s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    http_req_duration: [{ threshold: "p(95)<500", abortOnFail: false }],
    http_req_failed: [{ threshold: "rate<0.05", abortOnFail: false }],
  },
};

export default function (data) {
  const codes = data.codes;

  if (Math.random() < 0.9 && codes.length > 0) {
    const code = codes[Math.floor(Math.random() * codes.length)];
    const res = http.get(`${BASE_URL}/r/${code}`, { redirects: 0 });

    check(res, {
      "redirect 302": (r) => r.status === 302,
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

  sleep(0.05);
}

export function handleSummary(data) {
  const get = (metric, stat) =>
    data.metrics[metric] ? data.metrics[metric].values[stat] : "N/A";
  const fmt = (v, d = 1) => (typeof v === "number" ? v.toFixed(d) : v);

  const p95 = get("http_req_duration", "p(95)");
  const p90 = get("http_req_duration", "p(90)");
  const avg = get("http_req_duration", "avg");
  const max = get("http_req_duration", "max");
  const rps = get("http_reqs", "rate");
  const total = get("http_reqs", "count");
  const failRate = get("http_req_failed", "rate");

  const summary = `
╔════════════════════════════════════════════════════╗
║        V1 BREAKPOINT TEST — RESULTS               ║
╠════════════════════════════════════════════════════╣
║  Peak VUs:       2000                              ║
║  Total requests: ${String(fmt(total, 0)).padEnd(32)}║
║  Throughput:     ${String(fmt(rps) + " req/s").padEnd(32)}║
║  Latency avg:    ${String(fmt(avg) + " ms").padEnd(32)}║
║  Latency p90:    ${String(fmt(p90) + " ms").padEnd(32)}║
║  Latency p95:    ${String(fmt(p95) + " ms").padEnd(32)}║
║  Latency max:    ${String(fmt(max) + " ms").padEnd(32)}║
║  Error rate:     ${String(fmt(failRate * 100, 2) + "%").padEnd(32)}║
╚════════════════════════════════════════════════════╝
`;

  console.log(summary);

  return {
    stdout: summary,
    "breakpoint-results.json": JSON.stringify(data, null, 2),
  };
}
