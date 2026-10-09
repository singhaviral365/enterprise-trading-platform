package org.example.backend.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.MalformedJwtException;
import io.jsonwebtoken.UnsupportedJwtException;
import io.jsonwebtoken.security.SecurityException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;

/**
 * Verifies JWT tokens in order: signature → expiry → algorithm → claims.
 * All token failures are logged server-side for investigation, never returned to client.
 */
@Component
public class JwtVerifier {

    private static final Logger logger = LoggerFactory.getLogger(JwtVerifier.class);
    private static final String SUBJECT_CLAIM = "sub";
    private static final String USER_ID_CLAIM = "user_id";
    private static final String ACTOR_CLAIM = "act";
    private static final String STRATEGY_ID_CLAIM = "strategy_id";

    /** The only actor the platform signs a token for besides the customer: the executor, placing one strategy's order. */
    public static final String STRATEGY_EXECUTOR = "strategy-executor";

    /**
     * What a verified token says. {@code actor} and {@code strategyId} are null for a customer's own token; for the
     * strategy executor's they are {@link #STRATEGY_EXECUTOR} and the strategy the token was minted for, and
     * {@code userId} is still the strategy's owner.
     */
    public record VerifiedToken(long userId, String actor, Long strategyId) {
        public boolean isStrategyExecutor() {
            return STRATEGY_EXECUTOR.equals(actor);
        }
    }

    private final JwtConfiguration jwtConfig;

    public JwtVerifier(JwtConfiguration jwtConfig) {
        this.jwtConfig = jwtConfig;
    }

    /**
     * Verifies JWT token and extracts authenticated user ID.
     * Check order: signature → expiry → algorithm → claims.
     * 
     * @param token the JWT token string
     * @return the user ID from the token subject
     * @throws JwtVerificationException if any verification fails
     */
    public Long verifyAndExtractUserId(String token) {
        return verify(token).userId();
    }

    /**
     * Verifies the token like {@link #verifyAndExtractUserId} and also reports who is acting. An {@code act} claim other
     * than the strategy executor's, or a strategy executor's token with no strategy, is refused: the Auth service never
     * issues either, so a token carrying one was not issued for a customer.
     */
    public VerifiedToken verify(String token) {
        try {
            return verifyTokenSignature(token);
        } catch (JwtVerificationException e) {
            // Already logged by specific handler
            throw e;
        } catch (Exception e) {
            logger.error("Unexpected error verifying token", e);
            throw new JwtVerificationException("Token verification failed");
        }
    }

    private VerifiedToken verifyTokenSignature(String token) {
        SecretKey key = jwtConfig.getSigningKey();

        assertSupportedTokenFormat(token);
        
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(key)
                    .requireIssuer(jwtConfig.getIssuer())
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();

            Long userId = extractUserId(claims);
            if (userId == null || userId < 1) {
                logger.error("Invalid {} in token: {}", SUBJECT_CLAIM, userId);
                throw new JwtVerificationException("Invalid subject in token");
            }

            return new VerifiedToken(userId, actor(claims), strategyId(claims));

        } catch (SecurityException e) {
            logger.warn("Invalid JWT signature: {}", e.getMessage());
            throw new JwtVerificationException("Invalid signature");
        } catch (ExpiredJwtException e) {
            logger.warn("JWT token has expired: {}", e.getMessage());
            throw new JwtVerificationException("Token expired");
        } catch (UnsupportedJwtException e) {
            logger.warn("Unsupported JWT format: {}", e.getMessage());
            throw new JwtVerificationException("Unsupported token format");
        } catch (MalformedJwtException e) {
            logger.warn("Malformed JWT: {}", e.getMessage());
            throw new JwtVerificationException("Malformed token");
        } catch (IllegalArgumentException e) {
            logger.warn("Invalid JWT input: {}", e.getMessage());
            throw new JwtVerificationException("Malformed token");
        } catch (JwtException e) {
            logger.warn("JWT verification failed: {}", e.getMessage());
            throw new JwtVerificationException("Token verification failed");
        }
    }

    private void assertSupportedTokenFormat(String token) {
        String[] parts = token.split("\\.");
        if (parts.length == 3) {
            return;
        }

        if (parts.length == 5) {
            logger.warn("Encrypted JWE tokens are not supported. Expected signed JWT (JWS) access token");
            throw new JwtVerificationException("Unsupported token format");
        }

        logger.warn("Invalid JWT compact serialization. Expected 3 parts for JWS but got {}", parts.length);
        throw new JwtVerificationException("Malformed token");
    }

    private String actor(Claims claims) {
        Object raw = claims.get(ACTOR_CLAIM);
        if (raw == null) {
            return null;
        }
        if (!STRATEGY_EXECUTOR.equals(raw)) {
            logger.error("Token carries an unknown actor claim");
            throw new JwtVerificationException("Unsupported token");
        }
        return STRATEGY_EXECUTOR;
    }

    private Long strategyId(Claims claims) {
        Object raw = claims.get(STRATEGY_ID_CLAIM);
        if (!STRATEGY_EXECUTOR.equals(claims.get(ACTOR_CLAIM))) {
            return null;
        }
        Long id = raw == null ? null : parseClaimAsLong(raw, STRATEGY_ID_CLAIM);
        if (id == null || id < 1) {
            logger.error("A strategy executor token has no valid strategy");
            throw new JwtVerificationException("Unsupported token");
        }
        return id;
    }

    private Long extractUserId(Claims claims) {
        Object rawUserId = claims.get(USER_ID_CLAIM);
        Object rawSubject = claims.get(SUBJECT_CLAIM);

        if (rawUserId != null && rawSubject != null) {
            Long parsedUserId = parseClaimAsLong(rawUserId, USER_ID_CLAIM);
            Long parsedSubject = parseClaimAsLong(rawSubject, SUBJECT_CLAIM);
            if (parsedUserId == null || parsedSubject == null || !parsedUserId.equals(parsedSubject)) {
                logger.error("Token contains conflicting user identity claims: user_id={}, sub={}", rawUserId, rawSubject);
                return null;
            }
            return parsedUserId;
        }

        if (rawUserId != null) {
            return parseClaimAsLong(rawUserId, USER_ID_CLAIM);
        }

        if (rawSubject != null) {
            return parseClaimAsLong(rawSubject, SUBJECT_CLAIM);
        }

        String subject = claims.getSubject();
        if (subject == null) {
            return null;
        }

        return parseClaimAsLong(subject, SUBJECT_CLAIM);
    }

    private Long parseClaimAsLong(Object claimValue, String claimName) {
        if (claimValue instanceof Number num) {
            return num.longValue();
        }

        if (claimValue instanceof String str) {
            try {
                return Long.parseLong(str);
            } catch (NumberFormatException e) {
                logger.error("Invalid {} format: {}", claimName, str);
                return null;
            }
        }

        logger.error("Invalid {} type: {}", claimName, claimValue.getClass().getSimpleName());
        return null;
    }

    /**
     * Custom exception for JWT verification failures.
     * All verification failures map to AUTH-401 (Unauthorised).
     */
    public static class JwtVerificationException extends RuntimeException {
        public JwtVerificationException(String message) {
            super(message);
        }
    }
}
