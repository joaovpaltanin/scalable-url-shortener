import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:80";

const redirectLatency = new Trend("redirect_latency", true);
const readRequests = new Counter("read_requests");
const writeRequests = new Counter("write_requests");

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
  console.log("Seeded URLs are already cached (write-through).");
  console.log("Subsequent reads should hit Redis, not PostgreSQL.");
  return { codes };
}

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
    const code = codes[Math.floor(Math.random() * codes.length)];
    const res = http.get(`${BASE_URL}/r/${code}`, { redirects: 0 });

    check(res, {
      "redirect 302": (r) => r.status === 302,
      "has Location header": (r) => r.headers["Location"] !== undefined,
    });

    readRequests.add(1);
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

    writeRequests.add(1);
  }

  sleep(0.1);
}

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
  const reads = data.metrics.read_requests
    ? data.metrics.read_requests.values.count
    : "N/A";
  const writes = data.metrics.write_requests
    ? data.metrics.write_requests.values.count
    : "N/A";
  const redirectP95 = data.metrics.redirect_latency
    ? data.metrics.redirect_latency.values["p(95)"]
    : "N/A";

  const summary = `
========================================
  V3 BASELINE — LOAD TEST RESULTS
========================================
  Throughput:      ${typeof rps === "number" ? rps.toFixed(1) : rps} req/s
  Latency p95:     ${typeof p95 === "number" ? p95.toFixed(1) : p95} ms
  Redirect p95:    ${typeof redirectP95 === "number" ? redirectP95.toFixed(1) : redirectP95} ms
  Error rate:      ${typeof fails === "number" ? (fails * 100).toFixed(2) : fails}%
  Read requests:   ${reads}
  Write requests:  ${writes}
========================================
  Reads hit Redis (cache-through).
  Compare redirect p95 with V2 to see
  the cache improvement.
========================================
`;

  console.log(summary);

  return {
    stdout: summary,
    "results.json": JSON.stringify(data, null, 2),
  };
}
