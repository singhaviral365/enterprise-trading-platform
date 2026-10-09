package org.example.backend.portfolio.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.example.backend.portfolio.model.FilledOrder;
import org.example.backend.portfolio.model.HoldingSnapshot;
import org.example.backend.portfolio.model.SymbolRealised;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * The portfolio module's only door to the database. It <b>reads</b> the trading tables ({@code orders}, {@code instrument})
 * and <b>writes only {@code realised_pnl_entry}</b>, the table the module owns. {@code PortfolioIsReadOnlyTest} fails the
 * build if the XML ever writes anywhere else.
 */
@Mapper
public interface PortfolioMapper {

    /**
     * Books one sale unless it is already booked. The order id is the key, and the decision is the database's, so the
     * consumer and the reconciler racing on the same sale cannot both insert.
     *
     * @return 1 if inserted, 0 if the sale was already booked
     */
    int insertEntryIfNew(
            @Param("orderId") long orderId,
            @Param("accountId") long accountId,
            @Param("tickerSymbol") String tickerSymbol,
            @Param("quantity") long quantity,
            @Param("fillPrice") BigDecimal fillPrice,
            @Param("averageCostAtSale") BigDecimal averageCostAtSale,
            @Param("realisedPnl") BigDecimal realisedPnl,
            @Param("currency") String currency,
            @Param("bookedAt") OffsetDateTime bookedAt);

    /** Realised profit and loss booked in {@code [from, to)}; either bound may be null for none. Zero when nothing is booked. */
    BigDecimal sumRealised(
            @Param("accountId") long accountId,
            @Param("from") OffsetDateTime from,
            @Param("to") OffsetDateTime to);

    List<SymbolRealised> sumRealisedBySymbol(
            @Param("accountId") long accountId,
            @Param("from") OffsetDateTime from,
            @Param("to") OffsetDateTime to);

    /** Filled sales of the account that have no ledger row yet. */
    long countUnbookedSales(@Param("accountId") long accountId);

    /** Accounts that have at least one filled sale with no ledger row. */
    List<Long> selectAccountsWithUnbookedSales();

    /** What the account holds now, per instrument, including positions sold down to zero (the executor keeps the row). */
    List<HoldingSnapshot> selectHoldings(@Param("accountId") long accountId);

    /** The account's filled orders, oldest first (by transaction date, then id): the order the executor applied them. */
    List<FilledOrder> selectFilledOrders(@Param("accountId") long accountId);
}
