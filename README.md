# Scalable URL Shortener

A URL shortener built in **5 evolutionary versions**, each one introducing a real system design concept. This isn't a toy project — it's designed to demonstrate architectural decision-making, trade-off analysis, and measurable improvements.

## Versions

| Version | Concept | Status | Docs |
| ------- | ------- | ------ | ---- |
| V1 | Naive baseline (single DB, no cache) | done | [Read →](docs/v1/v1.md) |
| V2 | Stateless + Load Balancer | done | [Read →](docs/v2/v2.md) |
| **V3** | Cache (Redis) to protect the DB | **current** | [Read →](docs/v3/v3.md) |
| V4 | Sharding | planned | _soon_ |
| V5 | Replication + eventual consistency | planned | _soon_ |

## Quick Start

**Prerequisites:** Docker and Docker Compose installed.

```bash
docker compose up --build
# App is available at http://localhost (port 80, via Nginx)
```

## Tech Stack

- Java 21 + Spring Boot 3.3
- PostgreSQL 16
- Redis 7 (cache)
- Nginx (load balancer)
- Docker Compose
- k6 (load testing)
