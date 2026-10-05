# Kafka Design Decisions - Sprint 7

## Overview

This document records the design decisions for the Kafka topics created in Sprint 7, per `contracts/kafka-topics.md`. These decisions are binding and justify the partition counts and key choices implemented in `infra/kafka/create-topics.sh`.

## Topic Architecture

Three primary topics are created with their corresponding dead-letter topics:
- `orders` (3 partitions, 7-day retention)
- `trade-events` (3 partitions, 30-day retention)
- `market-data` (6 partitions, 1-day retention)

## Key Design Decisions

### 1. Why Partition Counts Matter

Kafka orders messages **within a partition** only. Messages across different partitions have no ordering guarantee. The partition count determines:
- **Parallelism**: Number of consumer instances that can process the same topic in one consumer group
- **Ordering scope**: What messages must maintain order relative to each other
- **Scalability**: Partitions cannot be decreased after creation; they can only be increased (which rehashes keys and splits historical data)

Partition counts are permanent decisions. Once set, increasing them rehashes the key distribution, causing an account's historical messages to split across new partitions.

### 2. `orders` Topic - 3 Partitions, keyed by `accountId`

**Partition Count Rationale:**
- Three partitions allow up to three executor instances to run in a single consumer group (`trade-executor`)
- This demonstrates rebalancing behavior and shows that a consumer group cannot usefully exceed the partition count
- Three is sufficient for local development and small-scale execution
- Allows horizontal scaling to three concurrent executors without reshuffling keys

**Key Choice Rationale: `accountId` as the key**
- Orders for the same account must be executed **in the order they were accepted**
- If account A places a BUY order followed by a SELL order, the SELL must not execute before the BUY (which could cause insufficient holdings)
- Keying by `accountId` ensures all orders for the same account hash to the same partition, preserving per-account ordering
- Keying by `orderId` instead would place each message on its own partition, breaking per-account ordering guarantee
- Two orders on different accounts have no relationship and can execute in parallel across partitions

**Failure Mode to Avoid:**
Keying by `orderId`: This would send each order to a different partition (since every order ID is unique), destroying the ordering guarantee. Results would be unpredictable and catastrophic for correctness.

### 3. `trade-events` Topic - 3 Partitions, keyed by `accountId`

**Partition Count Rationale:**
- Matches `orders` partition count for consistency
- Multiple consumers (notification-service, portfolio-service, advice-service, etc.) read from this topic as an event log
- Each consumer group has its own offset tracking, so they don't interfere
- Three partitions is sufficient for the current architecture

**Key Choice Rationale: `accountId` as the key**
- Trade events describe order outcomes (FILLED, REJECTED, CANCELLED) for orders
- A consumer maintaining per-account state (e.g., portfolio position) needs events in order per account
- Keying by `accountId` ensures events for the same account are processed in order
- Events for different accounts can be processed in parallel without dependency

### 4. `market-data` Topic - 6 Partitions, keyed by `symbol`

**Partition Count Rationale:**
- Market data is high-volume (quotes polled from Fauxnance at short intervals)
- Six partitions provide higher parallelism than the other topics, reflecting the higher message rate
- Supports multiple market-data consumers without bottlenecks
- Six partitions on a single local broker demonstrates partition-level scalability

**Key Choice Rationale: `symbol` as the key**
- A consumer must never see an older quote for `AAPL` after seeing a newer one
- Keying by `symbol` ensures all quotes for the same instrument hash to the same partition, preserving per-instrument ordering
- Two quotes for different symbols (`AAPL` vs `GOOG`) are independent and can be processed in parallel
- This is different from order topics because pricing data has no account affinity

**Failure Mode to Avoid:**
Keying by quote-ID or timestamp: This would randomize partition assignment, breaking the freshness guarantee. A strategy service could act on stale quotes.

### 5. Market Poller Interval and Fauxnance Quota

The market poller runs inside `trade_executor` and calls Fauxnance batch quotes endpoint with at most 25 symbols per request. Quota is 2000 requests/day per API key.

Requests per day are calculated as:

$$
	ext{requests/day} = \left\lceil\frac{\text{symbols}}{25}\right\rceil \times \frac{86400}{\text{interval seconds}}
$$

Interval floor for quota safety is:

