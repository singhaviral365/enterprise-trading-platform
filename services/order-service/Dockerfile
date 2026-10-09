# order-service image: builds from source with Maven, runs the jar as a non-root user.
# Context: services/order-service. The settings come from the environment (see the root .env and docker-compose.yml), not from this image.
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml ./
RUN --mount=type=cache,target=/root/.m2 mvn -B -q -DskipTests -Djacoco.skip=true dependency:go-offline
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 mvn -B -q -DskipTests -Djacoco.skip=true package \
 && cp target/order-service-*-SNAPSHOT.jar /build/app.jar

FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S app && adduser -S -G app app
WORKDIR /app
COPY --from=build /build/app.jar /app/app.jar
USER app
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
