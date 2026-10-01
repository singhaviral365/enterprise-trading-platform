package org.example.backend.security;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;

class JwtConfigurationTest {

    private static final String VALID_SECRET = "this-is-a-very-long-secret-key-for-testing-hs256-with-enough-length-for-security";
    private static final String VALID_ISSUER = "auth-service";

    @Test
    void acceptsValidSecret() {
        assertDoesNotThrow(() -> new JwtConfiguration(VALID_SECRET, VALID_ISSUER));
    }

    @Test
    void trimsAndUnquotesSecret() {
        assertDoesNotThrow(() -> new JwtConfiguration("  \"" + VALID_SECRET + "\"  ", VALID_ISSUER));
    }

    @Test
    void rejectsTooShortSecretWithHelpfulMessage() {
        IllegalStateException exception = assertThrows(
                IllegalStateException.class,
                () -> new JwtConfiguration("short-secret-value", VALID_ISSUER)
        );

        assertTrue(exception.getMessage().contains("JWT_SECRET must be at least 32 bytes"));
    }

    @Test
    void rejectsBlankSecret() {
        IllegalStateException exception = assertThrows(
                IllegalStateException.class,
                () -> new JwtConfiguration("   ", VALID_ISSUER)
        );

        assertTrue(exception.getMessage().contains("JWT_SECRET is empty"));
    }
}

