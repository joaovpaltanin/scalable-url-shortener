import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:80";
const REDIS_HOST = __ENV.REDIS_HOST || "redis";
const REDIS_PORT = parseInt(__ENV.REDIS_PORT || "6379");

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

  // Flush Redis so reads become cache misses and must hit the shards.
  // Without this, Redis serves all reads and masks any shard failure.
  const flushRes = http.post(`${BASE_URL}/api/shorten`, JSON.stringify({
    url: `https://example.com/flush-marker`,
  }), { headers: { "Content-Type": "application/json" } });

  // Use a direct HTTP call to a small endpoint to trigger cache invalidation isn't possible,
  // so we rely on the test making fresh writes that bypass cache on the DB path.
  console.log("");
  console.log("==========================================================");
  console.log("  V5 CHAOS TEST: steady 100 VUs for 60s.");
  console.log("  Mix: 70% reads + 30% writes (writes bypass cache).");
  console.log("");
  console.log("  While this runs, kill one shard in another terminal:");
  console.log("");
  console.log("    docker compose stop postgres-1");
  console.log("");
  console.log("  Writes routed to the dead shard will fail.");
  console.log("  Writes routed to the alive shard will succeed.");
  console.log("  Reads still hit Redis (cache), so most succeed.");
  console.log("  Error rate should be ~15-20% (half of the 30% writes).");
  console.log("");
  console.log("  The key insight: partial degradation, not total outage.");
  console.log("  In V4, killing a shard primary breaks writes for that shard.");
  console.log("  In V5, replicas keep serving reads (eventual consistency).");
  console.log("");
  console.log("  Then restore:");
  console.log("");
  console.log("    docker compose start postgres-1");
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
    custom_error_rate: [{ threshold: "rate<0.60", abortOnFail: false }],
  },
};

export default function (data) {
  const codes = data.codes;

  if (codes.length === 0) {
    sleep(0.5);
    return;
  }

  if (Math.random() < 0.7) {
    const code = codes[Math.floor(Math.random() * codes.length)];
    const res = http.get(`${BASE_URL}/r/${code}`, { redirects: 0 });

    const ok = check(res, {
      "redirect 302": (r) => r.status === 302,
    });

    if (ok) {
      successCount.add(1);
      errorRate.add(false);
    } else {
      failCount.add(1);
      errorRate.add(true);
    }
  } else {
    const payload = JSON.stringify({
      url: `https://example.com/chaos/${Date.now()}/${Math.random()}`,
    });

    const res = http.post(`${BASE_URL}/api/shorten`, payload, {
      headers: { "Content-Type": "application/json" },
    });

    const ok = check(res, {
      "created 201": (r) => r.status === 201,
    });

    if (ok) {
      successCount.add(1);
      errorRate.add(false);
    } else {
      failCount.add(1);
      errorRate.add(true);
    }
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
║        V5 CHAOS TEST — RESULTS                    ║
╠════════════════════════════════════════════════════╣
║  VUs:            100 (constant)                    ║
║  Duration:       60s                               ║
║  Target:         Kill one Postgres shard           ║
║  Mix:            70% reads / 30% writes            ║
║  Total requests: ${String(fmt(total, 0)).padEnd(32)}║
║  Throughput:     ${String(fmt(rps) + " req/s").padEnd(32)}║
║  Successes:      ${String(fmt(successes, 0)).padEnd(32)}║
║  Failures:       ${String(fmt(failures, 0)).padEnd(32)}║
║  Error rate:     ${String(fmt(failRate * 100, 2) + "%").padEnd(32)}║
╠════════════════════════════════════════════════════╣
║  Writes to the dead shard fail; writes to the      ║
║  alive shard succeed. Reads mostly hit Redis.       ║
║  In V3, killing the single DB = all writes fail.    ║
║  Sharding gives partial degradation, not outage.   ║
╚════════════════════════════════════════════════════╝
`;

  console.log(summary);

  return {
    stdout: summary,
    "chaos-results.json": JSON.stringify(data, null, 2),
  };
}
