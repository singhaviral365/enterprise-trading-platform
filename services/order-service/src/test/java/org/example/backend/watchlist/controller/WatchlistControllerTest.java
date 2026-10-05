package org.example.backend.watchlist.controller;

import org.example.backend.controller.ApiExceptionHandler;
import org.example.backend.exceptions.AccountNotFoundException;
import org.example.backend.exceptions.InstrumentNotFoundException;
import org.example.backend.security.AuthContext;
import org.example.backend.watchlist.dto.WatchlistItemResponse;
import org.example.backend.watchlist.dto.WatchlistResponse;
import org.example.backend.watchlist.exceptions.WatchlistAccessDeniedException;
import org.example.backend.watchlist.exceptions.WatchlistItemAlreadyExistsException;
import org.example.backend.watchlist.exceptions.WatchlistItemLimitExceededException;
import org.example.backend.watchlist.exceptions.WatchlistLimitExceededException;
import org.example.backend.watchlist.exceptions.WatchlistNameConflictException;
import org.example.backend.watchlist.exceptions.WatchlistNotFoundException;
import org.example.backend.watchlist.price.PriceStatus;
import org.example.backend.watchlist.service.WatchlistService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class WatchlistControllerTest {

    private static final OffsetDateTime T0 = OffsetDateTime.parse("2026-01-01T00:00:00Z");

    private WatchlistService watchlistService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        watchlistService = mock(WatchlistService.class);
        mockMvc = MockMvcBuilders
                .standaloneSetup(new WatchlistController(watchlistService))
                .setControllerAdvice(new WatchlistExceptionHandler(), new ApiExceptionHandler())
                .build();
    }

    @Test
    void createWatchlistReturnsCreatedWatchlistForTheAuthenticatedUser() throws Exception {
        when(watchlistService.createWatchlist(7L, 1L, "Tech"))
                .thenReturn(sampleWatchlist("Tech", List.of()));

        mockMvc.perform(post("/api/v1/accounts/1/watchlists")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L)
                        .contentType("application/json")
                        .content("{\"name\":\"Tech\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.watchlistId").value(9))
                .andExpect(jsonPath("$.name").value("Tech"));
    }

    @Test
    void listWatchlistsReturnsItemsWithLivePrice() throws Exception {
        when(watchlistService.listWatchlists(7L, 1L))
                .thenReturn(List.of(sampleWatchlist("Core", List.of(
                        new WatchlistItemResponse("AAPL", T0, new BigDecimal("189.50"), T0, PriceStatus.LIVE),
                        new WatchlistItemResponse("MSFT", T0, null, null, PriceStatus.UNAVAILABLE)))));

        mockMvc.perform(get("/api/v1/accounts/1/watchlists")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Core"))
                .andExpect(jsonPath("$[0].items[0].tickerSymbol").value("AAPL"))
                .andExpect(jsonPath("$[0].items[0].price").value(189.50))
                .andExpect(jsonPath("$[0].items[0].priceStatus").value("LIVE"))
                .andExpect(jsonPath("$[0].items[1].price").doesNotExist())
                .andExpect(jsonPath("$[0].items[1].priceStatus").value("UNAVAILABLE"));
    }

    @Test
    void renameWatchlistReturnsUpdatedPayload() throws Exception {
        when(watchlistService.renameWatchlist(7L, 1L, 9L, "Growth"))
                .thenReturn(sampleWatchlist("Growth", List.of()));

        mockMvc.perform(patch("/api/v1/accounts/1/watchlists/9")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L)
                        .contentType("application/json")
                        .content("{\"name\":\"Growth\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Growth"));
    }

    @Test
    void deleteWatchlistReturnsOk() throws Exception {
        mockMvc.perform(delete("/api/v1/accounts/1/watchlists/9")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L))
                .andExpect(status().isOk());
    }

    @Test
    void addStockReturnsUpdatedWatchlist() throws Exception {
        when(watchlistService.addStock(7L, 1L, 9L, "AAPL"))
                .thenReturn(sampleWatchlist("Core", List.of(
                        new WatchlistItemResponse("AAPL", T0, new BigDecimal("189.50"), T0, PriceStatus.LIVE))));

        mockMvc.perform(post("/api/v1/accounts/1/watchlists/9/items")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L)
                        .contentType("application/json")
                        .content("{\"tickerSymbol\":\"AAPL\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].tickerSymbol").value("AAPL"))
                .andExpect(jsonPath("$.items[0].priceStatus").value("LIVE"));
    }

    @Test
    void removeStockReturnsUpdatedWatchlist() throws Exception {
        when(watchlistService.removeStock(7L, 1L, 9L, "AAPL"))
                .thenReturn(sampleWatchlist("Core", List.of()));

        mockMvc.perform(delete("/api/v1/accounts/1/watchlists/9/items/AAPL")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray())
                .andExpect(jsonPath("$.items").isEmpty());
    }

    @Test
    void routeWithoutAuthenticatedUserIsRejected() throws Exception {
        mockMvc.perform(get("/api/v1/accounts/1/watchlists"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("AUTH-401"));
    }

    @Test
    void validationErrorReturns422() throws Exception {
        mockMvc.perform(post("/api/v1/accounts/1/watchlists")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L)
                        .contentType("application/json")
                        .content("{\"name\":\"\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errorCode").value("VAL-422"));
    }

    @Test
    void accountNotReachableWithThisTokenIsAcc403() throws Exception {
        when(watchlistService.listWatchlists(7L, 2L)).thenThrow(new WatchlistAccessDeniedException(2L));

        mockMvc.perform(get("/api/v1/accounts/2/watchlists")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("ACC-403"));
    }

    @Test
    void unknownAccountIsAcc404() throws Exception {
        when(watchlistService.listWatchlists(7L, 2L)).thenThrow(new AccountNotFoundException(2L));

        mockMvc.perform(get("/api/v1/accounts/2/watchlists")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("ACC-404"));
    }

    @Test
    void missingWatchlistIs404() throws Exception {
        doThrow(new WatchlistNotFoundException(9L))
                .when(watchlistService)
                .renameWatchlist(anyLong(), anyLong(), eq(9L), eq("Growth"));

        mockMvc.perform(patch("/api/v1/accounts/1/watchlists/9")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L)
                        .contentType("application/json")
                        .content("{\"name\":\"Growth\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("WTL-404"));
    }

    @Test
    void duplicateNameIs409() throws Exception {
        when(watchlistService.createWatchlist(7L, 1L, "Tech"))
                .thenThrow(new WatchlistNameConflictException(1L, "Tech"));

        mockMvc.perform(post("/api/v1/accounts/1/watchlists")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L)
                        .contentType("application/json")
                        .content("{\"name\":\"Tech\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("WTL-409"));
    }

    @Test
    void duplicateItemIs409() throws Exception {
        when(watchlistService.addStock(7L, 1L, 9L, "AAPL"))
                .thenThrow(new WatchlistItemAlreadyExistsException(9L, "AAPL"));

        mockMvc.perform(post("/api/v1/accounts/1/watchlists/9/items")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L)
                        .contentType("application/json")
                        .content("{\"tickerSymbol\":\"AAPL\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("WLI-409"));
    }

    @Test
    void unknownInstrumentIs404() throws Exception {
        when(watchlistService.addStock(7L, 1L, 9L, "NOPE"))
                .thenThrow(new InstrumentNotFoundException("NOPE"));

        mockMvc.perform(post("/api/v1/accounts/1/watchlists/9/items")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L)
                        .contentType("application/json")
                        .content("{\"tickerSymbol\":\"NOPE\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("INS-404"));
    }

    @Test
    void watchlistCapReachedIs422() throws Exception {
        when(watchlistService.createWatchlist(7L, 1L, "Eleventh"))
                .thenThrow(new WatchlistLimitExceededException(1L, 10));

        mockMvc.perform(post("/api/v1/accounts/1/watchlists")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L)
                        .contentType("application/json")
                        .content("{\"name\":\"Eleventh\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errorCode").value("WTL-422"));
    }

    @Test
    void itemCapReachedIs422() throws Exception {
        when(watchlistService.addStock(7L, 1L, 9L, "AAPL"))
                .thenThrow(new WatchlistItemLimitExceededException(9L, 50));

        mockMvc.perform(post("/api/v1/accounts/1/watchlists/9/items")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L)
                        .contentType("application/json")
                        .content("{\"tickerSymbol\":\"AAPL\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errorCode").value("WLI-422"));
    }

    private static WatchlistResponse sampleWatchlist(String name, List<WatchlistItemResponse> items) {
        return new WatchlistResponse(9L, 1L, name, T0, T0, items);
    }
}
