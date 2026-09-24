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

- http://10.8.78.105:9000/

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
mvn org.sonarsource.scanner.maven:sonar-maven-plugin:sonar "-Dsonar.host.url=http://10.8.78.105:9000" "-Dsonar.token=YOUR_TOKEN"
```

Expected output:

- `BUILD SUCCESS`

## 6) Verify Scan Report in SonarQube

Open:

- http://10.8.78.105:9000/

Then navigate:

- Projects
- Select your project entry to view metrics and issues.

## 7) Optional: Wait for Quality Gate in Maven Command

To make Maven wait for server-side Quality Gate result:

```powershell
mvn org.sonarsource.scanner.maven:sonar-maven-plugin:sonar "-Dsonar.host.url=http://10.8.78.105:9000" "-Dsonar.token=YOUR_TOKEN" "-Dsonar.qualitygate.wait=true"
```

This is the same scan with one additional flag:

- `-Dsonar.qualitygate.wait=true`

## Troubleshooting

- If `docker run ... --name sonarqube` fails with name conflict, do not create a new container. Start the existing one with `docker start sonarqube`.
- If Windows cannot open port 9000, verify Linux VM IP, firewall/security-group rules, and that Docker maps `0.0.0.0:9000->9000/tcp`.
- If SonarQube is slow to start, check logs:

```bash
docker logs --tail 200 sonarqube
```
