FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /workspace

ARG CORE_JAVA_REPO_URL
ARG CORE_JAVA_REF=core-java

RUN test -n "$CORE_JAVA_REPO_URL" || (echo "CORE_JAVA_REPO_URL build arg is required" && exit 1)
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*

# Build and install the Sprint 5 module into the builder's local Maven repository.
RUN git clone --depth 1 --branch "$CORE_JAVA_REF" "$CORE_JAVA_REPO_URL" /tmp/core-java
RUN --mount=type=cache,target=/root/.m2 mvn -f /tmp/core-java/backend/pom.xml -B -DskipTests install

# Copy dependency descriptors first so source changes do not invalidate dependency resolution.
COPY backend/pom.xml backend/pom.xml
RUN --mount=type=cache,target=/root/.m2 mvn -f backend/pom.xml -B -DskipTests -nsu dependency:go-offline

COPY backend/src backend/src
RUN --mount=type=cache,target=/root/.m2 mvn -f backend/pom.xml -B -DskipTests -nsu package

FROM eclipse-temurin:21-jre-alpine AS runtime
RUN addgroup -S app && adduser -S -G app app

WORKDIR /app
COPY --from=build /workspace/backend/target/backend-0.0.1-SNAPSHOT.jar /app/app.jar

EXPOSE 8080
USER app
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
