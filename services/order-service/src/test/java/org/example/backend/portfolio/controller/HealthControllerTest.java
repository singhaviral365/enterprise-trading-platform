package org.example.backend.portfolio.controller;

import org.example.backend.portfolio.quote.QuoteCache;
import org.example.backend.portfolio.service.PortfolioHealth;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class HealthControllerTest {

    private final DataSource dataSource = mock(DataSource.class);
    private final Connection connection = mock(Connection.class);
    private final QuoteCache quotes = mock(QuoteCache.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-10-07T12:00:00Z"), ZoneOffset.UTC);

    private MockMvc health(boolean fauxnanceConfigured) throws SQLException {
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.isValid(2)).thenReturn(true);
        return MockMvcBuilders.standaloneSetup(new HealthController(new PortfolioHealth(dataSource, quotes, fauxnanceConfigured, clock))).build();
    }

    @Test
    void everythingUpIsOkAndReportsTheQuotaLeft() throws Exception {
        when(quotes.lastOutcome()).thenReturn(QuoteCache.Outcome.OK);
        when(quotes.remainingQuota()).thenReturn(1873);

        health(true).perform(get("/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ok"))
                .andExpect(jsonPath("$.dependencies[0].name").value("postgres"))
                .andExpect(jsonPath("$.dependencies[0].status").value("ok"))
                .andExpect(jsonPath("$.dependencies[1].name").value("fauxnance"))
                .andExpect(jsonPath("$.dependencies[1].status").value("ok"))
                .andExpect(jsonPath("$.dependencies[1].quotaRemaining").value(1873))
                .andExpect(jsonPath("$.asOf").exists());
    }

    @Test
    void aFailingDependencyDegradesTheStatusButTheAnswerIsStill200() throws Exception {
        when(quotes.lastOutcome()).thenReturn(QuoteCache.Outcome.FAILED);

        health(true).perform(get("/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("degraded"))
                .andExpect(jsonPath("$.dependencies[1].status").value("down"));
    }

    @Test
    void anExhaustedQuotaIsDegradedNotDown() throws Exception {
        when(quotes.lastOutcome()).thenReturn(QuoteCache.Outcome.QUOTA_EXHAUSTED);

        health(true).perform(get("/health"))
                .andExpect(jsonPath("$.status").value("degraded"))
                .andExpect(jsonPath("$.dependencies[1].status").value("degraded"));
    }

    @Test
    void aDatabaseThatCannotBeReachedIsDownAndStillA200() throws Exception {
        when(quotes.lastOutcome()).thenReturn(QuoteCache.Outcome.OK);
        when(dataSource.getConnection()).thenThrow(new SQLException("refused"));
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(
                new HealthController(new PortfolioHealth(dataSource, quotes, true, clock))).build();

        mockMvc.perform(get("/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("degraded"))
                .andExpect(jsonPath("$.dependencies[0].status").value("down"));
    }

    @Test
    void withoutAKeyFauxnanceIsDownAndNoQuotaIsAskedFor() throws Exception {
        health(false).perform(get("/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("degraded"))
                .andExpect(jsonPath("$.dependencies[1].status").value("down"))
                .andExpect(jsonPath("$.dependencies[1].quotaRemaining").value((Object) null));

        verify(quotes, never()).remainingQuota();
    }

    @Test
    void theHealthCheckNeverSpendsQuotaOnAQuoteCall() throws Exception {
        when(quotes.lastOutcome()).thenReturn(QuoteCache.Outcome.NEVER);

        health(true).perform(get("/health")).andExpect(status().isOk());

        verify(quotes, never()).lookup(org.mockito.ArgumentMatchers.anyCollection());
    }
}
