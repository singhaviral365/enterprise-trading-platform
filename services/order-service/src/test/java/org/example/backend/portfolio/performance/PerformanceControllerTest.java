package org.example.backend.portfolio.performance;

import org.example.backend.controller.ApiExceptionHandler;
import org.example.backend.portfolio.controller.PerformanceController;
import org.example.backend.portfolio.controller.PortfolioExceptionHandler;
import org.example.backend.portfolio.dto.NavPoint;
import org.example.backend.portfolio.dto.PerformanceResponse;
import org.example.backend.portfolio.exceptions.InvalidDateRangeException;
import org.example.backend.portfolio.exceptions.PerformanceDisabledException;
import org.example.backend.portfolio.exceptions.PortfolioAccessDeniedException;
import org.example.backend.security.AuthContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PerformanceControllerTest {

    private PerformanceService service;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        service = mock(PerformanceService.class);
        mockMvc = MockMvcBuilders.standaloneSetup(new PerformanceController(service))
                .setControllerAdvice(new PortfolioExceptionHandler(), new ApiExceptionHandler())
                .build();
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder as(long user, String path) {
        return get(path).requestAttr(AuthContext.USER_ID_ATTRIBUTE, user);
    }

    @Test
    void returnsTheHistoryAndTheCurve() throws Exception {
        PerformanceResponse response = new PerformanceResponse(7, "USD", false, LocalDate.of(2026, 9, 1), null,
                List.of(new NavPoint(LocalDate.of(2026, 9, 1), new BigDecimal("1000"), new BigDecimal("10000"), new BigDecimal("10000"),
                        BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, false)), null);
        when(service.curve(eq(1000L), eq(7L), any(), any(), any())).thenReturn(Optional.of(response));

        mockMvc.perform(as(1000L, "/api/v1/portfolio/7/performance"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.baseCurrency").value("USD"))
                .andExpect(jsonPath("$.points[0].nav").value(1000))
                .andExpect(jsonPath("$.benchmark").doesNotExist());
    }

    @Test
    void whileTheHistoryIsBeingBuiltItAnswers202Building() throws Exception {
        when(service.curve(eq(1000L), eq(7L), any(), any(), any())).thenReturn(Optional.empty());

        mockMvc.perform(as(1000L, "/api/v1/portfolio/7/performance"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("building"));
    }

    @Test
    void anotherCustomersAccountIs403() throws Exception {
        when(service.curve(eq(2000L), eq(7L), any(), any(), any())).thenThrow(new PortfolioAccessDeniedException(7));

        mockMvc.perform(as(2000L, "/api/v1/portfolio/7/performance"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("ACC-403"));
    }

    @Test
    void invalidInputIsVal422() throws Exception {
        when(service.curve(eq(1000L), eq(7L), any(), any(), any())).thenThrow(new InvalidDateRangeException("bad"));

        mockMvc.perform(as(1000L, "/api/v1/portfolio/7/performance").param("from", "2026-10-01").param("to", "2026-09-01"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errorCode").value("VAL-422"));
        mockMvc.perform(as(1000L, "/api/v1/portfolio/7/performance").param("from", "yesterday"))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void whenSwitchedOffItIsPrf503() throws Exception {
        when(service.curve(eq(1000L), eq(7L), any(), any(), any())).thenThrow(new PerformanceDisabledException());

        mockMvc.perform(as(1000L, "/api/v1/portfolio/7/performance"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.errorCode").value("PRF-503"));
    }

    @Test
    void aRequestWithoutATokenIsRefused() throws Exception {
        mockMvc.perform(get("/api/v1/portfolio/7/performance")).andExpect(status().isUnauthorized());
    }
}
