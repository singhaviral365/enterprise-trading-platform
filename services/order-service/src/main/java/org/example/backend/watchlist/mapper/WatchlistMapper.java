package org.example.backend.watchlist.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.example.backend.watchlist.model.AlertDelivery;
import org.example.backend.watchlist.model.AlertDirection;
import org.example.backend.watchlist.model.AlertWatch;
import org.example.backend.watchlist.model.TriggeredAlert;
import org.example.backend.watchlist.model.Watchlist;
import org.example.backend.watchlist.model.WatchlistItem;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

@Mapper
public interface WatchlistMapper {

    long nextWatchlistId();

    /**
     * Inserts the watchlist only if the account holds fewer than {@code limit} watchlists.
     * The check and the insert are one statement, so two concurrent requests cannot both slip past it.
     *
     * @return 1 if inserted, 0 if the account is at its limit
     */
    int insertWatchlistIfUnderLimit(
            @Param("watchlist") Watchlist watchlist,
            @Param("limit") int limit);

    List<Watchlist> selectWatchlistsByAccountId(@Param("accountId") long accountId);

    Optional<Watchlist> selectWatchlistById(@Param("watchlistId") long watchlistId);

    Optional<Watchlist> selectWatchlistByAccountIdAndName(
            @Param("accountId") long accountId,
            @Param("name") String name);

    int updateWatchlistName(
            @Param("watchlistId") long watchlistId,
            @Param("name") String name);

    int deleteWatchlist(@Param("watchlistId") long watchlistId);

    List<WatchlistItem> selectWatchlistItems(@Param("watchlistId") long watchlistId);

    /** Every item of every watchlist the account owns, in one query (avoids one query per watchlist). */
    List<WatchlistItem> selectItemsByAccountId(@Param("accountId") long accountId);

    boolean watchlistItemExists(
            @Param("watchlistId") long watchlistId,
            @Param("tickerSymbol") String tickerSymbol);

    /**
     * Inserts the item only if the watchlist holds fewer than {@code limit} items.
     *
     * @return 1 if inserted, 0 if the watchlist is at its limit
     */
    int insertWatchlistItemIfUnderLimit(
            @Param("item") WatchlistItem item,
            @Param("limit") int limit);

    int deleteWatchlistItem(
            @Param("watchlistId") long watchlistId,
            @Param("tickerSymbol") String tickerSymbol);

    /**
     * Resolves a symbol, ignoring case, to the instrument's canonical ticker.
     * Empty if the instrument does not exist or is not tradable. Read-only reference data.
     */
    Optional<String> selectTradableTicker(@Param("tickerSymbol") String tickerSymbol);

    // ---- price alerts ----

    /**
     * Serialises alert changes for one account for the rest of the transaction, so the count in
     * {@link #setAlertIfUnderLimit} cannot be read by two requests at once and let both slip past the cap.
     */
    int lockAccountForAlerts(@Param("accountId") long accountId);

    /**
     * Arms an alert on the entry (replacing any existing one) unless that would take the account over {@code limit}
     * ACTIVE alerts. Replacing an alert that is already ACTIVE does not change the count, so it is always allowed.
     * The count and the write are one statement.
     *
     * @return 1 if set, 0 if the entry does not exist or the account is at its limit
     */
    int setAlertIfUnderLimit(
            @Param("accountId") long accountId,
            @Param("watchlistId") long watchlistId,
            @Param("tickerSymbol") String tickerSymbol,
            @Param("direction") AlertDirection direction,
            @Param("targetPrice") BigDecimal targetPrice,
            @Param("setAt") OffsetDateTime setAt,
            @Param("limit") int limit);

    /** @return 1 if the entry had an alert and it was removed, 0 otherwise */
    int clearAlert(@Param("watchlistId") long watchlistId, @Param("tickerSymbol") String tickerSymbol);

    /** Every ACTIVE alert, to fill the in-memory index at start-up. Walks the partial index on active alerts. */
    List<AlertWatch> selectActiveAlerts();

    /**
     * Turns the alert from ACTIVE to TRIGGERED, but only if it is still ACTIVE with this direction and target. That
     * guard is what makes firing happen once: a second quote, a second instance, or an alert the customer has just
     * replaced finds nothing to change.
     *
     * @return 1 if this call fired it, 0 if it was not (or no longer) the alert described
     */
    int markTriggered(
            @Param("watchlistId") long watchlistId,
            @Param("tickerSymbol") String tickerSymbol,
            @Param("direction") AlertDirection direction,
            @Param("targetPrice") BigDecimal targetPrice,
            @Param("triggerPrice") BigDecimal triggerPrice,
            @Param("triggeredAt") OffsetDateTime triggeredAt);

    Optional<TriggeredAlert> selectTriggeredAlert(
            @Param("watchlistId") long watchlistId,
            @Param("tickerSymbol") String tickerSymbol);

    /** Records how a hand-over to notifications went, and counts the attempt. */
    int recordAlertDelivery(
            @Param("watchlistId") long watchlistId,
            @Param("tickerSymbol") String tickerSymbol,
            @Param("delivery") AlertDelivery delivery);

    /** Fired alerts not yet handed over, with fewer than {@code maxAttempts} attempts, that fired before {@code firedBefore}. */
    List<TriggeredAlert> selectUndeliveredAlerts(
            @Param("maxAttempts") int maxAttempts,
            @Param("firedBefore") OffsetDateTime firedBefore,
            @Param("limit") int limit);
}
