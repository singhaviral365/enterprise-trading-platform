package org.example.backend.security;

import jakarta.servlet.FilterChain;
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
        when(mockVerifier.verifyAndExtractUserId("dev-user-1000"))
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
        when(mockVerifier.verifyAndExtractUserId("1000"))
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
        when(mockVerifier.verifyAndExtractUserId("valid.jwt.token")).thenReturn(123L);

        filter.doFilterInternal(mockRequest, mockResponse, mockFilterChain);

        verify(mockRequest).setAttribute(AuthContext.USER_ID_ATTRIBUTE, 123L);
        verify(mockFilterChain).doFilter(mockRequest, mockResponse);
    }

    @Test
    void testJwtVerificationFailureReturnsUnauthorizedResponse() throws Exception {
        when(mockRequest.getRequestURI()).thenReturn("/api/v1/orders");
        when(mockRequest.getHeader("Authorization")).thenReturn("Bearer expired.jwt.token");
        when(mockVerifier.verifyAndExtractUserId("expired.jwt.token"))
            .thenThrow(new JwtVerifier.JwtVerificationException("Token expired"));

        filter.doFilterInternal(mockRequest, mockResponse, mockFilterChain);
        
        verify(mockResponse).setStatus(401);
        verify(mockFilterChain, never()).doFilter(mockRequest, mockResponse);
    }
}
