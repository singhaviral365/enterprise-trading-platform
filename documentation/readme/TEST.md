Test report guide for this repository (Linux).

Run from backend folder.

## Prerequisites

Use Maven Wrapper from this repo (no system Maven required):

```bash
chmod +x mvnw
./mvnw -v
```

If Java is missing, install JDK 21 first (example for Amazon Linux):

```bash
sudo dnf install -y java-21-amazon-corretto-devel || sudo yum install -y java-21-amazon-corretto-devel
java -version
```

## Install required snapshot dependency (required)

The backend tests depend on `com.enterprise.trading:sprint-05-domain-engine:1.0-SNAPSHOT`.
Install it into your local Maven repository before running tests.

Run from repository root:

```bash
export CORE_JAVA_REPO_URL="$(git config --get remote.origin.url)"
export CORE_JAVA_REF=core-java

rm -rf /tmp/core-java-dep
git clone --depth 1 --branch "$CORE_JAVA_REF" "$CORE_JAVA_REPO_URL" /tmp/core-java-dep
./backend/mvnw -B -f /tmp/core-java-dep/backend/pom.xml -DskipTests install
```

Quick verification:

```bash
ls ~/.m2/repository/com/enterprise/trading/sprint-05-domain-engine/1.0-SNAPSHOT
```

## Run tests

```bash
cd backend
./mvnw -B clean test
```

Note:
- A warning about missing `/home/<user>/.docker/config.json` or `DOCKER_AUTH_CONFIG` during Testcontainers startup is expected when you are not using a private registry.
- It is informational and can be ignored for public images like `postgres:16-alpine` and `testcontainers/ryuk`.

## Generate Surefire report

```bash
./mvnw -B surefire-report:report
```

Report outputs:
- XML results: backend/target/surefire-reports
- HTML report: backend/target/reports/surefire-report.html

## Open report locally on Linux

```bash
xdg-open target/reports/surefire-report.html 2>/dev/null || echo "Open target/reports/surefire-report.html manually"
```

## Export report into versioned folder for GitHub

Run from repository root.

```bash
rm -rf reports/surefire/backend-tests-report
mkdir -p reports/surefire
cp -r backend/target/reports reports/surefire/backend-tests-report
cp -r backend/target/surefire-reports reports/surefire/
```

This preserves all report assets (css, fonts, images, img, js) so status icons and styling render correctly.

## Commit and push report

```bash
git add reports/surefire
git commit -m "Add surefire test report"
git push
```

Optional quick summary from XML files:

```bash
grep -R "tests=\|failures=\|errors=\|skipped=" backend/target/surefire-reports/*.xml
```
