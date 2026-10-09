package org.example.backend.strategy.controller;

import org.example.backend.controller.ApiExceptionHandler;
import org.example.backend.exceptions.AccountNotFoundException;
import org.example.backend.exceptions.InstrumentNotFoundException;
import org.example.backend.security.AuthContext;
import org.example.backend.strategy.StrategyFixtures;
import org.example.backend.strategy.dto.CreateStrategyRequest;
import org.example.backend.strategy.dto.StrategyResponse;
import org.example.backend.strategy.dto.StrategyRunResponse;
import org.example.backend.strategy.exceptions.StrategyAccessDeniedException;
import org.example.backend.strategy.exceptions.StrategyAlreadyReachedException;
import org.example.backend.strategy.exceptions.StrategyLimitExceededException;
import org.example.backend.strategy.exceptions.StrategyNotChangeableException;
import org.example.backend.strategy.exceptions.StrategyNotFoundException;
import org.example.backend.strategy.model.RunOutcome;
import org.example.backend.strategy.model.StrategyStatus;
import org.example.backend.strategy.service.StrategyService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class StrategyControllerTest {

    private static final String CREATE = """
            {"accountId":1001,"symbol":"AAPL","side":"BUY","quantity":50,"direction":"BELOW","triggerPrice":150,
             "maxOrderValue":10000,"maxPositionQty":200}""";

    private StrategyService strategies;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        strategies = mock(StrategyService.class);
        mockMvc = MockMvcBuilders
                .standaloneSetup(new StrategyController(strategies))
                .setControllerAdvice(new StrategyExceptionHandler(), new ApiExceptionHandler())
                .build();
    }

    private static StrategyResponse response(StrategyStatus status) {
        return StrategyResponse.from(StrategyFixtures.buyBelow(status));
    }

    @Test
    void creatingAStrategyAnswers201WithTheNewStrategy() throws Exception {
        when(strategies.create(org.mockito.ArgumentMatchers.eq(7L), any())).thenReturn(response(StrategyStatus.ACTIVE));

        mockMvc.perform(post("/api/v1/strategies").requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L)
                        .contentType("application/json").content(CREATE))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.strategyId").value(5001))
                .andExpect(jsonPath("$.symbol").value("AAPL"))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.direction").value("BELOW"))
                .andExpect(jsonPath("$.maxOrderValue").value(10000.0))
                .andExpect(jsonPath("$.armed").value(true));

        ArgumentCaptor<CreateStrategyRequest> request = ArgumentCaptor.forClass(CreateStrategyRequest.class);
        verify(strategies).create(org.mockito.ArgumentMatchers.eq(7L), request.capture());
        assertEquals(1001L, request.getValue().accountId());
        assertEquals(1, request.getValue().maxExecutionsOrDefault());
        assertEquals(3, request.getValue().maxFailuresOrDefault());
    }

    @Test
    void theLimitsAreOptionalBecauseTheServiceWorksThemOutWhenTheyAreLeftOut() throws Exception {
        when(strategies.create(org.mockito.ArgumentMatchers.eq(7L), any())).thenReturn(response(StrategyStatus.ACTIVE));

        for (String body : List.of(
                "{\"accountId\":1001,\"symbol\":\"AAPL\",\"side\":\"BUY\",\"quantity\":50,\"direction\":\"BELOW\",\"triggerPrice\":150}",
                "{\"accountId\":1001,\"symbol\":\"AAPL\",\"side\":\"BUY\",\"quantity\":50,\"direction\":\"BELOW\",\"triggerPrice\":150,\"maxPositionQty\":200}",
                "{\"accountId\":1001,\"symbol\":\"AAPL\",\"side\":\"BUY\",\"quantity\":50,\"direction\":\"BELOW\",\"triggerPrice\":150,\"maxOrderValue\":10000}")) {
            mockMvc.perform(post("/api/v1/strategies").requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L)
                            .contentType("application/json").content(body))
                    .andExpect(status().isCreated());
        }
    }

    @Test
    void badInputIsRefusedBeforeTheServiceIsAsked() throws Exception {
        for (String body : List.of(
                CREATE.replace("\"quantity\":50", "\"quantity\":0"),
                CREATE.replace("\"triggerPrice\":150", "\"triggerPrice\":-1"),
                CREATE.replace("\"side\":\"BUY\"", "\"side\":\"HOLD\""),
                CREATE.replace("\"direction\":\"BELOW\"", "\"direction\":\"SIDEWAYS\""),
                CREATE.replace("\"maxPositionQty\":200", "\"maxPositionQty\":0"),
                CREATE.replace("\"maxOrderValue\":10000", "\"maxOrderValue\":0"),
                CREATE.replace("\"maxPositionQty\":200", "\"maxPositionQty\":200,\"maxFailures\":11"),
                CREATE.replace("\"maxPositionQty\":200", "\"maxPositionQty\":200,\"maxExecutions\":0"),
                CREATE.replace("\"symbol\":\"AAPL\"", "\"symbol\":\"\""),
                CREATE.replace("\"maxPositionQty\":200",
                        "\"maxPositionQty\":200,\"validFrom\":\"2026-10-10T00:00:00Z\",\"validUntil\":\"2026-10-09T00:00:00Z\""))) {
            mockMvc.perform(post("/api/v1/strategies").requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L)
                            .contentType("application/json").content(body))
                    .andExpect(status().isUnprocessableEntity());
        }
        verifyNoInteractions(strategies);
    }

    @Test
    void anUnknownFieldIsNotAllowedToSneakInAnAccountOrAStatus() throws Exception {
        when(strategies.create(org.mockito.ArgumentMatchers.eq(7L), any())).thenReturn(response(StrategyStatus.ACTIVE));

        // The body is what the customer controls; the user is only ever the verified token's, and a status is never theirs to set.
        mockMvc.perform(post("/api/v1/strategies").requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L)
                        .contentType("application/json")
                        .content(CREATE.replace("\"maxPositionQty\":200", "\"maxPositionQty\":200,\"userId\":99,\"status\":\"EXECUTED\"")))
                .andExpect(status().isCreated());

        verify(strategies).create(org.mockito.ArgumentMatchers.eq(7L), any());
    }

    @Test
    void listingAnAccountsStrategies() throws Exception {
        when(strategies.list(7L, 1001L)).thenReturn(List.of(response(StrategyStatus.ACTIVE), response(StrategyStatus.DISABLED)));

        mockMvc.perform(get("/api/v1/accounts/1001/strategies").requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[1].status").value("DISABLED"));
    }

    @Test
    void readingSwitchingOffAndCancellingOneStrategy() throws Exception {
        when(strategies.get(7L, 5001L)).thenReturn(response(StrategyStatus.ACTIVE));
        when(strategies.setEnabled(7L, 5001L, false)).thenReturn(response(StrategyStatus.DISABLED));
        when(strategies.setEnabled(7L, 5001L, true)).thenReturn(response(StrategyStatus.ACTIVE));
        when(strategies.cancel(7L, 5001L)).thenReturn(response(StrategyStatus.CANCELLED));

        mockMvc.perform(get("/api/v1/strategies/5001").requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACTIVE"));
        mockMvc.perform(patch("/api/v1/strategies/5001").requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L)
                        .contentType("application/json").content("{\"enabled\":false}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DISABLED"));
        mockMvc.perform(patch("/api/v1/strategies/5001").requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L)
                        .contentType("application/json").content("{\"enabled\":true}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACTIVE"));
        mockMvc.perform(delete("/api/v1/strategies/5001").requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
    }

    @Test
    void thePatchBodyMustSayWhichWay() throws Exception {
        mockMvc.perform(patch("/api/v1/strategies/5001").requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L)
                        .contentType("application/json").content("{}"))
                .andExpect(status().isUnprocessableEntity());

        verifyNoInteractions(strategies);
    }

    @Test
    void theTrailIsReturnedNewestFirstAsTheServiceGaveIt() throws Exception {
        when(strategies.runs(7L, 5001L)).thenReturn(List.of(
                new StrategyRunResponse(2, 1, RunOutcome.ORDERED, new BigDecimal("149.80"), OffsetDateTime.parse("2026-10-07T10:00:00Z"),
                        77L, "Order placed", "FILLED", OffsetDateTime.parse("2026-10-07T10:00:01Z")),
                new StrategyRunResponse(1, 1, RunOutcome.BLOCKED_LIMIT, new BigDecimal("149.90"), null, null, "over the limit", null,
                        OffsetDateTime.parse("2026-10-07T09:59:00Z"))));

        mockMvc.perform(get("/api/v1/strategies/5001/runs").requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].outcome").value("ORDERED"))
                .andExpect(jsonPath("$[0].orderId").value(77))
                .andExpect(jsonPath("$[0].settledStatus").value("FILLED"))
                .andExpect(jsonPath("$[1].outcome").value("BLOCKED_LIMIT"));
    }

    @Test
    void theUserIsAlwaysTheVerifiedTokensAndAMissingOneIsUnauthorised() throws Exception {
        mockMvc.perform(get("/api/v1/strategies/5001"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("AUTH-401"));

        verifyNoInteractions(strategies);
    }

    @Test
    void errorsMapToTheirStatusesInTheErrorEnvelope() throws Exception {
        when(strategies.get(7L, 1L)).thenThrow(new StrategyNotFoundException());
        when(strategies.get(7L, 2L)).thenThrow(new StrategyNotChangeableException());
        when(strategies.list(7L, 3L)).thenThrow(new StrategyAccessDeniedException(3));
        when(strategies.list(7L, 4L)).thenThrow(new AccountNotFoundException(4));

        mockMvc.perform(get("/api/v1/strategies/1").requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.errorCode").value("STR-404"));
        mockMvc.perform(get("/api/v1/strategies/2").requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.errorCode").value("STR-409"));
        mockMvc.perform(get("/api/v1/accounts/3/strategies").requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.errorCode").value("ACC-403"));
        mockMvc.perform(get("/api/v1/accounts/4/strategies").requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.errorCode").value("ACC-404"));
    }

    @Test
    void creationErrorsMapToTheirStatuses() throws Exception {
        when(strategies.create(org.mockito.ArgumentMatchers.eq(7L), any()))
                .thenThrow(new StrategyAlreadyReachedException("AAPL"))
                .thenThrow(new StrategyLimitExceededException(1001, 20))
                .thenThrow(new InstrumentNotFoundException("AAPL"))
                .thenThrow(new IllegalArgumentException("Maximum order value cannot exceed 10000000"));

        String[][] expected = {{"409", "STR-409"}, {"422", "STR-422"}, {"404", "INS-404"}, {"422", "VAL-422"}};
        for (String[] pair : expected) {
            mockMvc.perform(post("/api/v1/strategies").requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L)
                            .contentType("application/json").content(CREATE))
                    .andExpect(status().is(Integer.parseInt(pair[0])))
                    .andExpect(jsonPath("$.errorCode").value(pair[1]));
        }
    }
}
