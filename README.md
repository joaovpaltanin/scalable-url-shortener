# Scalable URL Shortener

A URL shortener built in **5 evolutionary versions**, each one introducing a real system design concept. This isn't a toy project — it's designed to demonstrate architectural decision-making, trade-off analysis, and measurable improvements.

## Versions

| Version | Concept | Status | Docs |
|---------|---------|--------|------|
| **V1** | Naive baseline (single DB, no cache) | **current** | [Read →](docs/v1.md) |
| V2 | Stateless + Load Balancer | planned | _soon_ |
| V3 | Cache (Redis) to protect the DB | planned | _soon_ |
| V4 | Sharding | planned | _soon_ |
| V5 | Replication + eventual consistency | planned | _soon_ |

## Quick Start

**Prerequisites:** Docker and Docker Compose installed.

```bash
docker compose up --build
# App is available at http://localhost:8080
```

## Tech Stack

- Java 21 + Spring Boot 3.3
- PostgreSQL 16
- Docker Compose
- k6 (load testing)
