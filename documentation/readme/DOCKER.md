# Docker

The whole platform runs in containers from the root `docker-compose.yml`; the steps, the variables to fill in and the useful commands are in
the root [README](../../README.md#running-everything-with-docker-compose).

| Container | Image | Built from |
|---|---|---|
| `postgres` (trading_db) | `postgres:16-alpine` | `databases/PostgreSQL/trading/schema.sql` and `seed_data.sql`, loaded on the first start |
| `auth-db` (auth_db) | `postgres:16-alpine` | `databases/PostgreSQL/auth/schema.sql` and `seed_data.sql` |
| `kafka`, `kafka-init` | `confluentinc/cp-kafka:7.7.0` | `infra/kafka/create-topics.sh` (the three topics) |
| `auth-service` | built | `services/auth-service/Dockerfile` |
| `order-service` | built | `services/order-service/Dockerfile` (Maven build, then a JRE image) |
| `executor-service` | built | `services/executor-service/Dockerfile` |
| `frontend` | built | `frontend/Dockerfile` (Angular build, then nginx with `docker/nginx/default.conf.template`) |

Every setting comes from the root `.env` (see `.env.example`), which compose passes to the services (`env_file`). Only the host names that differ inside
the docker network are set in the compose file: the databases (`postgres`, `auth-db`), Kafka (`kafka:29092`) and the order-service (for the executor).
No secret is in an image: `.dockerignore` keeps `.env` and `config/application.yml` out of every build context.

Not available in a container: MailHog (run it on your machine and set the email modes to `dev`), and the demo run script `scripts/run-app.ps1`.
