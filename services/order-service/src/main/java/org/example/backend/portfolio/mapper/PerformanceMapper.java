package org.example.backend.portfolio.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.example.backend.portfolio.performance.DailyCandle;
import org.example.backend.portfolio.performance.DayRealised;
import org.example.backend.portfolio.performance.NavRow;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * The performance track's door to the database. It writes <b>only</b> its own tables ({@code price_candle_daily} and
 * {@code portfolio_nav_daily}) and reads {@code account} and the ledger. {@code PortfolioIsReadOnlyTest} fails the build if the
 * XML writes anywhere else.
 */
@Mapper
public interface PerformanceMapper {

    /** Stores a day's candle, replacing what was there (a synthetic row is replaced when a real one is published). */
    int upsertCandle(
            @Param("symbol") String symbol,
            @Param("date") LocalDate date,
            @Param("close") BigDecimal close,
            @Param("adjclose") BigDecimal adjclose,
            @Param("currency") String currency,
            @Param("synthetic") boolean synthetic);

    List<DailyCandle> selectCandles(
            @Param("symbol") String symbol,
            @Param("from") LocalDate from,
            @Param("to") LocalDate to);

    LocalDate selectFirstCandleDate(@Param("symbol") String symbol);

    LocalDate selectLastCandleDate(@Param("symbol") String symbol);

    /** Writes one closed day's statement, replacing it if the day was already written (only the last few days are rewritten). */
    int upsertNav(
            @Param("accountId") long accountId,
            @Param("date") LocalDate date,
            @Param("cash") BigDecimal cash,
            @Param("holdingsValue") BigDecimal holdingsValue,
            @Param("totalValue") BigDecimal totalValue,
            @Param("costBasis") BigDecimal costBasis,
            @Param("unrealisedPnl") BigDecimal unrealisedPnl,
            @Param("realisedPnlCumulative") BigDecimal realisedPnlCumulative,
            @Param("netFlow") BigDecimal netFlow,
            @Param("dayPnl") BigDecimal dayPnl,
            @Param("units") BigDecimal units,
            @Param("nav") BigDecimal nav,
            @Param("estimated") boolean estimated);

    List<NavRow> selectNav(
            @Param("accountId") long accountId,
            @Param("from") LocalDate from,
            @Param("to") LocalDate to);

    LocalDate selectLastNavDate(@Param("accountId") long accountId);

    long countNav(@Param("accountId") long accountId);

    /** Accounts that can have a history: everything but closed accounts. */
    List<Long> selectBuildableAccountIds();

    /** Realised profit and loss booked per UTC day, from the ledger. */
    List<DayRealised> selectRealisedByDay(@Param("accountId") long accountId);
}
