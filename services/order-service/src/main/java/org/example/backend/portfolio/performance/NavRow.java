package org.example.backend.portfolio.performance;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * The statement of one closed day for one account, in the account currency: what is stored in {@code portfolio_nav_daily}.
 * Closed days are facts; live figures (as at now) are never stored.
 *
 * @param netFlow  money or securities put in or taken out that day; on the first day, the whole starting value
 * @param dayPnl   {@code V(d) - V(d-1) - F(d)}: trades swap cash for shares and cancel, so only prices move it
 * @param estimated any price used was synthetic, missing, filled forward over a gap, or an exchange rate was today's
 */
public record NavRow(
        LocalDate date,
        BigDecimal cash,
        BigDecimal holdingsValue,
        BigDecimal totalValue,
        BigDecimal costBasis,
        BigDecimal unrealisedPnl,
        BigDecimal realisedPnlCumulative,
        BigDecimal netFlow,
        BigDecimal dayPnl,
        BigDecimal units,
        BigDecimal nav,
        boolean estimated) {
}
