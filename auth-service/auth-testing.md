# Bruno API Testing Guide - Auth Service

**Base URL:** `http://localhost:3000`  
**Service:** Running on port 3000  
**Status:** Ready for testing

---

## 1. Register Endpoint

**Method:** `POST`  
**URL:** `http://localhost:3000/auth/register`  
**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "username": "john.doe",
  "password": "JohnDoe123!@#",
  "accountId": 1
}
```

**Expected Response (201 Created):**
```json
{
  "id": "f9f12d75-3e0e-429b-a9b9-2d4243c49242",
  "username": "john.doe",
  "accountId": 1,
  "roles": ["CUSTOMER"],
  "createdOn": "2026-09-24T09:26:39.076Z"
}
```

---

## 2. Login Endpoint

**Method:** `POST`  
**URL:** `http://localhost:3000/auth/login`  
**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "username": "john.doe",
  "password": "JohnDoe123!@#"
}
```

**Expected Response (200 OK):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "a70a746d5a507a47bb967457e10796ef57cbccf7b37ff7b117e3d7dc2f961ab9",
  "tokenType": "Bearer",
  "expiresIn": 900
}
```

---

## 3. Get User Profile (Protected) - /auth/me

**Method:** `GET`  
**URL:** `http://localhost:3000/auth/me`  
**Headers:**
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Replace `{accessToken}` with the token from login response**

**Example Header:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmOWYxMmQ3NS0zZTBlLTQyOWItYTliOS0yZDQyNDNjNDkyNDIiLCJhY2NvdW50SWQiOiIxIiwicm9sZXMiOlsiQ1VTVE9NRVIiXSwiaWF0IjoxNzkwMjQyMDA1LCJleHAiOjE3OTAyNDI5MDUsImlzcyI6ImF1dGgtc2VydmljZSJ9.Jpcv7-YQUbqIoV_ISR2_V6VNYiLE2zJmDHf_B2nHYUQ
```

**Body:** (Leave empty - GET request)

**Expected Response (200 OK):**
```json
{
  "id": "f9f12d75-3e0e-429b-a9b9-2d4243c49242",
  "username": "john.doe",
  "accountId": 1,
  "roles": ["CUSTOMER"],
  "createdOn": "2026-09-24T09:26:39.076Z"
}
```

---

## 4. Refresh Token Endpoint

**Method:** `POST`  
**URL:** `http://localhost:3000/auth/refresh`  
**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "refreshToken": "a70a746d5a507a47bb967457e10796ef57cbccf7b37ff7b117e3d7dc2f961ab9"
}
```

**Replace with actual refreshToken from login response**

**Expected Response (200 OK):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "new_refresh_token_hash",
  "tokenType": "Bearer",
  "expiresIn": 900
}
```

---

## 5. Test Wrong Password (Error - 401)

**Method:** `POST`  
**URL:** `http://localhost:3000/auth/login`  
**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "username": "john.doe",
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

## 6. Test Duplicate Registration (Error - 409)

**Method:** `POST`  
**URL:** `http://localhost:3000/auth/register`  
**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "username": "john.doe",
  "password": "AnotherPass123!@#",
  "accountId": 1
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

## 7. Test Invalid Input (Error - 422)

**Method:** `POST`  
**URL:** `http://localhost:3000/auth/register`  
**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "username": "ab",
  "password": "weak",
  "accountId": -1
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

## Quick Test Sequence in Bruno

1. **Register** → Get user ID
2. **Login** → Get JWT tokens
3. **Copy accessToken**
4. **Get /auth/me** → Paste token in Authorization header
5. **Login again** → Get new refreshToken
6. **Refresh** → Test token rotation
7. **Wrong password** → Verify 401 error
8. **Duplicate register** → Verify 409 error

---

## Bruno Setup Tips

- **Environment Variables:** Create `localhost` environment with:
  - `BASE_URL` = `http://localhost:3000`
  - `ACCESS_TOKEN` = (set after login)
  - `REFRESH_TOKEN` = (set after login)

- **Use in URLs:** `{{BASE_URL}}/auth/register`

- **Use in Headers:** `Authorization: Bearer {{ACCESS_TOKEN}}`

- **Auto-update Variables:** In Bruno, set variable after login response:
  ```
  Tests tab:
  bru.setVar("ACCESS_TOKEN", res.body.accessToken)
  bru.setVar("REFRESH_TOKEN", res.body.refreshToken)
  ```

---

## Database Check (Optional)

```powershell
$env:PGPASSWORD = "n3u3d4!"
psql -h localhost -d auth_db -U postgres -c "SELECT username, email FROM users ORDER BY created_on DESC LIMIT 5;"
```
