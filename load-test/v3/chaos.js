import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:80";

const successCount = new Counter("success_count");
const failCount = new Counter("fail_count");
const errorRate = new Rate("custom_error_rate");

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
      const code = JSON.parse(res.body).shortUrl.split("/r/")[1];
      codes.push(code);
    }
  }

  console.log(`Seeded ${codes.length} URLs successfully.`);
  console.log("");
  console.log("==========================================================");
  console.log("  V3 CHAOS TEST: steady 100 VUs for 60s.");
  console.log("  While this runs, kill Redis in another terminal:");
  console.log("");
  console.log("    docker compose stop redis");
  console.log("");
  console.log("  Traffic should keep flowing — the app falls back to");
  console.log("  PostgreSQL. Latency will increase but errors should");
  console.log("  stay near 0%, proving Redis is not a SPOF.");
  console.log("");
  console.log("  Then restore:");
  console.log("");
  console.log("    docker compose start redis");
  console.log("==========================================================");
  console.log("");

  return { codes };
}

export const options = {
  scenarios: {
    steady: {
      executor: "constant-vus",
      vus: 100,
      duration: "60s",
    },
  },
  thresholds: {
    custom_error_rate: [{ threshold: "rate<0.05", abortOnFail: false }],
  },
};

export default function (data) {
  const codes = data.codes;

  if (codes.length === 0) {
    sleep(0.5);
    return;
  }

  const code = codes[Math.floor(Math.random() * codes.length)];
  const res = http.get(`${BASE_URL}/r/${code}`, { redirects: 0 });

  const ok = check(res, {
    "status is 302": (r) => r.status === 302,
  });

  if (ok) {
    successCount.add(1);
    errorRate.add(false);
  } else {
    failCount.add(1);
    errorRate.add(true);
  }

  sleep(0.1);
}

export function handleSummary(data) {
  const get = (metric, stat) =>
    data.metrics[metric] ? data.metrics[metric].values[stat] : "N/A";
  const fmt = (v, d = 1) => (typeof v === "number" ? v.toFixed(d) : v);

  const total = get("http_reqs", "count");
  const rps = get("http_reqs", "rate");
  const failRate = get("http_req_failed", "rate");
  const successes = get("success_count", "count");
  const failures = get("fail_count", "count");

  const summary = `
╔════════════════════════════════════════════════════╗
║        V3 CHAOS TEST — RESULTS                    ║
╠════════════════════════════════════════════════════╣
║  VUs:            100 (constant)                    ║
║  Duration:       60s                               ║
║  Target:         Kill Redis mid-traffic            ║
║  Total requests: ${String(fmt(total, 0)).padEnd(32)}║
║  Throughput:     ${String(fmt(rps) + " req/s").padEnd(32)}║
║  Successes:      ${String(fmt(successes, 0)).padEnd(32)}║
║  Failures:       ${String(fmt(failures, 0)).padEnd(32)}║
║  Error rate:     ${String(fmt(failRate * 100, 2) + "%").padEnd(32)}║
╠════════════════════════════════════════════════════╣
║  With Redis down, the app falls back to Postgres.  ║
║  Error rate should stay near 0% — Redis is not a   ║
║  single point of failure, just a performance layer. ║
╚════════════════════════════════════════════════════╝
`;

  console.log(summary);

  return {
    stdout: summary,
    "chaos-results.json": JSON.stringify(data, null, 2),
  };
}
