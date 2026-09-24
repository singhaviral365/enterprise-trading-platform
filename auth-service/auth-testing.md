# Bruno API Testing Guide - Auth Service (Updated 2026-09-24)

**Base URL:** `http://localhost:3000`  
**Service:** Running on port 3000  
**Updated:** Decoupled accountId from registration  

---

## 🔄 NEW FLOW (Updated 2026-09-24)

**Old Flow:** Register required accountId (account had to exist)  
**New Flow:** Register only needs username + password → Account setup happens later  

```
1️⃣ Register (username, password - NO accountId)
   ↓ 201 Created, accountId: null
   
2️⃣ Login (first time)
   ↓ JWT does NOT include accountId claim

3️⃣ Setup Profile + Create/Link Account (NEW PUT /auth/me/profile)
   ↓ 200 OK, accountId linked

4️⃣ Login (second time)
   ↓ JWT NOW includes accountId claim
```

---

## 1️⃣ Register Endpoint (NEW - No accountId Required)

**Method:** `POST`  
**URL:** `http://localhost:3000/auth/register`  
**Headers:**
```
Content-Type: application/json
```

**Body (JSON) - UPDATED:**
```json
{
  "username": "alice.trader",
  "password": "AliceTrader123!@#"
}
```

**Key Changes:**
- ✅ NO `accountId` in request
- ✅ Email auto-generated as `{username}@local.auth`

**Expected Response (201 Created):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "alice.trader",
  "accountId": null,
  "roles": ["CUSTOMER"],
  "createdOn": "2026-09-24T10:00:00.000Z"
}
```

---

## 2️⃣ Login Endpoint (First Login - No accountId in JWT)

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
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "hash_of_refresh_token",
  "tokenType": "Bearer",
  "expiresIn": 900
}
```

**JWT Decoded (First Login - accountId NOT present):**
```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "roles": ["CUSTOMER"],
  "iat": 1695000000,
  "exp": 1695000900,
  "iss": "auth-service"
}
```

---

## 3️⃣ Setup Profile + Link Account (NEW ENDPOINT)

**Method:** `PUT`  
**URL:** `http://localhost:3000/auth/me/profile`  
**Headers:**
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

### Option A: Create New Account

**Body (JSON):**
```json
{
  "client_name": "Alice Trader",
  "phone_no": "+1-555-1234",
  "dob": "1995-06-15"
}
```

**What Auth Service Does:**
1. Calls backend: `POST /api/accounts/create`
2. Backend returns new accountId
3. Links accountId to user
4. Returns user with new account

**Expected Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "alice.trader",
  "accountId": 42,
  "roles": ["CUSTOMER"],
  "createdOn": "2026-09-24T10:00:00.000Z"
}
```

---

### Option B: Link Existing Account

**Body (JSON):**
```json
{
  "client_name": "Bob Trader",
  "phone_no": "+1-555-5678",
  "dob": "1992-03-20",
  "accountId": 42
}
```

**What Auth Service Does:**
1. Calls backend: `GET /api/accounts/42` to verify
2. If exists → link to user
3. If doesn't exist → return 401

**Expected Response (200 OK):**
```json
{
  "id": "660f9511-f30c-52e5-b827-557766551111",
  "username": "bob.trader",
  "accountId": 42,
  "roles": ["CUSTOMER"],
  "createdOn": "2026-09-24T10:05:00.000Z"
}
```

**Expected Response (401 - Account Doesn't Exist):**
```json
{
  "errorCode": "AUTH-401",
  "message": "Account does not exist"
}
```

---

## 4️⃣ Get User Profile - /auth/me

**Method:** `GET`  
**URL:** `http://localhost:3000/auth/me`  
**Headers:**
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Body:** (Leave empty)

**Expected Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "alice.trader",
  "accountId": 42,
  "roles": ["CUSTOMER"],
  "createdOn": "2026-09-24T10:00:00.000Z"
}
```

---

## 5️⃣ Login After Setup (JWT NOW Has accountId)

**Method:** `POST`  
**URL:** `http://localhost:3000/auth/login`  
**Body:**
```json
{
  "username": "alice.trader",
  "password": "AliceTrader123!@#"
}
```

**JWT Decoded (After Setup - accountId NOW present):**
```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "accountId": 42,
  "roles": ["CUSTOMER"],
  "iat": 1695001000,
  "exp": 1695001900,
  "iss": "auth-service"
}
```

---

## 6️⃣ Refresh Token Endpoint

