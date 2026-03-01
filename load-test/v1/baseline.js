import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";

const dbHits = new Counter("db_hits");
const redirectLatency = new Trend("redirect_latency", true);

// ---------------------------------------------------------------------------
// Phase 1 (setup): Seed the database with short URLs that will be read later.
// ---------------------------------------------------------------------------
export function setup() {
  const codes = [];
  const seedCount = parseInt(__ENV.SEED_COUNT || "500");

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
      const shortUrl = body.shortUrl;
      const code = shortUrl.split("/r/")[1];
      codes.push(code);
    }
  }

  console.log(`Seeded ${codes.length} URLs successfully.`);
  return { codes };
}

// ---------------------------------------------------------------------------
// Phase 2 (default): Hammer GET /r/{code} — simulates read-heavy production.
// Mix: 90% reads, 10% writes.
// ---------------------------------------------------------------------------
export const options = {
  scenarios: {
    read_heavy: {
      executor: "ramping-vus",
      startVUs: 10,
      stages: [
        { duration: "30s", target: 50 },
        { duration: "1m", target: 200 },
        { duration: "30s", target: 200 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<500"],
    http_req_failed: ["rate<0.01"],
  },
};

export default function (data) {
  const codes = data.codes;

  if (Math.random() < 0.9 && codes.length > 0) {
    // --- READ ---
    const code = codes[Math.floor(Math.random() * codes.length)];
    const res = http.get(`${BASE_URL}/r/${code}`, { redirects: 0 });

    check(res, {
      "redirect 302": (r) => r.status === 302,
      "has Location header": (r) => r.headers["Location"] !== undefined,
    });

    dbHits.add(1);
    redirectLatency.add(res.timings.duration);
  } else {
    // --- WRITE ---
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

  sleep(0.1);
}

// ---------------------------------------------------------------------------
// Summary: human-readable output printed at the end of the test run.
// ---------------------------------------------------------------------------
export function handleSummary(data) {
  const p95 = data.metrics.http_req_duration
    ? data.metrics.http_req_duration.values["p(95)"]
    : "N/A";
  const rps = data.metrics.http_reqs
    ? data.metrics.http_reqs.values.rate
    : "N/A";
  const fails = data.metrics.http_req_failed
    ? data.metrics.http_req_failed.values.rate
    : "N/A";

  const summary = `
========================================
  V1 BASELINE — LOAD TEST RESULTS
========================================
  Throughput:    ${typeof rps === "number" ? rps.toFixed(1) : rps} req/s
  Latency p95:   ${typeof p95 === "number" ? p95.toFixed(1) : p95} ms
  Error rate:    ${typeof fails === "number" ? (fails * 100).toFixed(2) : fails}%
========================================
`;

  console.log(summary);

  return {
    stdout: summary,
    "results.json": JSON.stringify(data, null, 2),
  };
}
