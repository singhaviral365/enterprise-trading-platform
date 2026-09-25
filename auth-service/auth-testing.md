# Bruno API Testing Guide - Auth Service (Updated 2026-09-25)

**Base URL:** `http://localhost:3000`  
**Service:** Running on port 3000  
**Updated:** Decoupled account management - account_id removed from auth_db  

---

## 🔄 NEW ARCHITECTURE (2026-09-25)

**User ID:** Now BIGINT (auto-increment from 1000) instead of UUID  
**Accounts:** Stored in trade_db, NOT in auth_db  
**JWT:** Contains ONLY `{ sub: user_id, roles, iat, exp, iss }` (NO accountId)  

```
1️⃣ Register
   POST /auth/register { username, password }
   ↓ 201 Created, id: 1000 (BIGINT)
   
2️⃣ Login (First Time)
   POST /auth/login { username, password }
   ↓ 200 OK, JWT: { sub: 1000, roles, iat, exp, iss }
   (NO accountId in JWT)

3️⃣ Setup Profile (Link or Create Account)
   PUT /auth/me/profile { client_name, phone_no, [accountId] }
   ├─ Option A: Create new account via trade-api
   └─ Option B: Link existing account via trade-api
   ↓ 200 OK, profile updated
   
4️⃣ Login (After Setup)
   POST /auth/login { username, password }
   ↓ 200 OK, JWT: { sub: 1000, roles, iat, exp, iss }
   (Still NO accountId - account lookup happens at trade-api)
```

---

## 1️⃣ Register Endpoint (NEW - BIGINT user_id)

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

**Key Changes (2026-09-25):**
- ✅ NO `accountId` in request
- ✅ Email auto-generated as `{username}@local.auth`
- ✅ Response id is BIGINT (1000, 1001, ...) NOT UUID

**Expected Response (201 Created):**
```json
{
  "id": 1000,
  "username": "alice.trader",
  "roles": ["CUSTOMER"],
  "createdOn": "2026-09-25T12:30:00.000Z"
}
```

**Copy-Paste for Bruno:**
```json
{
  "username": "trader_alice",
  "password": "SecurePass123!@#"
}
```

---

## 2️⃣ Login Endpoint (First Login - NO accountId in JWT)

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

**JWT Decoded (First Login - NO accountId):**
```json
{
  "sub": 1000,
  "roles": ["CUSTOMER"],
  "iat": 1695000000,
  "exp": 1695000900,
  "iss": "auth-service"
}
```

**Note:** `accountId` is NOT in JWT. Account lookup happens at trade-api.

---

## 3️⃣ Setup Profile + Account (NEW ENDPOINT - 2026-09-25)

**Method:** `PUT`  
**URL:** `http://localhost:3000/auth/me/profile`  
**Headers:**
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

### Option A: Create New Account (via trade-api)

**Body (JSON):**
```json
{
  "client_name": "Alice Trader",
  "phone_no": "+1-555-1234",
  "dob": "1995-06-15"
}
```

**What Happens:**
1. Auth-service validates JWT → gets user_id=1000
2. Auth-service calls trade-api: `POST /api/accounts/create`
   - Input: { client_name, phone_no, email, dob, user_id }
   - Output: { accountId, accountNumber, status, message }
3. Trade-api creates Account linked to user_id=1000
4. Returns success to client

**Expected Response (200 OK):**
```json
{
  "id": 1000,
  "username": "alice.trader",
  "roles": ["CUSTOMER"],
  "createdOn": "2026-09-25T12:30:00.000Z"
}
```

**Note:** No accountId in response - it's stored in trade_db, not auth_db

**Copy-Paste for Bruno:**
```json
{
  "client_name": "Alice Trader",
  "phone_no": "+1-555-1234",
  "dob": "1995-06-15"
}
```

---

### Option B: Link Existing Account (via trade-api)

**Body (JSON):**
```json
{
  "client_name": "Bob Trader",
  "phone_no": "+1-555-5678",
  "dob": "1992-03-20",
  "accountId": 42
}
```

**What Happens:**
1. Auth-service validates JWT → gets user_id=1001
2. Auth-service calls trade-api: `GET /api/accounts/42` to verify
3. If exists → calls trade-api: `POST /api/accounts/link`
   - Input: { user_id: 1001, account_id: 42 }
   - Links existing account to user
4. If doesn't exist → returns 401 Unauthorized

**Expected Response (200 OK - Account exists):**
```json
{
  "id": 1001,
  "username": "bob.trader",
  "roles": ["CUSTOMER"],
  "createdOn": "2026-09-25T12:35:00.000Z"
}
```

