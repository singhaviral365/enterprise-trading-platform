package org.example.trade_executor.strategy;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import io.jsonwebtoken.security.SignatureException;
import org.junit.jupiter.api.Test;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The token is read back here exactly as the order-service reads it: verified with the shared secret and issuer, with the
 * subject as the strategy's owner. If these claims drift from what the order-service expects, orders stop being accepted.
 */
class ExecutorTokenMinterTest {

    private static final String SECRET = "this-is-a-very-long-secret-key-for-testing-hs256-with-enough-length-for-security";
    private static final Instant NOW = Instant.parse("2026-10-07T10:00:00Z");

    private static ExecutorTokenMinter minter(String secret, long ttlSeconds) {
        return new ExecutorTokenMinter(secret, "auth-service", ttlSeconds, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void theTokenIsSignedWithTheSharedSecretAndIssuerAndNamesTheOwnerAndTheStrategy() {
        String token = minter(SECRET, 60).mint(1004, 5001);
        SecretKey key = Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8));

        Claims claims = Jwts.parser().verifyWith(key).requireIssuer("auth-service")
                .clock(() -> java.util.Date.from(NOW)).build().parseSignedClaims(token).getPayload();

        assertEquals("1004", claims.getSubject());
        assertEquals("strategy-executor", claims.get("act"));
        assertEquals(5001, ((Number) claims.get("strategy_id")).longValue());
        assertEquals("auth-service", claims.getIssuer());
    }

    @Test
    void itExpiresAfterAboutAMinute() {
        String token = minter(SECRET, 60).mint(1004, 5001);
        SecretKey key = Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8));

        Claims claims = Jwts.parser().verifyWith(key).clock(() -> java.util.Date.from(NOW)).build()
                .parseSignedClaims(token).getPayload();
        assertEquals(60, Duration.between(claims.getIssuedAt().toInstant(), claims.getExpiration().toInstant()).toSeconds());

        assertThrows(ExpiredJwtException.class, () -> Jwts.parser().verifyWith(key)
                .clock(() -> java.util.Date.from(NOW.plusSeconds(61))).build().parseSignedClaims(token));
    }

    @Test
    void noSettingCanMakeItLastLongerThanTwoMinutes() {
        String token = minter(SECRET, 86_400).mint(1004, 5001);
        SecretKey key = Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8));

        Claims claims = Jwts.parser().verifyWith(key).clock(() -> java.util.Date.from(NOW)).build()
                .parseSignedClaims(token).getPayload();

        assertEquals(120, Duration.between(claims.getIssuedAt().toInstant(), claims.getExpiration().toInstant()).toSeconds());
    }

    @Test
    void everyTokenIsDistinct() {
        ExecutorTokenMinter minter = minter(SECRET, 60);

        assertNotEquals(minter.mint(1004, 5001), minter.mint(1004, 5001));
    }

    @Test
    void aTokenSignedWithAnotherSecretIsNotAcceptedByTheOrderServicesKey() {
        String token = minter("another-secret-that-is-also-more-than-thirty-two-bytes-long", 60).mint(1004, 5001);
        SecretKey key = Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8));

        assertThrows(SignatureException.class, () -> Jwts.parser().verifyWith(key).build().parseSignedClaims(token));
    }

    @Test
    void withoutAUsableSecretItIsNotConfiguredAndRefusesToMint() {
        for (String secret : new String[] {null, "", "   ", "too-short"}) {
            ExecutorTokenMinter minter = minter(secret, 60);

            assertFalse(minter.isConfigured(), String.valueOf(secret));
            assertThrows(IllegalStateException.class, () -> minter.mint(1004, 5001));
        }
    }

    @Test
    void aSecretWrappedInQuotesIsReadTheWayTheOrderServiceReadsIt() {
        ExecutorTokenMinter minter = minter("\"" + SECRET + "\"", 60);

        assertTrue(minter.isConfigured());
        SecretKey key = Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8));
        Jwts.parser().verifyWith(key).clock(() -> java.util.Date.from(NOW)).build().parseSignedClaims(minter.mint(1004, 5001));
    }

    @Test
    void withoutAnIssuerItIsNotConfigured() {
        assertFalse(new ExecutorTokenMinter(SECRET, " ", 60, Clock.fixed(NOW, ZoneOffset.UTC)).isConfigured());
    }
}
