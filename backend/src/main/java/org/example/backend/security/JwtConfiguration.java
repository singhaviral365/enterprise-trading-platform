package org.example.backend.security;

import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;

/**
 * Provides JWT signing key configured from environment.
 */
@Component
public class JwtConfiguration {

    private static final int MIN_HS256_KEY_BYTES = 32;

    private final SecretKey signingKey;
    private final String issuer;

    public JwtConfiguration(
            @Value("${jwt.secret}") String secret,
            @Value("${jwt.issuer:auth-service}") String issuer) {
        String normalizedSecret = normalize(secret);
        byte[] keyBytes = normalizedSecret.getBytes(StandardCharsets.UTF_8);

        if (keyBytes.length < MIN_HS256_KEY_BYTES) {
            throw new IllegalStateException(
                    "JWT_SECRET must be at least 32 bytes (256 bits) for HS256. "
                            + "The configured value is only " + keyBytes.length + " bytes. "
                            + "Set JWT_SECRET to a strong secret key, not a JWT token value.");
        }

        this.signingKey = Keys.hmacShaKeyFor(keyBytes);
        this.issuer = normalizeIssuer(issuer);
    }

    public SecretKey getSigningKey() {
        return signingKey;
    }

    public String getIssuer() {
        return issuer;
    }

    private static String normalize(String secret) {
        if (secret == null) {
            throw new IllegalStateException("JWT_SECRET is not configured.");
        }

        String trimmed = secret.trim();
        if (trimmed.isEmpty()) {
            throw new IllegalStateException("JWT_SECRET is empty.");
        }

        if ((trimmed.startsWith("\"") && trimmed.endsWith("\""))
                || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
            trimmed = trimmed.substring(1, trimmed.length() - 1).trim();
        }

        if (trimmed.isEmpty()) {
            throw new IllegalStateException("JWT_SECRET is empty after trimming quotes.");
        }

        return trimmed;
    }

    private static String normalizeIssuer(String issuer) {
        if (issuer == null || issuer.trim().isEmpty()) {
            throw new IllegalStateException("JWT issuer is not configured.");
        }
        return issuer.trim();
    }
}
