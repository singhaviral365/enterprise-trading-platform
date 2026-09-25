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

    private Long verifyTokenSignature(String token) {
        SecretKey key = jwtConfig.getSigningKey();
        
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

            return userId;
            
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
        } catch (JwtException e) {
            logger.warn("JWT verification failed: {}", e.getMessage());
            throw new JwtVerificationException("Token verification failed");
        }
    }

    private Long extractUserId(Claims claims) {
        Object rawSubject = claims.get(SUBJECT_CLAIM);
        if (rawSubject == null) {
            rawSubject = claims.getSubject();
        }

        if (rawSubject == null) {
            return null;
        }

        if (rawSubject instanceof Number num) {
            return num.longValue();
        } else if (rawSubject instanceof String str) {
            try {
                return Long.parseLong(str);
            } catch (NumberFormatException e) {
                logger.error("Invalid {} format: {}", SUBJECT_CLAIM, str);
                return null;
            }
        }
        
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
