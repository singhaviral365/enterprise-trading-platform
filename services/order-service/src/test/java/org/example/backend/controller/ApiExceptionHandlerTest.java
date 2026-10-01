package org.example.backend.controller;

import org.example.backend.dto.ErrorResponse;
import org.example.backend.exceptions.AccountNotActiveException;
import org.example.backend.exceptions.AccountNotFoundException;
import org.example.backend.exceptions.DuplicateOrderException;
import org.example.backend.exceptions.InsufficientFundsException;
import org.example.backend.exceptions.InsufficientHoldingsException;
import org.example.backend.exceptions.InstrumentNotFoundException;
import org.example.backend.exceptions.OptimisticLockException;
import org.example.backend.exceptions.OrderNotCancellableException;
import org.example.backend.exceptions.UnauthorisedException;
import org.example.backend.enums.AccountStatus;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.servlet.NoHandlerFoundException;

import java.math.BigDecimal;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * Unit tests for ApiExceptionHandler.
 * Verifies all domain exceptions map to correct HTTP status and error code.
 */
class ApiExceptionHandlerTest {

    private final ApiExceptionHandler handler = new ApiExceptionHandler();

    @Test
    void testAccountNotFoundMapsToACC404() {
        AccountNotFoundException ex = new AccountNotFoundException(1L);
        ResponseEntity<ErrorResponse> response = handler.handleDomainErrors(ex);
        
        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("ACC-404", response.getBody().errorCode());
    }

    @Test
    void testAccountNotActiveMapsToACC403() {
        AccountNotActiveException ex = new AccountNotActiveException(1L, AccountStatus.SUSPENDED);
        ResponseEntity<ErrorResponse> response = handler.handleDomainErrors(ex);
        
        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("ACC-403", response.getBody().errorCode());
    }

    @Test
    void testInstrumentNotFoundMapsToINS404() {
        InstrumentNotFoundException ex = new InstrumentNotFoundException("UNKNOWN");
        ResponseEntity<ErrorResponse> response = handler.handleDomainErrors(ex);
        
        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("INS-404", response.getBody().errorCode());
    }

    @Test
    void testInsufficientFundsMapsToORD400() {
        InsufficientFundsException ex = new InsufficientFundsException(
                1L,
                new BigDecimal("1000.00"),
                new BigDecimal("500.00"));
        ResponseEntity<ErrorResponse> response = handler.handleDomainErrors(ex);
        
        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("ORD-400", response.getBody().errorCode());
    }

    @Test
    void testDuplicateOrderMapsToORD409() {
        DuplicateOrderException ex = new DuplicateOrderException("key-123");
        ResponseEntity<ErrorResponse> response = handler.handleDomainErrors(ex);
        
        assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("ORD-409", response.getBody().errorCode());
    }

    @Test
    void testOptimisticLockMapsToORD409() {
        OptimisticLockException ex = new OptimisticLockException();
        ResponseEntity<ErrorResponse> response = handler.handleDomainErrors(ex);

        assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("ORD-409", response.getBody().errorCode());
    }

    @Test
    void testInsufficientHoldingsMapsToORD409() {
        InsufficientHoldingsException ex = new InsufficientHoldingsException(
                1L,
                "AAPL",
                100L,
                50L);
        ResponseEntity<ErrorResponse> response = handler.handleDomainErrors(ex);
        
        assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("ORD-409", response.getBody().errorCode());
    }

    @Test
    void testOrderNotCancellableMapsToORD409() {
        OrderNotCancellableException ex = new OrderNotCancellableException(UUID.randomUUID());
        ResponseEntity<ErrorResponse> response = handler.handleDomainErrors(ex);

        assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("ORD-409", response.getBody().errorCode());
    }

    @Test
    void testUnauthorizedMapsToAUTH401() {
        UnauthorisedException ex = new UnauthorisedException();
        ResponseEntity<ErrorResponse> response = handler.handleDomainErrors(ex);
        
        assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("AUTH-401", response.getBody().errorCode());
    }

    @Test
    void testValidationErrorMapsToVAL422() {
        Exception ex = new IllegalArgumentException("Invalid input");
        ResponseEntity<ErrorResponse> response = handler.handleValidationErrors(ex);
        
        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("VAL-422", response.getBody().errorCode());
    }

    @Test
    void testNoHandlerMapsToRes404() {
        NoHandlerFoundException ex = new NoHandlerFoundException("GET", "/accounts/1001/orders", null);
        ResponseEntity<ErrorResponse> response = handler.handleNotFound(ex);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("RES-404", response.getBody().errorCode());
        assertEquals("Resource not found", response.getBody().message());
    }

    @Test
    void testFallbackMapsToSrv500() {
        RuntimeException ex = new RuntimeException("boom");
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/accounts/1001/orders");
        ResponseEntity<ErrorResponse> response = handler.handleFallback(ex, request);

        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("SRV-500", response.getBody().errorCode());
        assertEquals("Internal server error", response.getBody().message());
    }
}
