package org.example.trade_executor.strategy;

import org.example.trade_executor.strategy.config.StrategySettings;
import org.example.trade_executor.strategy.mapper.StrategyMapper;
import org.example.trade_executor.strategy.model.TriggerDirection;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import java.math.BigDecimal;
import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class StrategySupportTest {

    private static StrategySettings settings(String profile, boolean enabled, long demoDelay) {
        MockEnvironment environment = new MockEnvironment();
        if (profile != null) {
            environment.setActiveProfiles(profile);
        }
        return new StrategySettings(environment, enabled, 180, 120, demoDelay);
    }

    @Test
    void theDemonstrationPauseOnlyWorksInTheDevelopmentProfiles() {
        assertEquals(5000, settings("dev", true, 5000).demoDelayMillis());
        assertEquals(5000, settings("local", true, 5000).demoDelayMillis());
        assertEquals(0, settings(null, true, 5000).demoDelayMillis());
        assertEquals(0, settings("prod", true, 5000).demoDelayMillis());
    }

    @Test
    void theDemonstrationPauseHasACeilingAndNeverGoesNegative() {
        assertEquals(60_000, settings("dev", true, 3_600_000).demoDelayMillis());
        assertEquals(0, settings("dev", true, -5).demoDelayMillis());
    }

    @Test
    void theKillSwitchIsWhatItIsSetTo() {
        assertTrue(settings(null, true, 0).enabled());
        assertFalse(settings(null, false, 0).enabled());
    }

    @Test
    void aClaimIsNeverGivenBackSoonerThanHalfAMinute() {
        assertEquals(Duration.ofSeconds(30), new StrategySettings(new MockEnvironment(), true, 180, 1, 0).claimTimeout());
        assertEquals(Duration.ofSeconds(120), settings(null, true, 0).claimTimeout());
    }

    @Test
    void theSweeperGivesBackStuckClaimsAndExpiresOverdueStrategies() {
        StrategyMapper mapper = mock(StrategyMapper.class);
        when(mapper.recoverStuck(120)).thenReturn(1);
        when(mapper.expireOverdue()).thenReturn(2);

        new StrategySweeper(mapper, settings(null, true, 0)).sweep();

        verify(mapper).recoverStuck(120);
        verify(mapper).expireOverdue();
    }

    @Test
    void aSweepThatFailsDoesNotThrowSoTheSchedulerKeepsRunning() {
        StrategyMapper mapper = mock(StrategyMapper.class);
        doThrow(new IllegalStateException("no table")).when(mapper).recoverStuck(anyLong());

        new StrategySweeper(mapper, settings(null, true, 0)).sweep();

        verify(mapper, never()).expireOverdue();
    }

    @Test
    void triggersFireAtOrPastTheLevelAndNotBefore() {
        assertTrue(TriggerDirection.BELOW.reachedBy(new BigDecimal("150"), new BigDecimal("150")));
        assertTrue(TriggerDirection.BELOW.reachedBy(new BigDecimal("149.99"), new BigDecimal("150")));
        assertFalse(TriggerDirection.BELOW.reachedBy(new BigDecimal("150.01"), new BigDecimal("150")));
        assertTrue(TriggerDirection.ABOVE.reachedBy(new BigDecimal("150"), new BigDecimal("150")));
        assertTrue(TriggerDirection.ABOVE.reachedBy(new BigDecimal("150.01"), new BigDecimal("150")));
        assertFalse(TriggerDirection.ABOVE.reachedBy(new BigDecimal("149.99"), new BigDecimal("150")));
    }
}
