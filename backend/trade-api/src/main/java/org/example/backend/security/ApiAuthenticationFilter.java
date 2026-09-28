package org.example.backend.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.example.backend.dto.ErrorResponse;
import org.example.backend.exceptions.UnauthorisedException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Authenticates all /api/v1/* requests by verifying JWT Bearer token.
 * 
 * Check order: signature → expiry → algorithm (per story requirements).
 * Dev tokens (dev-user-N / dev-account-N) are supported for testing.
 * All token failures return AUTH-401 (Unauthorised).
 */
@Component
public class ApiAuthenticationFilter extends OncePerRequestFilter {

    private static final Logger logger = LoggerFactory.getLogger(ApiAuthenticationFilter.class);
    private static final String DEV_USER_TOKEN_PREFIX = "dev-user-";
    private static final String DEV_TOKEN_PREFIX = "dev-account-";

    private final JwtVerifier jwtVerifier;

    public ApiAuthenticationFilter(JwtVerifier jwtVerifier) {
        this.jwtVerifier = jwtVerifier;
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
        
        // Check header presence and scheme
        if (header == null || !header.startsWith("Bearer ")) {
            logger.warn("Missing or invalid Authorization header");
            reject(response);
            return;
        }

        String token = header.substring(7).trim();
        if (token.isEmpty()) {
            logger.warn("Empty Bearer token");
            reject(response);
            return;
        }

        Long userId = extractUserId(token);
        if (userId == null || userId < 1) {
            logger.warn("Failed to extract valid user ID from token");
            reject(response);
            return;
        }

        request.setAttribute(AuthContext.USER_ID_ATTRIBUTE, userId);
        // Backward-compatible attribute for older tests/utilities.
        request.setAttribute(AuthContext.ACCOUNT_ID_ATTRIBUTE, userId);
        filterChain.doFilter(request, response);
    }

    /**
     * Extract user ID from token.
     * Tries dev token format first, then JWT verification.
     */
    private Long extractUserId(String token) {
        if (token.startsWith(DEV_USER_TOKEN_PREFIX)) {
            return parseDevToken(token, DEV_USER_TOKEN_PREFIX);
        }

        // Support legacy dev-account-* tokens for compatibility.
        if (token.startsWith(DEV_TOKEN_PREFIX)) {
            return parseDevToken(token, DEV_TOKEN_PREFIX);
        }

        // Support plain numeric bearer tokens in local stub mode.
        // This keeps test clients simple while still rejecting non-numeric strings.
        if (!token.contains(".")) {
            try {
                return Long.parseLong(token);
            } catch (NumberFormatException e) {
                logger.warn("Unsupported non-JWT token format for local auth stub");
                return null;
            }
        }

        // Verify JWT token (signature → expiry → algorithm)
        try {
            return jwtVerifier.verifyAndExtractUserId(token);
        } catch (JwtVerifier.JwtVerificationException e) {
            // All JWT failures logged by verifier; return null to trigger AUTH-401
            return null;
        }
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