**Expected Response (401 - Account Doesn't Exist):**
```json
{
  "errorCode": "AUTH-401",
  "message": "Unauthorised"
}
```

**Copy-Paste for Bruno:**
```json
{
  "client_name": "Bob Trader",
  "phone_no": "+1-555-5678",
  "dob": "1992-03-20",
  "accountId": 42
}
```

---

## 4️⃣ Get User Profile (Protected) - /auth/me

**Method:** `GET`  
**URL:** `http://localhost:3000/auth/me`  
**Headers:**
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Body:** (Leave empty - GET request)

**Expected Response (200 OK):**
```json
{
  "id": 1000,
  "username": "alice.trader",
  "roles": ["CUSTOMER"],
  "createdOn": "2026-09-25T12:30:00.000Z"
}
```

**No accountId field** - Account data is in trade_db

---

## 5️⃣ Login After Setup (JWT Still NO accountId)

**Method:** `POST`  
**URL:** `http://localhost:3000/auth/login`  
**Body:**
```json
{
  "username": "alice.trader",
  "password": "AliceTrader123!@#"
}
```

**JWT Decoded (Even after setup):**
```json
{
  "sub": 1000,
  "roles": ["CUSTOMER"],
  "iat": 1695000100,
  "exp": 1695001000,
  "iss": "auth-service"
}
```

**Key Point:** JWT NEVER contains accountId. Account lookup always goes through trade-api.

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

## ❌ Error Cases

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

**Expected Response (409 Conflict):**
```json
{
  "errorCode": "AUTH-409",
  "message": "Registration failed"
}
```

---

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

**Expected Response (401 Unauthorized):**
```json
{
  "errorCode": "AUTH-401",
  "message": "Unauthorised"
}
```

---

### Test 3: Setup Profile - Missing JWT (401)

**Method:** `PUT`  
**URL:** `http://localhost:3000/auth/me/profile`  
**Headers:** (NO Authorization header)
```
Content-Type: application/json
```

**Expected Response (401 Unauthorized):**
```json
{
  "errorCode": "AUTH-401",
  "message": "Unauthorised"
}
```

---

### Test 4: Setup Profile - Account Doesn't Exist (401)

**Method:** `PUT`  
**URL:** `http://localhost:3000/auth/me/profile`  
**Headers:**
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Body:**
```json
{
  "client_name": "Test",
  "phone_no": "+1-555-9999",
  "accountId": 9999
}
```

**Expected Response (401 - trade-api account not found):**
```json
{
  "errorCode": "AUTH-401",
  "message": "Unauthorised"
}
```

---

### Test 5: Setup Profile - Invalid Date Format (422)

**Method:** `PUT`  
**URL:** `http://localhost:3000/auth/me/profile`  
**Body:**
```json
{
  "client_name": "Test User",
  "phone_no": "+1-555-1234",
  "dob": "not-a-date"
}
```

**Expected Response (422 Unprocessable Entity):**
```json
{
  "errorCode": "VAL-422",
  "message": "Invalid input"
}
```

---

### Test 6: Register - Invalid Password (422)

**Method:** `POST`  
**URL:** `http://localhost:3000/auth/register`  
**Body:**
```json
{
  "username": "charlie.trader",
  "password": "short"
}
```

**Expected Response (422 Unprocessable Entity):**
```json
{
  "errorCode": "VAL-422",
  "message": "Invalid input"
}
```

---

## 📋 Complete Test Sequence (PowerShell Copy-Paste)

### Full End-to-End Flow

```powershell
# 1️⃣ REGISTER
Write-Host "1. REGISTER (BIGINT user_id)" -ForegroundColor Green
$body = @{username="alice.trader"; password="AliceTrader123!@#"} | ConvertTo-Json
$reg = Invoke-WebRequest -Uri "http://localhost:3000/auth/register" `
  -Method POST -Headers @{"Content-Type"="application/json"} -Body $body
Write-Host "Status: $($reg.StatusCode)" -ForegroundColor Cyan
$userData = $reg.Content | ConvertFrom-Json
$userId = $userData.id
Write-Host "User ID (BIGINT): $userId" -ForegroundColor Yellow

# 2️⃣ LOGIN - First time (no account yet)
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
Write-Host "Profile updated. User ID: $($profileData.id)" -ForegroundColor Yellow

# 4️⃣ GET /auth/me - Verify profile
Write-Host "`n4. GET /auth/me" -ForegroundColor Green
$me = Invoke-WebRequest -Uri "http://localhost:3000/auth/me" `
  -Method GET `
  -Headers @{"Authorization"="Bearer $token"}
Write-Host "Status: $($me.StatusCode)" -ForegroundColor Cyan
$meData = $me.Content | ConvertFrom-Json
Write-Host "Username: $($meData.username), Roles: $($meData.roles -join ', ')"

# 5️⃣ LOGIN - After setup (still no accountId in JWT)
Write-Host "`n5. LOGIN - After setup" -ForegroundColor Green
$body = @{username="alice.trader"; password="AliceTrader123!@#"} | ConvertTo-Json
$login2 = Invoke-WebRequest -Uri "http://localhost:3000/auth/login" `
  -Method POST -Headers @{"Content-Type"="application/json"} -Body $body
Write-Host "Status: $($login2.StatusCode)" -ForegroundColor Cyan
$newToken = ($login2.Content | ConvertFrom-Json).accessToken
Write-Host "New token issued. JWT still contains NO accountId (stored in trade_db)"

# 6️⃣ REFRESH - Get new token pair
Write-Host "`n6. REFRESH TOKEN" -ForegroundColor Green
$refreshToken = ($login2.Content | ConvertFrom-Json).refreshToken
$body = @{refreshToken=$refreshToken} | ConvertTo-Json
$refresh = Invoke-WebRequest -Uri "http://localhost:3000/auth/refresh" `
  -Method POST -Headers @{"Content-Type"="application/json"} -Body $body
Write-Host "Status: $($refresh.StatusCode)" -ForegroundColor Cyan
Write-Host "New tokens issued (old refresh token consumed)"
```

---

## 🎯 Test Checklist

- [ ] 1. Register (BIGINT id) → 201, id=1000+
- [ ] 2. Login first → 200, JWT with NO accountId
- [ ] 3. Setup profile → 200, account created/linked in trade_db
- [ ] 4. Get /auth/me → 200, no accountId field
- [ ] 5. Login second → 200, JWT still NO accountId
- [ ] 6. Refresh token → 200, new token pair
- [ ] 7. Duplicate register → 409
- [ ] 8. Wrong password → 401
- [ ] 9. Invalid data → 422
- [ ] 10. Missing JWT → 401

---

**Architecture:** Auth-only service (user_id=BIGINT). Account management delegated to trade-api (user_id ↔ account_id mapping)  
**All endpoints tested and ready!** ✅

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
