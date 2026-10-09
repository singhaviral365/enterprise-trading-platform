package org.example.trade_executor.strategy;

import io.jsonwebtoken.Jwts;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

/**
 * Mints the token a strategy's order is placed with. The identity decision, in one place.
 *
 * <p>A strategy runs when nobody is logged in, so there is no customer token to use, and a standing "robot" login that can
 * trade for anyone would be the most valuable credential on the platform. Instead each order gets a token of its own:
 * <ul>
 *   <li>{@code sub} is the <b>strategy's owner</b>, so the order route's ordinary ownership check is the one that runs;</li>
 *   <li>{@code act=strategy-executor} and {@code strategy_id} say who is acting and for which strategy, and the order route
 *       refuses to let such a token do anything but place that strategy's one order while it holds its claim;</li>
 *   <li>it expires in about a minute, long enough for one HTTP call and not for anything else.</li>
 * </ul>
 * It is signed with the same secret and issuer the order-service verifies the Auth service's tokens with, so there is nothing
 * new to configure and no second key to protect. The token is never stored and never logged.
 */
@Component
public class ExecutorTokenMinter {

    static final long MAX_TTL_SECONDS = 120;

    private final SecretKey key;
    private final String issuer;
    private final Duration ttl;
    private final Clock clock;

    @Autowired
    public ExecutorTokenMinter(
            @Value("${strategy.token.secret}") String secret,
            @Value("${strategy.token.issuer}") String issuer,
            @Value("${strategy.token.ttl-seconds:60}") long ttlSeconds) {
        this(secret, issuer, ttlSeconds, Clock.systemUTC());
    }

    ExecutorTokenMinter(String secret, String issuer, long ttlSeconds, Clock clock) {
        this.key = keyFrom(secret);
        this.issuer = issuer == null ? "" : issuer.trim();
        this.ttl = Duration.ofSeconds(Math.max(10, Math.min(ttlSeconds, MAX_TTL_SECONDS)));
        this.clock = clock;
    }

    /** False when no usable secret is configured: the worker then claims nothing, rather than claim and fail. */
    public boolean isConfigured() {
        return key != null && !issuer.isEmpty();
    }

    /** A token for {@code userId}, valid for one strategy's order and for {@link #MAX_TTL_SECONDS} seconds at most. */
    public String mint(long userId, long strategyId) {
        if (!isConfigured()) {
            throw new IllegalStateException("The strategy token secret is not configured");
        }
        Instant now = clock.instant();
        return Jwts.builder()
                .issuer(issuer)
                .subject(String.valueOf(userId))
                .claim("act", "strategy-executor")
                .claim("strategy_id", strategyId)
                .id(UUID.randomUUID().toString())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(ttl)))
                .signWith(key, Jwts.SIG.HS256)
                .compact();
    }

    /** Same reading of the secret as the order-service's JwtConfiguration: surrounding quotes dropped, 32 bytes at least. */
    private static SecretKey keyFrom(String secret) {
        if (secret == null) {
            return null;
        }
        String trimmed = secret.trim();
        if (trimmed.length() >= 2
                && ((trimmed.startsWith("\"") && trimmed.endsWith("\""))
                || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
            trimmed = trimmed.substring(1, trimmed.length() - 1).trim();
        }
        byte[] bytes = trimmed.getBytes(StandardCharsets.UTF_8);
        if (bytes.length < 32) {
            return null;
        }
        return new SecretKeySpec(bytes, "HmacSHA256");
    }
}
