# SonarQube Setup and Scan Guide

This guide documents how to reuse an existing SonarQube container on a Linux VM, generate a token in SonarQube from Windows, run a Maven scan, and verify results.

## 1) Linux VM: Start Existing SonarQube Container

Use these commands on the Linux VM.

Check whether the container already exists:

```bash
docker ps -a --filter "name=sonarqube"
```

If the container exists but is stopped, start it:

```bash
docker start sonarqube
```

Confirm it is running and mapped to port 9000 (0.0.0.0:9000->9000/tcp):

```bash
docker ps --filter "name=sonarqube"
```

If the mapping shows `127.0.0.1:9000->9000/tcp`, the service is only reachable locally on the Linux VM. Recreate the container with external bind:

```bash
docker rm -f sonarqube
docker run -d --name sonarqube -p 0.0.0.0:9000:9000 sonarqube:lts-community
```

Then verify again:

```bash
docker ps --filter "name=sonarqube"
```

Wait until SonarQube is fully ready:

```bash
curl -s http://localhost:9000/api/system/status
```

Expected response includes:

```json
{"status":"UP"}
```

If status is `STARTING`, retry after a short wait.

## 2) Windows: Open SonarQube UI and Do First-Time Setup

From Windows browser, open SonarQube at the Linux VM IP:

- http://{LINUX_IP}:9000/

Log in using default credentials:

- Username: `admin`
- Password: `admin`

On first login, SonarQube prompts for password change. Complete that step.

## 3) Windows: Generate SonarQube Token

In SonarQube UI:

1. Go to My Account.
2. Open Security.
3. Generate a new token.
4. Copy and store the token value securely.

Note: You will use this token in the Maven command as `-Dsonar.token=YOUR_TOKEN`.

## 4) Windows: Run Unit Tests

In Windows PowerShell, go to your project and run tests:

```powershell
cd "C:\Users\Administrator\IdeaProjects\sonar-refactor\sonarqube-quality-gates-springboot"
dir
mvn clean test
```

Expected output:

- `BUILD SUCCESS`

## 5) Windows: Run SonarQube Analysis

Run the scan command and replace only `YOUR_TOKEN` with the token generated in SonarQube.

Use the Linux VM IP in `sonar.host.url`.

```powershell
mvn org.sonarsource.scanner.maven:sonar-maven-plugin:sonar "-Dsonar.host.url=http://{LINUX_IP}:9000" "-Dsonar.token=YOUR_TOKEN"
```

Expected output:

- `BUILD SUCCESS`

## 6) Verify Scan Report in SonarQube

Open:

- http://{LINUX_IP}:9000/

Then navigate:

- Projects
- Select your project entry to view metrics and issues.

## 7) Optional: Wait for Quality Gate in Maven Command

To make Maven wait for server-side Quality Gate result:

```powershell
mvn org.sonarsource.scanner.maven:sonar-maven-plugin:sonar "-Dsonar.host.url=http://{LINUX_IP}:9000" "-Dsonar.token=YOUR_TOKEN" "-Dsonar.qualitygate.wait=true"
```

This is the same scan with one additional flag:

- `-Dsonar.qualitygate.wait=true`

## 8) The whole platform in one scan

One SonarQube project, `enterprise-trading-platform`, covers the Angular app, the auth-service and both Spring services. The Maven plugin in
sections 4 to 7 can only see one Java service, so the whole-platform scan uses the SonarScanner (run through `npx`) with the root
[`sonar-project.properties`](../../sonar-project.properties), which declares each part as a module and points at the coverage file its own tool writes:

| Part | Tests with coverage | Coverage file |
|---|---|---|
| frontend | `npm run test:ci` | `frontend/coverage/frontend/lcov.info` |
| auth-service | `npx jest --coverage` | `services/auth-service/coverage/lcov.info` |
| order-service | `.\mvnw.cmd clean verify` | `services/order-service/target/site/jacoco/jacoco.xml` |
| executor-service | `.\mvnw.cmd clean verify` | `services/executor-service/target/site/jacoco/jacoco.xml` |

Put the server and your token in `config/application.yml` (`sonar.host-url`, `sonar.token`), then from the repository root:

```powershell
.\scripts\sonar-scan.ps1                # all tests with coverage, then the scan
.\scripts\sonar-scan.ps1 -SkipTests     # scan only, reusing the last coverage files
.\scripts\sonar-scan.ps1 -QualityGate   # also wait for the quality gate
```

The script keeps going when a test fails (it passes `-Dmaven.test.failure.ignore=true` to Maven) so the coverage of what ran is still sent, and it prints each
part's exit code and any coverage file that is missing.

### One coverage score for the whole platform

`node scripts/coverage-summary.js` (the sonar script runs it too) reads the four coverage files and prints each part and a **WHOLE PLATFORM** line, both as
plain line coverage and with SonarQube's own formula, `(covered lines + covered branches) / (lines + branches)`. It needs no server, and its total should
match the project's Coverage on the SonarQube dashboard.

On the dashboard itself, open the **Overall Code** tab. The default **New Code** tab shows only changed code, so on a first analysis it shows no coverage.
If Overall Code shows 0 or nothing for a part, the report path for that module did not match (the scan prints "No coverage information"), and the
summary script's "Missing" line tells you which file is absent.

## Troubleshooting

- If `docker run ... --name sonarqube` fails with name conflict, do not create a new container. Start the existing one with `docker start sonarqube`.
- If Windows cannot open port 9000, verify Linux VM IP, firewall/security-group rules, and that Docker maps `0.0.0.0:9000->9000/tcp`.
- If SonarQube is slow to start, check logs:

```bash
docker logs --tail 200 sonarqube
```
