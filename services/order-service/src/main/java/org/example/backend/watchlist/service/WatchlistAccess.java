package org.example.backend.watchlist.service;

import org.example.backend.exceptions.AccountNotFoundException;
import org.example.backend.mapper.AccountMapper;
import org.example.backend.watchlist.exceptions.WatchlistAccessDeniedException;
import org.example.backend.watchlist.exceptions.WatchlistNotFoundException;
import org.example.backend.watchlist.mapper.WatchlistMapper;
import org.example.backend.watchlist.model.Watchlist;
import org.springframework.stereotype.Component;

/**
 * The two ownership questions every watchlist route asks, in one place for the routes added after the original ones:
 * does the verified token's user own this account, and does this account own this watchlist. Both are answered from the
 * token's user and the path, never from anything in a request body.
 */
@Component
public class WatchlistAccess {

    private final WatchlistMapper watchlistMapper;
    private final AccountMapper accountMapper;

    public WatchlistAccess(WatchlistMapper watchlistMapper, AccountMapper accountMapper) {
        this.watchlistMapper = watchlistMapper;
        this.accountMapper = accountMapper;
    }

    /** Unknown account is {@code ACC-404}; an account the token's user does not own is {@code ACC-403}. */
    public void assertAccountAccess(long userId, long accountId) {
        int accountIdInt = Math.toIntExact(accountId);

        if (!accountMapper.accountExists(accountIdInt)) {
            throw new AccountNotFoundException(accountId);
        }

        Integer linkedUserId = accountMapper.selectAccountLinkedUserId(accountIdInt);
        if (linkedUserId == null || linkedUserId != Math.toIntExact(userId)) {
            throw new WatchlistAccessDeniedException(accountId);
        }
    }

    /** A watchlist owned by another account is reported as not found, so ids in use are not revealed. */
    public Watchlist requireWatchlistForAccount(long accountId, long watchlistId) {
        Watchlist watchlist = watchlistMapper.selectWatchlistById(watchlistId)
                .orElseThrow(() -> new WatchlistNotFoundException(watchlistId));

        if (watchlist.getAccountId() != accountId) {
            throw new WatchlistNotFoundException(watchlistId);
        }

        return watchlist;
    }
}
