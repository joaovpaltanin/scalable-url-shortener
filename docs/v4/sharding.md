# Sharding in Software Engineering

[← Back to V4](v4.md)

## What is Sharding?

Sharding is a **horizontal partitioning** strategy: instead of storing all data in a single database, you split the dataset across multiple independent database instances called **shards**. Each shard holds a subset of the data and operates as a fully autonomous database — it has its own CPU, memory, disk, and connection pool.

The term comes from the concept of breaking a whole into shards (fragments). In software engineering, it's one of the most important techniques for scaling write-heavy systems beyond the limits of a single machine.

## Why Use Sharding?

A single database has physical limits. No matter how powerful the hardware, there's a ceiling on how many writes per second one instance can handle. When you hit that ceiling, you have two options:

**Vertical scaling (scale up):** buy a bigger machine — more CPU, more RAM, faster disks. This works up to a point, but it's expensive, has diminishing returns, and there's always a hardware ceiling. You can't buy a machine with infinite IOPS.

**Horizontal scaling (scale out):** distribute data across multiple machines. Each machine handles a fraction of the total load. This is sharding. In theory, 2 shards handle 2x the write throughput, 4 shards handle 4x, and so on.

In this project, V1 through V3 use a single PostgreSQL instance. All 3 app replicas funnel every `INSERT` into the same DB. The database is the bottleneck, and adding more app replicas only makes it worse — more connections, more contention, same single disk.

## When to Use Sharding

Sharding adds complexity. It's not a default choice — it's a response to specific problems:

| Signal | Example | Sharding helps? |
|--------|---------|:---:|
| Single DB can't handle write volume | INSERT throughput plateaus, latency grows | Yes |
| Table size exceeds what one machine can index efficiently | Billions of rows, index scans slow down | Yes |
| Read replicas aren't enough | You already have replicas but writes are the bottleneck | Yes |
| You need fault isolation | One dataset failure shouldn't take down everything | Yes |
| Queries always need the full dataset | Analytics, aggregations across all data | No — sharding makes this harder |
| Data volume is small/moderate | Millions of rows, single DB handles it fine | No — premature optimization |

**Rule of thumb:** if a read replica or a bigger machine solves the problem, don't shard. Shard when you've exhausted simpler options and the write path is the bottleneck.

## How Sharding Works

Every sharding system answers three questions:

**1. What is the shard key?** The field used to decide which shard owns a record. It must be present in every query so the application knows where to route. In this project, the shard key is the short `code` — every read and write includes it.

**2. How to map key to shard?** The routing function. Common strategies:

- **Hash-based** (used here): apply a hash function to the key and take modulo N. `Math.abs(code.hashCode() % 2)` distributes codes uniformly across 2 shards. Simple, stateless, no coordination needed.
- **Range-based:** partition by value ranges (e.g., codes starting with A-M go to shard 0, N-Z to shard 1). Can create hotspots if distribution is uneven.
- **Directory-based:** a lookup table maps each key to its shard. Flexible but introduces a single point of lookup.
- **Consistent hashing:** a hash ring that minimizes data movement when shards are added or removed. Used by Cassandra, DynamoDB, and other distributed systems. More complex, but essential when the shard count changes frequently.

**3. How does the application route queries?** The application (not the database) decides which shard to query. This is **application-level sharding** — the `ShardRouter` in our code computes the shard index and returns the correct `JdbcTemplate`. The database itself is unaware it's part of a sharded system.

## Trade-offs

Sharding is not free. It introduces real complexity:

| Benefit | Cost |
|---------|------|
| Linear write scalability | Application must handle routing logic |
| Fault isolation (one shard down ≠ total outage) | Cross-shard queries require scatter-gather |
| Independent scaling per shard | Rebalancing data when adding shards is hard |
| Smaller indexes per shard (faster lookups) | JOINs across shards are not possible |
| Each shard can be tuned independently | Operational overhead: N databases to monitor, backup, upgrade |

In this project, the trade-offs are manageable: every operation uses the short code as key, so there are no cross-shard queries. The routing is stateless and deterministic. The cost is giving up JPA (which assumes a single DataSource) in favor of `JdbcTemplate` with explicit shard routing.
