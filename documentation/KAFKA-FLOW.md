# Kafka End-to-End Flow Guide

This guide verifies the full flow now that both sides exist:

- backend produces ORDER_PLACED to orders
- trade_executor consumes orders, settles, then produces resolution events to trade-events
- trade_executor market poller publishes QUOTE events to market-data

## Code Map

- Producer entry path in backend: [OrderEventProducer.java](../backend/src/main/java/org/example/backend/events/OrderEventProducer.java)
- After-commit publish behavior in backend: [OrderPlacedAfterCommitListener.java](../backend/src/main/java/org/example/backend/events/OrderPlacedAfterCommitListener.java)
- Consumer entry path in trade_executor: [OrderPlacedConsumer.java](../trade_executor/src/main/java/org/example/trade_executor/executor/OrderPlacedConsumer.java)
- Consumer config in trade_executor: [KafkaConsumerConfiguration.java](../trade_executor/src/main/java/org/example/trade_executor/config/KafkaConsumerConfiguration.java)
- trade_executor result producer: [TradeEventProducer.java](../trade_executor/src/main/java/org/example/trade_executor/events/TradeEventProducer.java)
- trade_executor market poller: [MarketDataPoller.java](../trade_executor/src/main/java/org/example/trade_executor/marketdata/MarketDataPoller.java)
- trade_executor market-data producer: [MarketDataEventProducer.java](../trade_executor/src/main/java/org/example/trade_executor/marketdata/MarketDataEventProducer.java)

## Your Topology

- backend runs on Windows
- trade_executor runs on Windows
- Kafka runs on Linux VM at {LINUX_IP}

This works only if the broker advertises a host that Windows clients can reach.

## Required Configuration

### A) Linux VM Kafka advertise host

In VM repo root .env, set:

```bash
KAFKA_EXTERNAL_HOST={LINUX_IP}
```

This is already supported by [docker-compose.yml](../docker-compose.yml) using KAFKA_ADVERTISED_LISTENERS.

Recreate Kafka so the setting is applied:

Compose v2:

```bash
docker compose up -d --force-recreate kafka kafka-init
```

Compose v1:

```bash
docker-compose up -d --force-recreate kafka kafka-init
```

### B) Windows app bootstrap server

Set this for both backend and trade_executor run configurations:

```text
KAFKA_BOOTSTRAP_SERVERS={LINUX_IP}:9092
```

Both apps read this in their application properties.

## Full Flow Test

### 1) Verify topics on Linux VM

Compose v2:

```bash
docker compose exec kafka kafka-topics --bootstrap-server kafka:29092 --describe --topic orders
docker compose exec kafka kafka-topics --bootstrap-server kafka:29092 --describe --topic trade-events
docker compose exec kafka kafka-topics --bootstrap-server kafka:29092 --describe --topic market-data
```

Compose v1:

```bash
docker-compose exec kafka kafka-topics --bootstrap-server kafka:29092 --describe --topic orders
docker-compose exec kafka kafka-topics --bootstrap-server kafka:29092 --describe --topic trade-events
docker-compose exec kafka kafka-topics --bootstrap-server kafka:29092 --describe --topic market-data
```

### 2) Start live consumers on Linux VM

Terminal A (orders topic):

```bash
docker-compose exec kafka kafka-console-consumer \
  --bootstrap-server kafka:29092 \
  --topic orders \
  --property print.key=true \
  --property key.separator=" | " \
  --property print.partition=true \
  --property print.timestamp=true
```

Terminal B (trade-events topic):

```bash
docker-compose exec kafka kafka-console-consumer \
  --bootstrap-server kafka:29092 \
  --topic trade-events \
  --property print.key=true \
  --property key.separator=" | " \
  --property print.partition=true \
  --property print.timestamp=true
```

Terminal C (market-data topic):

```bash
docker-compose exec kafka kafka-console-consumer \
  --bootstrap-server kafka:29092 \
  --topic market-data \
  --property print.key=true \
  --property key.separator=" | " \
  --property print.partition=true \
  --property print.timestamp=true
```


### 3) Run backend and trade_executor on Windows

Confirm both processes start with KAFKA_BOOTSTRAP_SERVERS={LINUX_IP}:9092.

### 4) Call POST /api/v1/orders from Bruno

Use a new idempotencyKey each call.

### 5) Expected end-to-end signals

- orders consumer shows ORDER_PLACED event
- trade_executor consumes and processes that event
- trade-events consumer shows resolution event such as ORDER_FILLED or ORDER_REJECTED
- market-data consumer shows QUOTE events keyed by symbol
- orders table status transitions from NEW to a terminal state when execution completes

## How Detection Works Across Windows and Linux

Detection is Kafka metadata driven:

1. Windows client connects to bootstrap server {LINUX_IP}:9092.
2. Broker returns cluster metadata, including advertised broker addresses.
3. Client then talks to the advertised addresses for produce and consume traffic.

If advertised address is localhost, Windows clients try to connect to themselves and fail.
If advertised address is {LINUX_IP}, Windows clients reach the VM correctly.

## Fast Troubleshooting

### No message on orders

- backend API may have returned 4xx or 409 and produced nothing
- backend may not have KAFKA_BOOTSTRAP_SERVERS set to {LINUX_IP}:9092
- VM broker may still advertise localhost

### orders has data but trade-events is empty

- trade_executor not running
- trade_executor missing KAFKA_BOOTSTRAP_SERVERS
- trade_executor log has consume/parse/settlement error

### Confirm broker advertisement from VM

```bash
docker-compose exec kafka kafka-broker-api-versions --bootstrap-server kafka:29092
```

If needed, re-check VM .env and recreate kafka service.

## Related Guides

- Producer-only verification: [documentation/KAFKA-PRODUCER.md](KAFKA-PRODUCER.md)
- Topic design decisions: [documentation/KAFKA-DECISIONS.md](KAFKA-DECISIONS.md)
