package org.example.backend.portfolio.ledger;

import org.example.backend.portfolio.mapper.PortfolioMapper;
import org.example.backend.portfolio.model.SymbolRealised;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * Realised profit and loss, accumulated: a sale is booked once, at the moment it is known, and what is booked never
 * changes. Nothing here looks at a price: realised profit and loss has nothing to do with today's.
 */
@Component
public class RealisedPnlLedger {

    private final PortfolioMapper mapper;

    public RealisedPnlLedger(PortfolioMapper mapper) {
        this.mapper = mapper;
    }

    /** @return true if this call booked the sale, false if it was already booked (a replay) */
    public boolean book(long accountId, String currency, AverageCostReplay.Sale sale) {
        return mapper.insertEntryIfNew(
                sale.orderId(),
                accountId,
                sale.tickerSymbol(),
                sale.quantity(),
                sale.fillPrice(),
                sale.averageCostAtSale(),
                sale.realisedPnl(),
                currency,
                sale.bookedAt()) == 1;
    }

    /** Lifetime, or bounded to booking times in {@code [from, to)}. */
    public BigDecimal total(long accountId, OffsetDateTime from, OffsetDateTime to) {
        BigDecimal total = mapper.sumRealised(accountId, from, to);
        return total == null ? BigDecimal.ZERO : total;
    }

    public List<SymbolRealised> bySymbol(long accountId, OffsetDateTime from, OffsetDateTime to) {
        return mapper.sumRealisedBySymbol(accountId, from, to);
    }
}
