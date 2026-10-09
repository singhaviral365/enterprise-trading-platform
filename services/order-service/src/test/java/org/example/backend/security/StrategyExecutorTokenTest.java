package org.example.backend.security;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.OptionalLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * The identity decision for automated strategies, as the order-service enforces it: a token minted by the executor for one
 * strategy is a signed token like any other (so its subject is the strategy's owner and the ordinary ownership check runs),
 * but it is accepted for one request only, order placement, and carries the strategy it was minted for.
 */
class StrategyExecutorTokenTest {

    private static final String SECRET = "this-is-a-very-long-secret-key-for-testing-hs256-with-enough-length-for-security";
    private static final long OWNER = 1004L;

    private SecretKey key;
    private JwtVerifier verifier;
    private ApiAuthenticationFilter filter;

    @BeforeEach
    void setUp() {
        key = Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8));
        JwtConfiguration config = mock(JwtConfiguration.class);
        when(config.getSigningKey()).thenReturn(key);
        when(config.getIssuer()).thenReturn("auth-service");
        verifier = new JwtVerifier(config);
        filter = new ApiAuthenticationFilter(verifier, false);
    }

    private String executorToken(Object strategyId) {
        var builder = Jwts.builder()
                .subject(String.valueOf(OWNER))
                .issuer("auth-service")
                .claim("act", "strategy-executor")
                .issuedAt(Date.from(Instant.now()))
                .expiration(Date.from(Instant.now().plus(60, ChronoUnit.SECONDS)));
        if (strategyId != null) {
            builder.claim("strategy_id", strategyId);
        }
        return builder.signWith(key, Jwts.SIG.HS256).compact();
    }

    private MockHttpServletRequest request(String method, String uri, String token) {
        MockHttpServletRequest request = new MockHttpServletRequest(method, uri);
        request.addHeader("Authorization", "Bearer " + token);
        return request;
    }

    private MockHttpServletResponse run(MockHttpServletRequest request) throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response;
    }

    @Test
    void theVerifierReadsTheStrategyAndTheOwnerFromASignedToken() {
        JwtVerifier.VerifiedToken verified = verifier.verify(executorToken(5001));

        assertEquals(OWNER, verified.userId());
        assertEquals("strategy-executor", verified.actor());
        assertEquals(5001L, verified.strategyId());
        assertTrue(verified.isStrategyExecutor());
    }

    @Test
    void aCustomersOwnTokenCarriesNoActorAndNoStrategy() {
        String token = Jwts.builder().subject("77").issuer("auth-service")
                .expiration(Date.from(Instant.now().plus(1, ChronoUnit.HOURS))).signWith(key, Jwts.SIG.HS256).compact();

        JwtVerifier.VerifiedToken verified = verifier.verify(token);

        assertEquals(77L, verified.userId());
        assertNull(verified.actor());
        assertNull(verified.strategyId());
        assertFalse(verified.isStrategyExecutor());
    }

    @Test
    void anExecutorTokenWithoutAStrategyIsRefused() {
        assertThrows(JwtVerifier.JwtVerificationException.class, () -> verifier.verify(executorToken(null)));
        assertThrows(JwtVerifier.JwtVerificationException.class, () -> verifier.verify(executorToken(0)));
        assertThrows(JwtVerifier.JwtVerificationException.class, () -> verifier.verify(executorToken("not-a-number")));
    }

    @Test
    void anActorTheAuthServiceNeverIssuesIsRefused() {
        String token = Jwts.builder().subject("77").issuer("auth-service").claim("act", "admin")
                .expiration(Date.from(Instant.now().plus(1, ChronoUnit.HOURS))).signWith(key, Jwts.SIG.HS256).compact();

        assertThrows(JwtVerifier.JwtVerificationException.class, () -> verifier.verify(token));
    }

    @Test
    void anActorClaimOnAnUnsignedOrWronglySignedTokenIsNeverHonoured() {
        SecretKey other = Keys.hmacShaKeyFor("a-completely-different-secret-that-is-also-long-enough-for-hs256".getBytes(StandardCharsets.UTF_8));
        String forged = Jwts.builder().subject(String.valueOf(OWNER)).issuer("auth-service")
                .claim("act", "strategy-executor").claim("strategy_id", 5001)
                .expiration(Date.from(Instant.now().plus(1, ChronoUnit.HOURS))).signWith(other, Jwts.SIG.HS256).compact();

        assertThrows(JwtVerifier.JwtVerificationException.class, () -> verifier.verify(forged));
    }

    @Test
    void anExpiredExecutorTokenIsRefusedLikeAnyOther() {
        String expired = Jwts.builder().subject(String.valueOf(OWNER)).issuer("auth-service")
                .claim("act", "strategy-executor").claim("strategy_id", 5001)
                .expiration(Date.from(Instant.now().minus(1, ChronoUnit.MINUTES))).signWith(key, Jwts.SIG.HS256).compact();

        assertThrows(JwtVerifier.JwtVerificationException.class, () -> verifier.verify(expired));
    }

    @Test
    void theFilterLetsAnExecutorTokenPlaceAnOrderAndRecordsWhichStrategyItIsFor() throws Exception {
        MockHttpServletRequest request = request("POST", "/api/v1/orders", executorToken(5001));

        MockHttpServletResponse response = run(request);

        assertEquals(200, response.getStatus());
        assertEquals(OWNER, AuthContext.requiredUserId(request));
        assertEquals(OptionalLong.of(5001), AuthContext.strategyId(request));
    }

    @Test
    void aCustomersOwnTokenOnTheSameRouteSetsNoStrategy() throws Exception {
        String token = Jwts.builder().subject("77").issuer("auth-service")
                .expiration(Date.from(Instant.now().plus(1, ChronoUnit.HOURS))).signWith(key, Jwts.SIG.HS256).compact();
        MockHttpServletRequest request = request("POST", "/api/v1/orders", token);

        run(request);

        assertEquals(77L, AuthContext.requiredUserId(request));
        assertEquals(OptionalLong.empty(), AuthContext.strategyId(request));
    }

    @Test
    void anExecutorTokenIsRefusedOnEveryOtherRoute() throws Exception {
        String[][] attempts = {
                {"GET", "/api/v1/accounts/1005/orders"},
                {"GET", "/api/v1/accounts/1005/balance"},
                {"GET", "/api/v1/accounts/1005/positions"},
                {"DELETE", "/api/v1/orders/12"},
                {"GET", "/api/v1/orders"},
                {"POST", "/api/v1/orders/"},
                {"POST", "/api/v1/strategies"},
                {"PATCH", "/api/v1/strategies/5001"},
                {"POST", "/api/v1/signals/chat"},
        };
        for (String[] attempt : attempts) {
            MockHttpServletRequest request = request(attempt[0], attempt[1], executorToken(5001));

            MockHttpServletResponse response = run(request);

            assertEquals(401, response.getStatus(), attempt[0] + " " + attempt[1]);
            assertNull(request.getAttribute(AuthContext.USER_ID_ATTRIBUTE), attempt[0] + " " + attempt[1]);
        }
    }

    @Test
    void theSameRestrictionHoldsWhenTheDevelopmentTokenModeIsOn() throws Exception {
        filter = new ApiAuthenticationFilter(verifier, true);

        MockHttpServletResponse refused = run(request("GET", "/api/v1/accounts/1005/balance", executorToken(5001)));
        assertEquals(401, refused.getStatus());

        MockHttpServletRequest order = request("POST", "/api/v1/orders", executorToken(5001));
        assertEquals(200, run(order).getStatus());
        assertNotNull(AuthContext.strategyId(order).orElse(0));
    }

    @Test
    void aDevelopmentTokenNeverCarriesAStrategy() throws Exception {
        filter = new ApiAuthenticationFilter(verifier, true);
        MockHttpServletRequest request = request("POST", "/api/v1/orders", "dev-user-1004");

        run(request);

        assertEquals(1004L, AuthContext.requiredUserId(request));
        assertEquals(OptionalLong.empty(), AuthContext.strategyId(request));
    }
}
