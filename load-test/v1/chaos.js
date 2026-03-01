import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";

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
  console.log("  CHAOS TEST: steady 100 VUs for 60s.");
  console.log("  While this runs, kill the app in another terminal:");
  console.log("");
  console.log("    docker compose stop app");
  console.log("");
  console.log("  Watch the error rate spike to 100%.");
  console.log("  Then restart it:");
  console.log("");
  console.log("    docker compose start app");
  console.log("");
  console.log("  Watch recovery (or lack of it).");
  console.log("==========================================================");
  console.log("");

  return { codes };
}

// ---------------------------------------------------------------------------
// Steady-state load at 100 VUs for 60 seconds.
// This is NOT about finding a limit — it's about proving that killing the
// single app instance causes 100% downtime with zero recovery.
//
// Run this test, then in another terminal:
//   docker compose stop app      ← everything dies
//   docker compose start app     ← recovery (maybe)
// ---------------------------------------------------------------------------
export const options = {
  scenarios: {
    steady: {
      executor: "constant-vus",
      vus: 100,
      duration: "60s",
    },
  },
  thresholds: {
    custom_error_rate: [{ threshold: "rate<0.01", abortOnFail: false }],
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
║        V1 CHAOS TEST — RESULTS                    ║
╠════════════════════════════════════════════════════╣
║  VUs:            100 (constant)                    ║
║  Duration:       60s                               ║
║  Total requests: ${String(fmt(total, 0)).padEnd(32)}║
║  Throughput:     ${String(fmt(rps) + " req/s").padEnd(32)}║
║  Successes:      ${String(fmt(successes, 0)).padEnd(32)}║
║  Failures:       ${String(fmt(failures, 0)).padEnd(32)}║
║  Error rate:     ${String(fmt(failRate * 100, 2) + "%").padEnd(32)}║
╠════════════════════════════════════════════════════╣
║  If you killed the app mid-test, failures should   ║
║  show 100% error rate during downtime — proving    ║
║  single instance = single point of failure.        ║
╚════════════════════════════════════════════════════╝
`;

  console.log(summary);

  return {
    stdout: summary,
    "chaos-results.json": JSON.stringify(data, null, 2),
  };
}
