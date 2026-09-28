Docker guide for this repository.

The current platform stack includes:
- postgres
- kafka
- kafka-init
- auth-stub
- backend

Important:
- The backend image build requires build args from backend/Dockerfile:
  - CORE_JAVA_REPO_URL
  - CORE_JAVA_REF (defaults to core-java)
- backend/Dockerfile clones the dependency module branch and runs Maven install before packaging backend.

## Setup (required)

Run from repository root.

1. Create local environment file from template
```bash
cp .env.example .env
chmod 600 .env
```

2. Edit .env and set required values
```bash
POSTGRES_DB=trading
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<set-a-strong-password>
JWT_SECRET=<set-at-least-32-characters>
CORE_JAVA_REPO_URL=<your-git-remote-url>
CORE_JAVA_REF=core-java
```

3. Quick check that required keys exist
```bash
grep -E '^(POSTGRES_DB|POSTGRES_USER|POSTGRES_PASSWORD|JWT_SECRET|CORE_JAVA_REPO_URL|CORE_JAVA_REF)=' .env
```

## Option A: Recommended (Compose)

Run from repository root.

Check which Compose command your Linux host supports:
```bash
docker compose version || docker-compose --version
```

If `docker compose` is unavailable, use `docker-compose` in the commands below.

Compose v2:
```bash
export CORE_JAVA_REPO_URL="$(git config --get remote.origin.url)"
export CORE_JAVA_REF=core-java

docker compose up -d --profile platform
docker compose ps
docker compose logs -f backend
```


Compose v1 fallback:
```bash
export CORE_JAVA_REPO_URL="$(git config --get remote.origin.url)"
export CORE_JAVA_REF=core-java

docker-compose --profile platform up -d
docker-compose ps
docker-compose logs -f backend
```

Health checks:
- backend: http://localhost:8080/actuator/health
- auth-stub: http://localhost:4000/health

## Option B: Manual container-by-container demo

Run from backend folder.

1. Build backend image (uses repo root context and core-java args)
```bash
docker build -t trading-backend:m12 -f Dockerfile .. --build-arg CORE_JAVA_REPO_URL="$(git config --get remote.origin.url)" --build-arg CORE_JAVA_REF=core-java
```

2. Verify image exists
```bash
docker images | grep trading-backend
```

3. Start PostgreSQL
```bash
docker run -d --name sprint6-postgres -e POSTGRES_PASSWORD=n3u3d4! -e POSTGRES_DB=trading -p 5433:5432 postgres:16-alpine
docker ps
```

4. Load schema from backend/src/main/resources/schema.sql
```bash
docker cp src/main/resources/schema.sql sprint6-postgres:/schema.sql
docker exec -e PGPASSWORD=n3u3d4! sprint6-postgres psql -U postgres -d trading -f /schema.sql
```

5. Create network and attach Postgres
```bash
docker network create trading-net
docker network connect trading-net sprint6-postgres
```

6. Build and run auth-stub
```bash
docker build -t auth-stub:m12 ./auth-stub
docker run -d --name auth-stub --network trading-net -p 4000:4000 -e JWT_SECRET=dev-only-change-me-this-secret-is-not-for-production-use auth-stub:m12
```

7. Run backend on the same network
```bash
docker run -d --name trading-backend-m12 --network trading-net -p 8081:8080 -e SPRING_DATASOURCE_URL=jdbc:postgresql://sprint6-postgres:5432/trading -e SPRING_DATASOURCE_USERNAME=postgres -e DB_PASSWORD=n3u3d4! -e JWT_SECRET=dev-only-change-me-this-secret-is-not-for-production-use -e KAFKA_BOOTSTRAP_SERVERS=kafka:29092 trading-backend:m12
```

8. Validate
```bash
docker ps
docker logs trading-backend-m12
curl http://localhost:8081/actuator/health
```

Expected containers in manual mode:
- trading-backend-m12
- sprint6-postgres
- auth-stub

Note for manual mode:
- If backend is configured to require Kafka at startup, also run a Kafka container on trading-net before starting backend.

## Cleanup and reset

Run from repository root unless noted.

### If you used Compose
Compose v2:
```bash
docker compose --profile platform down
docker compose --profile platform down -v
```

Compose v1 fallback:
```bash
docker-compose --profile platform down
docker-compose --profile platform down -v
```

### If you used manual containers
```bash
docker rm -f trading-backend-m12 auth-stub sprint6-postgres
docker network rm trading-net
```

### Optional: remove demo images
```bash
docker rmi trading-backend:m12 auth-stub:m12
```

### Optional: remove stopped containers and unused objects
```bash
docker container prune -f
docker system prune -f
```

## Troubleshooting

### Symptom: docker compose is not a docker command

Your host uses Compose v1, so use docker-compose commands consistently.

### Symptom: bind: address already in use on 0.0.0.0:8080

Find what is listening on port 8080:
```bash
sudo ss -ltnp | grep :8080
```

If output shows a Java process, stop it by PID (example PID 1520):
```bash
sudo kill 1520
sudo ss -ltnp | grep :8080 || echo "8080 is free"
```

If it does not stop, force kill:
```bash
sudo kill -9 1520
sudo ss -ltnp | grep :8080 || echo "8080 is free"
```

Then start the platform stack again.