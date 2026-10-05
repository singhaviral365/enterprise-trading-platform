#!/usr/bin/env bash
#
# Creates the platform's Kafka topics per contracts/kafka-topics.md.
#
# Idempotent: uses --if-not-exists, so running it against a broker that
# already has the topics does nothing and exits cleanly. Safe to run on
# every compose start rather than only once.
#
# Runs inside a Kafka broker or client image, so it needs the
# kafka-topics command on the PATH. Docker Compose wires this in as
# the kafka-init service, which mounts this file and runs it once
# the broker is available.
#
# Run it by hand with:
#
#   docker compose exec kafka bash /kafka-scripts/create-topics.sh
#
# or, if the kafka-init service already ran and exited, rerun it directly:
#
#   docker compose run --rm kafka-init
#

set -euo pipefail

# --------------------------------------------------
# Kafka connection
# --------------------------------------------------

BOOTSTRAP_SERVER="${KAFKA_BOOTSTRAP_SERVERS:-kafka:29092}"

# Confluent Kafka 7.7 uses the kafka-topics command.
TOPICS_CMD="${KAFKA_TOPICS_CMD:-kafka-topics}"

# --------------------------------------------------
# Wait for Kafka broker
# --------------------------------------------------

echo "Waiting for the broker at ${BOOTSTRAP_SERVER}."

# Give the broker some time to fully start.
sleep 10

until "${TOPICS_CMD}" \
  --bootstrap-server "${BOOTSTRAP_SERVER}" \
  --list >/dev/null 2>&1
do
  sleep 2
done

echo "Broker is reachable. Creating topics."

# --------------------------------------------------
# Topic creation function
# --------------------------------------------------

create_topic() {
  local topic="$1"
  local partitions="$2"
  local retention_ms="$3"

  echo "Creating topic '${topic}' (${partitions} partitions, retention ${retention_ms}ms)."

  "${TOPICS_CMD}" \
    --bootstrap-server "${BOOTSTRAP_SERVER}" \
    --create \
    --if-not-exists \
    --topic "${topic}" \
    --partitions "${partitions}" \
    --replication-factor 1 \
    --config "retention.ms=${retention_ms}" \
    --config "cleanup.policy=delete"
}

# --------------------------------------------------
# Primary topics
# --------------------------------------------------

# orders: 3 partitions, 7 days retention
create_topic "orders" 3 604800000

# trade-events: 3 partitions, 30 days retention
create_topic "trade-events" 3 2592000000

# market-data: 6 partitions, 1 day retention
create_topic "market-data" 6 86400000

# --------------------------------------------------
# Dead-letter topics
# --------------------------------------------------

# Dead-letter topics use one partition.
# Retention matches the corresponding source topic.

# orders.DLT: 1 partition, 7 days retention
create_topic "orders.DLT" 1 604800000

# trade-events.DLT: 1 partition, 30 days retention
create_topic "trade-events.DLT" 1 2592000000

# market-data.DLT: 1 partition, 1 day retention
create_topic "market-data.DLT" 1 86400000

# --------------------------------------------------
# Finished
# --------------------------------------------------

echo "Topic creation complete."

echo "Available Kafka topics:"
"${TOPICS_CMD}" \
  --bootstrap-server "${BOOTSTRAP_SERVER}" \
  --list