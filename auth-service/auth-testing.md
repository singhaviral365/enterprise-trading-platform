# Bruno API Testing Guide - Auth Service (Updated 2026-09-25)

**Base URL:** `http://localhost:3000`  
**Service:** Running on port 3000  
**Updated:** Auth boundary clarified - profile/account setup moved to backend service

---

## New Auth Boundary (2026-09-25)

Auth service now owns only authentication and authenticated user lookup:

1. `POST /auth/register`
2. `POST /auth/login`
3. `POST /auth/refresh`
4. `GET /auth/me`

Account creation and account linking are no longer part of auth-service testing. They are handled by backend/trade flows.

---

## 1) Register Endpoint

**Method:** `POST`  
**URL:** `http://localhost:3000/auth/register`  
**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "username": "alice.trader",
  "password": "AliceTrader123!@#"
}
```

**Expected Response (201 Created):**
```json
{
  "id": 1000,
  "username": "alice.trader",
  "roles": ["CUSTOMER"],
  "createdOn": "2026-09-25T12:30:00.000Z"
}
```

---

## 2) Login Endpoint

**Method:** `POST`  
**URL:** `http://localhost:3000/auth/login`  
**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "username": "alice.trader",
  "password": "AliceTrader123!@#"
}
```

**Expected Response (200 OK):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjEwMDAsInJvbGVzIjpbIkNVU1RPTUVSIl0sImlhdCI6MTY5NTAwMDAwMCwiZXhwIjoxNjk1MDAwOTAwLCJpc3MiOiJhdXRoLXNlcnZpY2UifQ.xxx",
  "refreshToken": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "tokenType": "Bearer",
  "expiresIn": 900
}
```

**JWT Decoded Example:**
```json
{
  "sub": 1000,
  "roles": ["CUSTOMER"],
  "iat": 1695000000,
  "exp": 1695000900,
  "iss": "auth-service"
}
```

---

## 3) Get Current User Profile - /auth/me

**Method:** `GET`  
**URL:** `http://localhost:3000/auth/me`  
**Headers:**
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Body:** Leave empty (GET request)

**Expected Response (200 OK):**
```json
{
  "id": 1000,
  "username": "alice.trader",
  "roles": ["CUSTOMER"],
  "createdOn": "2026-09-25T12:30:00.000Z"
}
```

---

## 4) Refresh Token Endpoint

**Method:** `POST`  
**URL:** `http://localhost:3000/auth/refresh`  
**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "refreshToken": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
}
```

**Expected Response (200 OK):**
```json
{
  "accessToken": "new_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "new_hash_xyz789",
  "tokenType": "Bearer",
  "expiresIn": 900
}
```

---

## Error Cases

### Test 1: Register - Duplicate Username (409)

**Method:** `POST`  
**URL:** `http://localhost:3000/auth/register`

**Body:**
```json
{
  "username": "alice.trader",
  "password": "Different123!@#"
}
```

**Expected Response:**
```json
{
  "errorCode": "AUTH-409",
  "message": "Registration failed"
}
```

### Test 2: Login - Wrong Password (401)

**Method:** `POST`  
**URL:** `http://localhost:3000/auth/login`

**Body:**
```json
{
  "username": "alice.trader",
  "password": "WrongPassword123"
}
```

**Expected Response:**
```json
{
  "errorCode": "AUTH-401",
  "message": "Unauthorised"
}
```

### Test 3: Get /auth/me - Missing JWT (401)

**Method:** `GET`  
**URL:** `http://localhost:3000/auth/me`  
**Headers:** no `Authorization` header

**Expected Response:**
```json
{
  "errorCode": "AUTH-401",
  "message": "Unauthorised"
}
```

### Test 4: Register - Invalid Password (422)

**Method:** `POST`  
**URL:** `http://localhost:3000/auth/register`

**Body:**
```json
{
  "username": "charlie.trader",
  "password": "short"
}
```

**Expected Response:**
```json
{
  "errorCode": "VAL-422",
  "message": "Invalid input"
}
```

---

## Complete Test Sequence (PowerShell)

```powershell
# 1) REGISTER
Write-Host "1. REGISTER" -ForegroundColor Green
$body = @{username="alice.trader"; password="AliceTrader123!@#"} | ConvertTo-Json
$reg = Invoke-WebRequest -Uri "http://localhost:3000/auth/register" `
  -Method POST -Headers @{"Content-Type"="application/json"} -Body $body
Write-Host "Status: $($reg.StatusCode)" -ForegroundColor Cyan

# 2) LOGIN
Write-Host "`n2. LOGIN" -ForegroundColor Green
$body = @{username="alice.trader"; password="AliceTrader123!@#"} | ConvertTo-Json
$login = Invoke-WebRequest -Uri "http://localhost:3000/auth/login" `
  -Method POST -Headers @{"Content-Type"="application/json"} -Body $body
Write-Host "Status: $($login.StatusCode)" -ForegroundColor Cyan
$loginData = $login.Content | ConvertFrom-Json
$token = $loginData.accessToken
$refreshToken = $loginData.refreshToken

# 3) GET /auth/me
Write-Host "`n3. GET /auth/me" -ForegroundColor Green
$me = Invoke-WebRequest -Uri "http://localhost:3000/auth/me" `
  -Method GET -Headers @{"Authorization"="Bearer $token"}
Write-Host "Status: $($me.StatusCode)" -ForegroundColor Cyan

# 4) REFRESH
Write-Host "`n4. REFRESH" -ForegroundColor Green
$body = @{refreshToken=$refreshToken} | ConvertTo-Json
$refresh = Invoke-WebRequest -Uri "http://localhost:3000/auth/refresh" `
  -Method POST -Headers @{"Content-Type"="application/json"} -Body $body
Write-Host "Status: $($refresh.StatusCode)" -ForegroundColor Cyan
```

---

## Test Checklist

- [ ] 1. Register -> 201
- [ ] 2. Login -> 200, token pair returned
- [ ] 3. Get /auth/me -> 200 with bearer token
- [ ] 4. Refresh token -> 200, new token pair
- [ ] 5. Duplicate register -> 409
- [ ] 6. Wrong password -> 401
- [ ] 7. Missing JWT on /auth/me -> 401
- [ ] 8. Invalid register data -> 422

---

**Note:** Profile setup, account creation, and account linking have been moved out of auth-service and are tested in backend/trade flows.