**Method:** `POST`  
**URL:** `http://localhost:3000/auth/refresh`  
**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "refreshToken": "hash_of_refresh_token"
}
```

**Expected Response (200 OK):**
```json
{
  "accessToken": "new_token",
  "refreshToken": "new_hash",
  "tokenType": "Bearer",
  "expiresIn": 900
}
```

---

## ❌ Error Cases

### Test 1: Register - Duplicate Username (409)
```json
{
  "username": "alice.trader",
  "password": "Different123!@#"
}
```

**Expected:** 409 AUTH-409 "Registration failed"

### Test 2: Login - Wrong Password (401)
```json
{
  "username": "alice.trader",
  "password": "WrongPassword123"
}
```

**Expected:** 401 AUTH-401 "Unauthorised"

### Test 3: Setup Profile - Missing JWT (401)

No Authorization header

**Expected:** 401 AUTH-401 "Unauthorised"

### Test 4: Setup Profile - Account Doesn't Exist (401)
```json
{
  "client_name": "Test",
  "accountId": 9999
}
```

**Expected:** 401 AUTH-401 "Account does not exist"

### Test 5: Register - Invalid Password (422)
```json
{
  "username": "user123",
  "password": "short"
}
```

**Expected:** 422 VAL-422 "Invalid input"

---

## 📋 Complete Test Sequence (PowerShell Copy-Paste)

```powershell
# 1️⃣ REGISTER - No accountId needed
Write-Host "1. REGISTER (no accountId)" -ForegroundColor Green
$body = @{username="alice.trader"; password="AliceTrader123!@#"} | ConvertTo-Json
$reg = Invoke-WebRequest -Uri "http://localhost:3000/auth/register" `
  -Method POST -Headers @{"Content-Type"="application/json"} -Body $body
Write-Host "Status: $($reg.StatusCode)" -ForegroundColor Cyan
$userData = $reg.Content | ConvertFrom-Json
$userId = $userData.id
Write-Host "accountId in response: $($userData.accountId)" -ForegroundColor Yellow

# 2️⃣ LOGIN - First time (JWT will NOT have accountId)
Write-Host "`n2. LOGIN - First time" -ForegroundColor Green
$body = @{username="alice.trader"; password="AliceTrader123!@#"} | ConvertTo-Json
$login = Invoke-WebRequest -Uri "http://localhost:3000/auth/login" `
  -Method POST -Headers @{"Content-Type"="application/json"} -Body $body
Write-Host "Status: $($login.StatusCode)" -ForegroundColor Cyan
$loginData = $login.Content | ConvertFrom-Json
$token = $loginData.accessToken
Write-Host "Token (first 50 chars): $($token.Substring(0, 50))..."

# 3️⃣ SETUP PROFILE - Create new account
Write-Host "`n3. SETUP PROFILE - Create account" -ForegroundColor Green
$body = @{
  client_name="Alice Trader"
  phone_no="+1-555-1234"
  dob="1995-06-15"
} | ConvertTo-Json
$profile = Invoke-WebRequest -Uri "http://localhost:3000/auth/me/profile" `
  -Method PUT `
  -Headers @{"Authorization"="Bearer $token"; "Content-Type"="application/json"} `
  -Body $body
Write-Host "Status: $($profile.StatusCode)" -ForegroundColor Cyan
$profileData = $profile.Content | ConvertFrom-Json
$accountId = $profileData.accountId
Write-Host "accountId in response: $accountId" -ForegroundColor Yellow

# 4️⃣ LOGIN - Second time (JWT will NOW have accountId)
Write-Host "`n4. LOGIN - Second time (accountId included)" -ForegroundColor Green
$body = @{username="alice.trader"; password="AliceTrader123!@#"} | ConvertTo-Json
$login2 = Invoke-WebRequest -Uri "http://localhost:3000/auth/login" `
  -Method POST -Headers @{"Content-Type"="application/json"} -Body $body
Write-Host "Status: $($login2.StatusCode)" -ForegroundColor Cyan
$newToken = ($login2.Content | ConvertFrom-Json).accessToken
Write-Host "New token includes accountId in JWT claims"

# 5️⃣ GET /auth/me - Verify profile
Write-Host "`n5. GET /auth/me" -ForegroundColor Green
$me = Invoke-WebRequest -Uri "http://localhost:3000/auth/me" `
  -Method GET `
  -Headers @{"Authorization"="Bearer $newToken"}
Write-Host "Status: $($me.StatusCode)" -ForegroundColor Cyan
$meData = $me.Content | ConvertFrom-Json
Write-Host "Username: $($meData.username), AccountId: $($meData.accountId)"
```

---

## 🎯 Test Checklist

- [ ] 1. Register (no accountId) → 201, accountId null
- [ ] 2. Login first → 200, JWT no accountId
- [ ] 3. Setup profile → 200, accountId set
- [ ] 4. Login second → 200, JWT has accountId
- [ ] 5. Get /auth/me → 200, full profile
- [ ] 6. Refresh token → 200, new tokens
- [ ] 7. Duplicate register → 409
- [ ] 8. Wrong password → 401
- [ ] 9. Invalid input → 422
- [ ] 10. Missing JWT → 401

---

**All endpoints updated and ready to test!** ✅
psql -h localhost -d auth_db -U postgres -c "SELECT username, email FROM users ORDER BY created_on DESC LIMIT 5;"
```