$$
	ext{minimum interval} = \left\lceil\frac{\left\lceil\text{symbols}/25\right\rceil \times 86400}{2000}\right\rceil
$$

The executor enforces this floor in code. Effective interval is:

$$
	ext{effective interval} = \max(\text{configured POLL_INTERVAL_SECONDS}, \text{minimum interval})
$$

Example with 8 symbols and configured 30s:
- Requests per poll: $\lceil 8/25 \rceil = 1$
- Minimum interval: $\lceil 86400 / 2000 \rceil = 44s$
- Effective interval: $\max(30, 44) = 44s$
- Requests/day: $\lfloor 86400 / 44 \rfloor = 1963$

This remains under the 2000/day quota.

## Dead-Letter Topics

Three dead-letter topics are created with 1 partition and retention matching their source topic:
- `orders.DLT` (1 partition, 7-day retention)
- `trade-events.DLT` (1 partition, 30-day retention)
- `market-data.DLT` (1 partition, 1-day retention)

**Rationale:**
- A dead-lettered message is a poison pill (malformed, validation failure, or transient error after retry budget exhausted)
- One partition is sufficient: nothing about a poison message needs parallel processing
- Single partition keeps failure investigation linear (one ordered log)
- Retention matches source topic because a dead-lettered message is worth investigating for at least as long as its live counterpart
- Explicit creation is necessary because auto-creation produces one partition with default retention, silently generating wrong configuration

## Message Envelope and Serialization

All messages carry an identical five-field envelope plus a payload, defined in `contracts/kafka-topics.md`:
- `eventId`: UUID, unique per message, used as idempotency key
- `eventType`: Enum discriminating payload structure (ORDER_PLACED, ORDER_FILLED, QUOTE, etc.)
- `eventTime`: RFC 3339 timestamp in UTC when produced
- `source`: Producing component (trade-api, trade-executor, market-poller)
- `schemaVersion`: Integer starting at 1, incremented on breaking changes only

**Design Principles:**
- Adding optional fields is not a breaking change; `schemaVersion` remains unchanged
- Removing, renaming, or changing field types is breaking; increment `schemaVersion`
- Consumers must ignore fields they do not recognize (forward compatibility)
- No credentials, full names, emails, or API keys in payloads (topics are retained for days)

## Consumer Implementation Requirements

Consumer implementation details (idempotent processing, offset commit strategy, dead-letter handling) are out of scope for this story and will be covered in Sprint 7 consumer/producer stories.

Consumers must be written to ignore fields they do not recognize. This allows new optional fields to be added without breaking existing consumers.

## How to Create Topics Manually

If the `kafka-init` service does not run automatically:

```bash
# List existing topics
docker compose exec kafka /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --list

# Describe a specific topic
docker compose exec kafka /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --describe --topic orders

# Rerun the creation script
docker compose run --rm kafka-init

# Or run individual create commands
docker compose exec kafka /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --create --if-not-exists \
  --topic orders --partitions 3 --replication-factor 1 \
  --config retention.ms=604800000 --config cleanup.policy=delete
```

## Delivery Semantics

The platform operates at **at-least-once** delivery semantics:
- Messages may be duplicated (producer retries, application retries)
- Messages are never lost (if committed)
- Idempotent consumers (using mechanisms above) handle duplicates safely

**Producer configuration:**
- `acks=all`: Wait for all replicas to acknowledge (local: just the broker)
- `enable.idempotence=true`: Deduplicate producer retries
- High `retries` value: Retry transient failures
- `max.in.flight.requests.per.connection=5`: Limit concurrent requests

## Testing and Validation

To verify topics and understand message flow:

```bash
# Read all messages from a topic from the beginning
docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 --topic trade-events --from-beginning

# Monitor consumer lag
docker compose exec kafka /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 --group trade-executor --describe

# Produce a test message
docker compose exec kafka /opt/kafka/bin/kafka-console-producer.sh \
  --bootstrap-server localhost:9092 --topic orders
```

## Future Considerations

- Partition counts are permanent for accounts and symbols; choose deliberately
- Retention can be changed after creation (topics do not need recreation)
- If a team adds a consumer for a topic, it must use a unique `group.id`
- Dead-letter handling is each consumer's responsibility; commits to `.DLT` are not automatic
- Security (TLS, SASL, ACLs) is out of scope for local development but must be documented for production
