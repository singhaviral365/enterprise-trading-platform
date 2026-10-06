package org.example.backend.preferences.service;

import org.example.backend.entities.Account;
import org.example.backend.exceptions.AccountNotFoundException;
import org.example.backend.mapper.AccountMapper;
import org.example.backend.preferences.dto.PreferencesResponse;
import org.example.backend.preferences.dto.UpdatePreferencesRequest;
import org.example.backend.preferences.exceptions.PreferencesAccessDeniedException;
import org.example.backend.preferences.exceptions.UnsupportedCurrencyException;
import org.example.backend.preferences.mapper.PreferencesMapper;
import org.example.backend.preferences.model.CustomerPreferences;
import org.example.backend.preferences.model.PreferenceRow;
import org.example.backend.preferences.model.SupportedCurrencies;
import org.springframework.stereotype.Service;

/**
 * The customer-facing preferences use cases: read and replace the preferences of one account. Both start with the
 * same check: the user in the verified token must own the account in the path. Nothing in a request body can
 * widen that, because the account id is only ever the path's.
 *
 * <p>Reading never fails for want of a row. An account that has never saved anything gets the defaults, with its own
 * currency as the display currency, so the settings screen and every caller always have something to work with.
 */
@Service
public class PreferencesService {

    private final PreferencesMapper preferencesMapper;
    private final AccountMapper accountMapper;

    public PreferencesService(PreferencesMapper preferencesMapper, AccountMapper accountMapper) {
        this.preferencesMapper = preferencesMapper;
        this.accountMapper = accountMapper;
    }

    public PreferencesResponse get(long userId, long accountId) {
        Account account = ownedAccount(userId, accountId);

        return preferencesMapper.selectByAccountId(accountId)
                .map(row -> PreferencesResponse.of(accountId, row.toPreferences(), row.updatedAt()))
                .orElseGet(() -> PreferencesResponse.of(
                        accountId, CustomerPreferences.defaults(account.getCurrency()), null));
    }

    public PreferencesResponse update(long userId, long accountId, UpdatePreferencesRequest request) {
        ownedAccount(userId, accountId);

        if (!SupportedCurrencies.isSupported(request.preferredCurrency())) {
            throw new UnsupportedCurrencyException(request.preferredCurrency());
        }

        preferencesMapper.upsert(PreferenceRow.of(accountId, request.toPreferences()));

        // Read back so the answer carries the stored timestamp, and is exactly what the next GET returns.
        PreferenceRow stored = preferencesMapper.selectByAccountId(accountId)
                .orElseThrow(() -> new IllegalStateException("Preferences row missing after save"));
        return PreferencesResponse.of(accountId, stored.toPreferences(), stored.updatedAt());
    }

    /**
     * The verified token's user must own the addressed account. An unknown account is {@code ACC-404}; one that
     * belongs to someone else is {@code ACC-403}, as on the platform's other account routes.
     */
    private Account ownedAccount(long userId, long accountId) {
        Account account = accountMapper.selectAccountById(Math.toIntExact(accountId))
                .orElseThrow(() -> new AccountNotFoundException(accountId));

        Integer linkedUserId = accountMapper.selectAccountLinkedUserId(Math.toIntExact(accountId));
        if (linkedUserId == null || linkedUserId != Math.toIntExact(userId)) {
            throw new PreferencesAccessDeniedException(accountId);
        }
        return account;
    }
}
