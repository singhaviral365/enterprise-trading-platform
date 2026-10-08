package org.example.backend.strategy.service;

import org.example.backend.exceptions.AccountNotFoundException;
import org.example.backend.mapper.AccountMapper;
import org.example.backend.strategy.exceptions.StrategyAccessDeniedException;
import org.example.backend.strategy.exceptions.StrategyNotFoundException;
import org.example.backend.strategy.mapper.StrategyMapper;
import org.example.backend.strategy.model.Strategy;
import org.springframework.stereotype.Component;

/**
 * The two ownership questions every strategy route asks: does the verified token's user own this account, and does this
 * account own this strategy. Both are answered from the token's user and the path, never from a body.
 */
@Component
public class StrategyAccess {

    private final StrategyMapper strategies;
    private final AccountMapper accounts;

    public StrategyAccess(StrategyMapper strategies, AccountMapper accounts) {
        this.strategies = strategies;
        this.accounts = accounts;
    }

    /** Unknown account is {@code ACC-404}; an account the token's user does not own is {@code ACC-403}. */
    public void assertAccountAccess(long userId, long accountId) {
        int accountIdInt = Math.toIntExact(accountId);

        if (!accounts.accountExists(accountIdInt)) {
            throw new AccountNotFoundException(accountId);
        }

        Integer linkedUserId = accounts.selectAccountLinkedUserId(accountIdInt);
        if (linkedUserId == null || linkedUserId != Math.toIntExact(userId)) {
            throw new StrategyAccessDeniedException(accountId);
        }
    }

    /**
     * The strategy, if it belongs to an account the user owns. One that belongs to somebody else is reported as not found,
     * so ids in use are not revealed.
     */
    public Strategy requireOwned(long userId, long strategyId) {
        Strategy strategy = strategies.selectById(strategyId).orElseThrow(StrategyNotFoundException::new);

        Integer linkedUserId = accounts.selectAccountLinkedUserId(Math.toIntExact(strategy.accountId()));
        if (linkedUserId == null || linkedUserId != Math.toIntExact(userId)) {
            throw new StrategyNotFoundException();
        }
        return strategy;
    }
}
