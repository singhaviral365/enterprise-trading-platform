package org.example.backend.watchlist.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.example.backend.watchlist.model.Watchlist;
import org.example.backend.watchlist.model.WatchlistItem;

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
}
