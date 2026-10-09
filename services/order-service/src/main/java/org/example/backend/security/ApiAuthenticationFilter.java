package org.example.backend.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.example.backend.dto.ErrorResponse;
import org.example.backend.exceptions.UnauthorisedException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;

/**
 * Authenticates all /api/v1/* requests by verifying a signed JWT.
 *
 * <p>The token comes from the {@code Authorization: Bearer} header (API clients) or, when there is no such
 * header, from the HttpOnly {@code access_token} cookie the Auth service sets for browser sessions. A cookie is
 * attached by the browser to any request, whoever started it, so a state-changing request authenticated by a
 * cookie alone must also carry an {@code X-Requested-With} header (which a cross-site form cannot add); this
 * backs up the cookie's SameSite attribute.
 *
 * Check order: signature → expiry → algorithm (per story requirements).
 * The user id always comes from a JWT signed by the Auth service. Unsigned shortcut tokens
 * (dev-user-N / dev-account-N / a bare number) let the caller pick any user id, so they are only
 * honoured when security.dev-tokens.enabled=true, which only the test configuration sets.
 * All token failures return AUTH-401 (Unauthorised).
 */
@Component
public class ApiAuthenticationFilter extends OncePerRequestFilter {

    private static final Logger logger = LoggerFactory.getLogger(ApiAuthenticationFilter.class);
    /** Name of the cookie the Auth service puts the access JWT in. */
    static final String ACCESS_TOKEN_COOKIE = "access_token";
    static final String CSRF_HEADER = "X-Requested-With";
    private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "OPTIONS", "TRACE");
    private static final String DEV_USER_TOKEN_PREFIX = "dev-user-";
    private static final String DEV_TOKEN_PREFIX = "dev-account-";

    private final JwtVerifier jwtVerifier;
    private final boolean devTokensEnabled;

    public ApiAuthenticationFilter(
            JwtVerifier jwtVerifier,
            @Value("${security.dev-tokens.enabled:false}") boolean devTokensEnabled) {
        this.jwtVerifier = jwtVerifier;
        this.devTokensEnabled = devTokensEnabled;
        if (devTokensEnabled) {
            logger.warn("Unsigned dev tokens are ENABLED. Never enable security.dev-tokens.enabled outside tests.");
        }
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        boolean v1Path = path.startsWith("/api/v1/") || path.equals("/api/v1");
        boolean accountsPath = path.startsWith("/api/v1/accounts/") || path.equals("/api/v1/accounts");
        return !v1Path && !accountsPath;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {

        String header = request.getHeader("Authorization");
        String token;

        if (header != null) {
            // Check scheme. A malformed header is never papered over by falling back to a cookie.
            if (!header.startsWith("Bearer ")) {
                logger.warn("Missing or invalid Authorization header");
                reject(response);
                return;
            }
            token = header.substring(7).trim();
        } else {
            token = readAccessTokenCookie(request);
            if (token != null && isStateChanging(request) && !hasCsrfHeader(request)) {
                logger.warn("Cookie-authenticated {} without the {} header", request.getMethod(), CSRF_HEADER);
                reject(response);
                return;
            }
        }

        if (token == null) {
            logger.warn("Missing or invalid Authorization header");
            reject(response);
            return;
        }
        if (token.isEmpty()) {
            logger.warn("Empty Bearer token");
            reject(response);
            return;
        }

        JwtVerifier.VerifiedToken verified = authenticate(token);
        Long userId = verified == null ? null : verified.userId();
        if (userId == null || userId < 1) {
            logger.warn("Failed to extract valid user ID from token");
            reject(response);
            return;
        }

        if (verified.isStrategyExecutor()) {
            // The executor's token is minted for one strategy's order and nothing else. Refusing it everywhere else means a
            // stolen one cannot read an account or cancel an order, only try the one order the strategy is allowed to place.
            if (!isOrderPlacement(request)) {
                logger.warn("A strategy executor token was used outside order placement: {} {}",
                        request.getMethod(), request.getRequestURI());
                reject(response);
                return;
            }
            request.setAttribute(AuthContext.STRATEGY_ID_ATTRIBUTE, verified.strategyId());
        }

        request.setAttribute(AuthContext.USER_ID_ATTRIBUTE, userId);
        // Backward-compatible attribute for older tests/utilities.
        request.setAttribute(AuthContext.ACCOUNT_ID_ATTRIBUTE, userId);
        filterChain.doFilter(request, response);
    }

    private static String readAccessTokenCookie(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie cookie : cookies) {
            if (ACCESS_TOKEN_COOKIE.equals(cookie.getName())) {
                String value = cookie.getValue();
                return value == null ? null : value.trim();
            }
        }
        return null;
    }

    private static boolean isStateChanging(HttpServletRequest request) {
        String method = request.getMethod();
        return method == null || !SAFE_METHODS.contains(method.toUpperCase());
    }

    private static boolean hasCsrfHeader(HttpServletRequest request) {
        String value = request.getHeader(CSRF_HEADER);
        return value != null && !value.isBlank();
    }

    private static boolean isOrderPlacement(HttpServletRequest request) {
        return "POST".equalsIgnoreCase(request.getMethod()) && "/api/v1/orders".equals(request.getRequestURI());
    }

    /**
     * Resolves the token to who it is for. Only a signed JWT is accepted, unless dev tokens are explicitly enabled (tests
     * only), and even then the strategy executor's actor claim is only ever read from a signed JWT: a dev token never carries
     * one.
     *
     * @return null when the token is not acceptable
     */
    private JwtVerifier.VerifiedToken authenticate(String token) {
        if (!devTokensEnabled) {
            return verifySigned(token);
        }

        if (token.startsWith(DEV_USER_TOKEN_PREFIX)) {
            return plain(parseDevToken(token, DEV_USER_TOKEN_PREFIX));
        }

        // Support legacy dev-account-* tokens for compatibility.
        if (token.startsWith(DEV_TOKEN_PREFIX)) {
            return plain(parseDevToken(token, DEV_TOKEN_PREFIX));
        }

        // Support plain numeric bearer tokens in local stub mode.
        // This keeps test clients simple while still rejecting non-numeric strings.
        if (!token.contains(".")) {
            try {
                return plain(Long.parseLong(token));
            } catch (NumberFormatException e) {
                logger.warn("Unsupported non-JWT token format for local auth stub");
                return null;
            }
        }

        // Verify JWT token (signature → expiry → algorithm)
        return verifySigned(token);
    }

    private JwtVerifier.VerifiedToken verifySigned(String token) {
        try {
            return jwtVerifier.verify(token);
        } catch (JwtVerifier.JwtVerificationException e) {
            // All JWT failures logged by verifier; return null to trigger AUTH-401
            return null;
        }
    }

    private static JwtVerifier.VerifiedToken plain(Long userId) {
        return userId == null ? null : new JwtVerifier.VerifiedToken(userId, null, null);
    }

    private Long parseDevToken(String token, String prefix) {
        try {
            String idStr = token.substring(prefix.length());
            return Long.parseLong(idStr);
        } catch (NumberFormatException e) {
            logger.warn("Invalid dev token format: {}", token);
            return null;
        }
    }

    private void reject(HttpServletResponse response) throws IOException {
        UnauthorisedException exception = new UnauthorisedException();
        ErrorResponse error = new ErrorResponse(exception.getErrorCode(), exception.getMessage());

        response.setStatus(HttpStatus.UNAUTHORIZED.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write(
                "{\"errorCode\":\"" + error.errorCode() + "\",\"message\":\"" + error.message() + "\"}");
    }
}
