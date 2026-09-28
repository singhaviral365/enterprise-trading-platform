# Market Poller Verification Guide

This guide verifies that the Trade Executor market-data poller is running on schedule, batching quote requests, and publishing one Kafka message per symbol to `market-data`.

## What the poller does

- Runs inside `trade_executor` as a scheduled Java component.
- Reads interval from `POLL_INTERVAL_SECONDS`.
- Polls symbols from:
  - held symbols (positions with quantity > 0)
  - symbols currently being watched by open `NEW` orders
  - optional `MARKET_DATA_WATCH_SYMBOLS` environment override
- Calls Fauxnance batch endpoint `GET /quotes?symbols=A,B,C` with at most 25 symbols per request.
- Publishes one `QUOTE` event per symbol to Kafka topic `market-data`, keyed by symbol.

## Required environment

Set these variables for `trade_executor`:

```text
KAFKA_BOOTSTRAP_SERVERS=kafka:29092
FAUXNANCE_API_KEY=<your key>
POLL_INTERVAL_SECONDS=60
```

Optional watcher list:

```text
MARKET_DATA_WATCH_SYMBOLS=AAPL,INFY.NS,FX:EURUSD,X:BTC-USD
```

## Start logger for market-data topic

On your Kafka host/container, run:

```bash
docker compose exec kafka kafka-console-consumer \
  --bootstrap-server kafka:29092 \
  --topic market-data \
  --property print.key=true \
  --property key.separator=" | " \
  --property print.partition=true \
  --property print.timestamp=true
```

## What success looks like

- New messages appear in `market-data` within one polling cycle.
- Each message has one symbol key (for example `AAPL`, `INFY.NS`, `FX:EURUSD`).
- Multiple symbols appear as multiple messages, not one combined payload.
- Executor logs show polling and publishing events.

## Quick checks

### Check topic exists and partition count is correct

```bash
docker compose exec kafka kafka-topics --bootstrap-server kafka:29092 --describe --topic market-data
```

Expected: `PartitionCount:6`.

### Check dead-letter topic exists

```bash
docker compose exec kafka kafka-topics --bootstrap-server kafka:29092 --describe --topic market-data.DLT
```

### Check one-message-per-symbol behavior

If polling `AAPL,MSFT,NVDA`, consumer output should show three independent records with keys `AAPL`, `MSFT`, and `NVDA`.

## Quota safety arithmetic

Requests per day are:

$$
\text{requests/day} = \left\lceil \frac{\text{symbol count}}{25} \right\rceil \times \frac{86400}{\text{interval seconds}}
$$

The poller enforces a runtime floor so requests/day never exceed 2000.

Example with 8 symbols and configured 30s:

- Batch requests per poll: $\lceil 8/25 \rceil = 1$
- Minimum safe interval: $\lceil 86400 / 2000 \rceil = 44$ seconds
- Effective interval used: $\max(30, 44) = 44$ seconds
- Effective requests/day: $\lfloor 86400 / 44 \rfloor = 1963$

This stays within the 2000/day key quota.