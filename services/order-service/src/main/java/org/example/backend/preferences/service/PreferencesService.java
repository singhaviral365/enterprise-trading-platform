package org.example.backend.preferences.service;

import org.example.backend.entities.Account;
import org.example.backend.exceptions.AccountNotFoundException;
import org.example.backend.mapper.AccountMapper;
import org.example.backend.preferences.dto.PreferencesResponse;
import org.example.backend.preferences.dto.UpdatePreferencesRequest;
import org.example.backend.preferences.exceptions.AccountCurrencyFixedException;
import org.example.backend.preferences.exceptions.PreferencesAccessDeniedException;
import org.example.backend.preferences.mapper.PreferencesMapper;
import org.example.backend.preferences.model.CustomerPreferences;
import org.example.backend.preferences.model.PreferenceRow;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The customer-facing preferences use cases: read and replace the preferences of one account. Both start with the
 * same check: the user in the verified token must own the account in the path. Nothing in a request body can
 * widen that, because the account id is only ever the path's.
 *
 * <p>Reading never fails for want of a row. An account that has never saved anything gets the defaults.
 *
 * <p><b>The currency is the account's, fixed when it was opened.</b> {@code preferredCurrency} is always read from
 * {@code account.currency}; a save may omit it or repeat it, and a different one is refused ({@code CUR-409}) without
 * changing anything. Market data is untouched: quotes stay in the currency their instrument is quoted in, and only an order
 * converts them to the account currency.
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
                .map(row -> PreferencesResponse.of(
                        accountId,
                        row.toPreferences().withPreferredCurrency(account.getCurrency()),
                        row.updatedAt()))
                .orElseGet(() -> PreferencesResponse.of(
                        accountId, CustomerPreferences.defaults(account.getCurrency()), null));
    }

    /** Saves the document. The currency stored with it is always the account's. */
    @Transactional
    public PreferencesResponse update(long userId, long accountId, UpdatePreferencesRequest request) {
        Account account = ownedAccount(userId, accountId);

        String currency = account.getCurrency().trim();
        if (request.preferredCurrency() != null && !request.preferredCurrency().equals(currency)) {
            throw new AccountCurrencyFixedException(accountId);
        }

        preferencesMapper.upsert(PreferenceRow.of(accountId, request.toPreferences(currency)));

        // Read back so the answer carries the stored timestamp, and is exactly what the next GET returns.
        PreferenceRow stored = preferencesMapper.selectByAccountId(accountId)
                .orElseThrow(() -> new IllegalStateException("Preferences row missing after save"));
        return PreferencesResponse.of(accountId, stored.toPreferences().withPreferredCurrency(currency), stored.updatedAt());
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
