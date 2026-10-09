package org.example.backend.security;

import jakarta.servlet.http.HttpServletRequest;
import org.example.backend.exceptions.UnauthorisedException;

public final class AuthContext {

    public static final String USER_ID_ATTRIBUTE = "authenticatedUserId";
    public static final String ACCOUNT_ID_ATTRIBUTE = "authenticatedAccountId";
    /** Set only when the request carries a verified strategy executor token: the strategy it was minted for. */
    public static final String STRATEGY_ID_ATTRIBUTE = "authenticatedStrategyId";

    private AuthContext() {
    }

    public static long requiredAccountId(HttpServletRequest request) {
        Object raw = request.getAttribute(ACCOUNT_ID_ATTRIBUTE);
        if (raw instanceof Long accountId) {
            return accountId;
        }
        throw new UnauthorisedException();
    }

    public static long requiredUserId(HttpServletRequest request) {
        Object raw = request.getAttribute(USER_ID_ATTRIBUTE);
        if (raw instanceof Long userId) {
            return userId;
        }

        Object legacyRaw = request.getAttribute(ACCOUNT_ID_ATTRIBUTE);
        if (legacyRaw instanceof Long userId) {
            return userId;
        }

        throw new UnauthorisedException();
    }

    /** The strategy a strategy executor's token was minted for, or empty for a customer's own token. */
    public static java.util.OptionalLong strategyId(HttpServletRequest request) {
        Object raw = request.getAttribute(STRATEGY_ID_ATTRIBUTE);
        return raw instanceof Long id ? java.util.OptionalLong.of(id) : java.util.OptionalLong.empty();
    }
}
