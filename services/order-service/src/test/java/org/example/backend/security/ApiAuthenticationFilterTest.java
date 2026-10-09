package org.example.backend.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.io.PrintWriter;
import java.io.StringWriter;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for ApiAuthenticationFilter.
 * Verifies Bearer token extraction and dev token support.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ApiAuthenticationFilterTest {

    @Mock
    private JwtVerifier mockVerifier;

    @Mock
    private HttpServletRequest mockRequest;

    @Mock
    private HttpServletResponse mockResponse;

    @Mock
    private FilterChain mockFilterChain;

    private ApiAuthenticationFilter filter;
    private StringWriter responseBody;

    @BeforeEach
    void setUp() throws Exception {
        filter = new ApiAuthenticationFilter(mockVerifier, true);
        responseBody = new StringWriter();
        when(mockResponse.getWriter()).thenReturn(new PrintWriter(responseBody));
    }

    @Test
    void testShouldFilterOnlyApiV1Paths() {
        when(mockRequest.getRequestURI()).thenReturn("/api/v1/orders");
        boolean shouldFilter = !filter.shouldNotFilter(mockRequest);
        
        org.junit.jupiter.api.Assertions.assertTrue(shouldFilter);

        when(mockRequest.getRequestURI()).thenReturn("/health");
        boolean shouldNotFilter = filter.shouldNotFilter(mockRequest);
        
        org.junit.jupiter.api.Assertions.assertTrue(shouldNotFilter);
    }

    @Test
    void testMissingAuthorizationHeaderReturnsUnauthorizedResponse() throws Exception {
        when(mockRequest.getRequestURI()).thenReturn("/api/v1/orders");
        when(mockRequest.getHeader("Authorization")).thenReturn(null);

        filter.doFilterInternal(mockRequest, mockResponse, mockFilterChain);

        verify(mockResponse).setStatus(401);
        verify(mockFilterChain, never()).doFilter(mockRequest, mockResponse);
        assertEquals("{\"errorCode\":\"AUTH-401\",\"message\":\"Unauthorised\"}", responseBody.toString());
    }

    @Test
    void testInvalidBearerSchemeReturnsUnauthorizedResponse() throws Exception {
        when(mockRequest.getRequestURI()).thenReturn("/api/v1/orders");
        when(mockRequest.getHeader("Authorization")).thenReturn("Basic token");

        filter.doFilterInternal(mockRequest, mockResponse, mockFilterChain);

        verify(mockResponse).setStatus(401);
        verify(mockFilterChain, never()).doFilter(mockRequest, mockResponse);
    }

    @Test
    void testEmptyBearerTokenReturnsUnauthorizedResponse() throws Exception {
        when(mockRequest.getRequestURI()).thenReturn("/api/v1/orders");
        when(mockRequest.getHeader("Authorization")).thenReturn("Bearer ");

        filter.doFilterInternal(mockRequest, mockResponse, mockFilterChain);

        verify(mockResponse).setStatus(401);
        verify(mockFilterChain, never()).doFilter(mockRequest, mockResponse);
    }

    @Test
    void testDevTokenRejectedWhenDevTokensDisabled() throws Exception {
        ApiAuthenticationFilter productionFilter = new ApiAuthenticationFilter(mockVerifier, false);
        when(mockRequest.getRequestURI()).thenReturn("/api/v1/accounts/link");
        when(mockRequest.getHeader("Authorization")).thenReturn("Bearer dev-user-1000");
        when(mockVerifier.verify("dev-user-1000"))
                .thenThrow(new JwtVerifier.JwtVerificationException("Malformed token"));

        productionFilter.doFilterInternal(mockRequest, mockResponse, mockFilterChain);

        verify(mockResponse).setStatus(401);
        verify(mockFilterChain, never()).doFilter(mockRequest, mockResponse);
    }

    @Test
    void testNumericTokenRejectedWhenDevTokensDisabled() throws Exception {
        ApiAuthenticationFilter productionFilter = new ApiAuthenticationFilter(mockVerifier, false);
        when(mockRequest.getRequestURI()).thenReturn("/api/v1/accounts/link");
        when(mockRequest.getHeader("Authorization")).thenReturn("Bearer 1000");
        when(mockVerifier.verify("1000"))
                .thenThrow(new JwtVerifier.JwtVerificationException("Malformed token"));

        productionFilter.doFilterInternal(mockRequest, mockResponse, mockFilterChain);

        verify(mockResponse).setStatus(401);
        verify(mockFilterChain, never()).doFilter(mockRequest, mockResponse);
    }

    @Test
    void testDevTokenExtractsUserId() throws Exception {
        when(mockRequest.getRequestURI()).thenReturn("/api/v1/orders");
        when(mockRequest.getHeader("Authorization")).thenReturn("Bearer dev-account-42");

        filter.doFilterInternal(mockRequest, mockResponse, mockFilterChain);

        verify(mockRequest).setAttribute(AuthContext.USER_ID_ATTRIBUTE, 42L);
        verify(mockFilterChain).doFilter(mockRequest, mockResponse);
    }

    @Test
    void testInvalidDevTokenReturnsUnauthorizedResponse() throws Exception {
        when(mockRequest.getRequestURI()).thenReturn("/api/v1/orders");
        when(mockRequest.getHeader("Authorization")).thenReturn("Bearer dev-account-not-a-number");

        filter.doFilterInternal(mockRequest, mockResponse, mockFilterChain);

        verify(mockResponse).setStatus(401);
        verify(mockFilterChain, never()).doFilter(mockRequest, mockResponse);
    }

    @Test
    void testValidJwtTokenExtractsUserId() throws Exception {
        when(mockRequest.getRequestURI()).thenReturn("/api/v1/orders");
        when(mockRequest.getHeader("Authorization")).thenReturn("Bearer valid.jwt.token");
        when(mockVerifier.verify("valid.jwt.token")).thenReturn(new JwtVerifier.VerifiedToken(123L, null, null));

        filter.doFilterInternal(mockRequest, mockResponse, mockFilterChain);

        verify(mockRequest).setAttribute(AuthContext.USER_ID_ATTRIBUTE, 123L);
        verify(mockFilterChain).doFilter(mockRequest, mockResponse);
    }

    // ---- browser sessions: HttpOnly access_token cookie ----

    private void cookieRequest(String method, String token, String csrfHeader) {
        when(mockRequest.getRequestURI()).thenReturn("/api/v1/orders");
        when(mockRequest.getHeader("Authorization")).thenReturn(null);
        when(mockRequest.getMethod()).thenReturn(method);
        when(mockRequest.getHeader("X-Requested-With")).thenReturn(csrfHeader);
        when(mockRequest.getCookies()).thenReturn(new Cookie[] {
                new Cookie("theme", "dark"),
                new Cookie("access_token", token)});
    }

    @Test
    void testCookieTokenAuthenticatesASafeRequestWithoutTheCsrfHeader() throws Exception {
        cookieRequest("GET", "cookie.jwt.token", null);
        when(mockVerifier.verify("cookie.jwt.token")).thenReturn(new JwtVerifier.VerifiedToken(77L, null, null));

        filter.doFilterInternal(mockRequest, mockResponse, mockFilterChain);

        verify(mockRequest).setAttribute(AuthContext.USER_ID_ATTRIBUTE, 77L);
        verify(mockFilterChain).doFilter(mockRequest, mockResponse);
    }

    @Test
    void testCookieTokenAuthenticatesAStateChangingRequestThatCarriesTheCsrfHeader() throws Exception {
        cookieRequest("POST", "cookie.jwt.token", "XMLHttpRequest");
        when(mockVerifier.verify("cookie.jwt.token")).thenReturn(new JwtVerifier.VerifiedToken(77L, null, null));

        filter.doFilterInternal(mockRequest, mockResponse, mockFilterChain);

        verify(mockRequest).setAttribute(AuthContext.USER_ID_ATTRIBUTE, 77L);
        verify(mockFilterChain).doFilter(mockRequest, mockResponse);
    }

    @Test
    void testCookieTokenIsRefusedForAStateChangingRequestWithoutTheCsrfHeader() throws Exception {
        cookieRequest("DELETE", "cookie.jwt.token", null);
        when(mockVerifier.verify("cookie.jwt.token")).thenReturn(new JwtVerifier.VerifiedToken(77L, null, null));

        filter.doFilterInternal(mockRequest, mockResponse, mockFilterChain);

        verify(mockResponse).setStatus(401);
        verify(mockFilterChain, never()).doFilter(mockRequest, mockResponse);
        verify(mockVerifier, never()).verify("cookie.jwt.token");
    }

    @Test
    void testBearerHeaderNeedsNoCsrfHeader() throws Exception {
        when(mockRequest.getRequestURI()).thenReturn("/api/v1/orders");
        when(mockRequest.getMethod()).thenReturn("POST");
        when(mockRequest.getHeader("Authorization")).thenReturn("Bearer valid.jwt.token");
        when(mockVerifier.verify("valid.jwt.token")).thenReturn(new JwtVerifier.VerifiedToken(123L, null, null));

        filter.doFilterInternal(mockRequest, mockResponse, mockFilterChain);

        verify(mockFilterChain).doFilter(mockRequest, mockResponse);
    }

    @Test
    void testAMalformedAuthorizationHeaderIsNotRescuedByACookie() throws Exception {
        cookieRequest("GET", "cookie.jwt.token", "XMLHttpRequest");
        when(mockRequest.getHeader("Authorization")).thenReturn("Basic abc");
        when(mockVerifier.verify("cookie.jwt.token")).thenReturn(new JwtVerifier.VerifiedToken(77L, null, null));

        filter.doFilterInternal(mockRequest, mockResponse, mockFilterChain);

        verify(mockResponse).setStatus(401);
        verify(mockFilterChain, never()).doFilter(mockRequest, mockResponse);
    }

    @Test
    void testAnInvalidCookieTokenReturnsUnauthorizedResponse() throws Exception {
        cookieRequest("GET", "forged.jwt.token", null);
        when(mockVerifier.verify("forged.jwt.token"))
                .thenThrow(new JwtVerifier.JwtVerificationException("Bad signature"));

        filter.doFilterInternal(mockRequest, mockResponse, mockFilterChain);

        verify(mockResponse).setStatus(401);
        verify(mockFilterChain, never()).doFilter(mockRequest, mockResponse);
    }

    @Test
    void testCookiesWithoutTheAccessTokenCountAsMissingCredentials() throws Exception {
        when(mockRequest.getRequestURI()).thenReturn("/api/v1/orders");
        when(mockRequest.getHeader("Authorization")).thenReturn(null);
        when(mockRequest.getCookies()).thenReturn(new Cookie[] {new Cookie("theme", "dark")});

        filter.doFilterInternal(mockRequest, mockResponse, mockFilterChain);

        verify(mockResponse).setStatus(401);
        verify(mockFilterChain, never()).doFilter(mockRequest, mockResponse);
    }

    @Test
    void testJwtVerificationFailureReturnsUnauthorizedResponse() throws Exception {
        when(mockRequest.getRequestURI()).thenReturn("/api/v1/orders");
        when(mockRequest.getHeader("Authorization")).thenReturn("Bearer expired.jwt.token");
        when(mockVerifier.verify("expired.jwt.token"))
            .thenThrow(new JwtVerifier.JwtVerificationException("Token expired"));

        filter.doFilterInternal(mockRequest, mockResponse, mockFilterChain);
        
        verify(mockResponse).setStatus(401);
        verify(mockFilterChain, never()).doFilter(mockRequest, mockResponse);
    }
}
