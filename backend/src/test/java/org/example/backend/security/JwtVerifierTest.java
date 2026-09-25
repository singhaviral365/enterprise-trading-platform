package org.example.backend.security;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

/**
 * Unit tests for JwtVerifier.
 * Verifies JWT signature, expiry, and algorithm checks work in correct order.
 */
@ExtendWith(MockitoExtension.class)
class JwtVerifierTest {

    private static final String TEST_SECRET = "this-is-a-very-long-secret-key-for-testing-hs256-with-enough-length-for-security";
    private static final long VALID_USER_ID = 123L;

    @Mock
    private JwtConfiguration mockConfig;

    private JwtVerifier verifier;
    private SecretKey signingKey;

    @BeforeEach
    void setUp() {
        signingKey = Keys.hmacShaKeyFor(TEST_SECRET.getBytes(StandardCharsets.UTF_8));
        when(mockConfig.getSigningKey()).thenReturn(signingKey);
        when(mockConfig.getIssuer()).thenReturn("auth-service");
        verifier = new JwtVerifier(mockConfig);
    }

    @Test
    void testValidTokenExtractsUserId() {
        String token = Jwts.builder()
                .subject(String.valueOf(VALID_USER_ID))
                .issuer("auth-service")
                .issuedAt(Date.from(Instant.now()))
                .expiration(Date.from(Instant.now().plus(1, ChronoUnit.HOURS)))
                .signWith(signingKey, SignatureAlgorithm.HS256)
                .compact();

        Long userId = verifier.verifyAndExtractUserId(token);
        assertEquals(VALID_USER_ID, userId);
    }

    @Test
    void testExpiredTokenThrowsJwtVerificationException() {
        String token = Jwts.builder()
                .subject(String.valueOf(VALID_USER_ID))
                .issuer("auth-service")
                .issuedAt(Date.from(Instant.now().minus(2, ChronoUnit.HOURS)))
                .expiration(Date.from(Instant.now().minus(1, ChronoUnit.HOURS)))
                .signWith(signingKey, SignatureAlgorithm.HS256)
                .compact();

        assertThrows(JwtVerifier.JwtVerificationException.class,
                () -> verifier.verifyAndExtractUserId(token));
    }

    @Test
    void testInvalidSignatureThrowsJwtVerificationException() {
        // Create token with different key
        SecretKey otherKey = Keys.hmacShaKeyFor("other-secret-key-that-is-also-long-enough-for-hs256-algorithm-testing".getBytes(StandardCharsets.UTF_8));
        String token = Jwts.builder()
                .subject(String.valueOf(VALID_USER_ID))
                .issuer("auth-service")
                .issuedAt(Date.from(Instant.now()))
                .expiration(Date.from(Instant.now().plus(1, ChronoUnit.HOURS)))
                .signWith(otherKey, SignatureAlgorithm.HS256)
                .compact();

        // Try to verify with different key
        assertThrows(JwtVerifier.JwtVerificationException.class,
                () -> verifier.verifyAndExtractUserId(token));
    }

    @Test
    void testMalformedTokenThrowsJwtVerificationException() {
        String malformedToken = "not.a.valid.token.structure";

        assertThrows(JwtVerifier.JwtVerificationException.class,
                () -> verifier.verifyAndExtractUserId(malformedToken));
    }

    @Test
    void testMissingSubjectThrowsJwtVerificationException() {
        String token = Jwts.builder()
                .issuer("auth-service")
                .issuedAt(Date.from(Instant.now()))
                .expiration(Date.from(Instant.now().plus(1, ChronoUnit.HOURS)))
                .signWith(signingKey, SignatureAlgorithm.HS256)
                .compact();

        assertThrows(JwtVerifier.JwtVerificationException.class,
                () -> verifier.verifyAndExtractUserId(token));
    }

    @Test
    void testInvalidSubjectThrowsJwtVerificationException() {
        String token = Jwts.builder()
                .subject("not-a-number")
                .issuer("auth-service")
                .issuedAt(Date.from(Instant.now()))
                .expiration(Date.from(Instant.now().plus(1, ChronoUnit.HOURS)))
                .signWith(signingKey, SignatureAlgorithm.HS256)
                .compact();

        assertThrows(JwtVerifier.JwtVerificationException.class,
                () -> verifier.verifyAndExtractUserId(token));
    }

    @Test
    void testIssuerMismatchThrowsJwtVerificationException() {
        String token = Jwts.builder()
                .subject("456")
                .issuer("different-issuer")
                .issuedAt(Date.from(Instant.now()))
                .expiration(Date.from(Instant.now().plus(1, ChronoUnit.HOURS)))
                .signWith(signingKey, SignatureAlgorithm.HS256)
                .compact();

        assertThrows(JwtVerifier.JwtVerificationException.class,
                () -> verifier.verifyAndExtractUserId(token));
    }
}
