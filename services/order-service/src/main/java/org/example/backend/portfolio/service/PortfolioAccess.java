package org.example.backend.portfolio.service;

import org.example.backend.exceptions.AccountNotFoundException;
import org.example.backend.mapper.AccountMapper;
import org.example.backend.portfolio.exceptions.PortfolioAccessDeniedException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * The first thing every portfolio route does. The token carries the authenticated <i>user</i> (account ids are never in
 * the JWT or in the auth database); {@code account.user_id} links that user to an account. That link is what is compared
 * with the account in the path, before anything is read.
 *
 * <p>An account that does not exist is {@code ACC-404}. An account that exists but belongs to someone else is
 * {@code ACC-403}, not 404, and it is logged: probing another customer's portfolio is an access-control failure.
 */
@Component
public class PortfolioAccess {

    private static final Logger LOGGER = LoggerFactory.getLogger(PortfolioAccess.class);

    private final AccountMapper accountMapper;

    public PortfolioAccess(AccountMapper accountMapper) {
        this.accountMapper = accountMapper;
    }

    public void require(long userId, long accountId) {
        int accountIdInt = Math.toIntExact(accountId);
        if (!accountMapper.accountExists(accountIdInt)) {
            throw new AccountNotFoundException(accountId);
        }
        Integer linkedUserId = accountMapper.selectAccountLinkedUserId(accountIdInt);
        if (linkedUserId == null || linkedUserId != Math.toIntExact(userId)) {
            LOGGER.warn("Portfolio access refused: user {} asked for account {}, which they do not own", userId, accountId);
            throw new PortfolioAccessDeniedException(accountId);
        }
    }
}
