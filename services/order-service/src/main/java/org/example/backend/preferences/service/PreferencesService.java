package org.example.backend.preferences.service;

import org.example.backend.entities.Account;
import org.example.backend.exceptions.AccountNotFoundException;
import org.example.backend.exceptions.FxRateUnavailableException;
import org.example.backend.exceptions.OptimisticLockException;
import org.example.backend.fx.CurrencyConversionService;
import org.example.backend.fx.ExchangeRateUnavailableException;
import org.example.backend.mapper.AccountMapper;
import org.example.backend.preferences.dto.PreferencesResponse;
import org.example.backend.preferences.dto.UpdatePreferencesRequest;
import org.example.backend.preferences.exceptions.CurrencyChangeBlockedException;
import org.example.backend.preferences.exceptions.PreferencesAccessDeniedException;
import org.example.backend.preferences.exceptions.UnsupportedCurrencyException;
import org.example.backend.preferences.mapper.PreferencesMapper;
import org.example.backend.preferences.model.AccountMoney;
import org.example.backend.preferences.model.CustomerPreferences;
import org.example.backend.preferences.model.PreferenceRow;
import org.example.backend.preferences.model.SupportedCurrencies;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * The customer-facing preferences use cases: read and replace the preferences of one account. Both start with the
 * same check: the user in the verified token must own the account in the path. Nothing in a request body can
 * widen that, because the account id is only ever the path's.
 *
 * <p>Reading never fails for want of a row. An account that has never saved anything gets the defaults.
 *
 * <p><b>The currency setting is the account's real currency.</b> {@code preferredCurrency} always equals
 * {@code account.currency}; saving a different one converts the account (see {@link #changeAccountCurrency}). Market
 * data is not touched: quotes stay in the currency their instrument is quoted in, and only an order converts them to
 * the account currency, as before.
 */
@Service
public class PreferencesService {

    private static final Logger logger = LoggerFactory.getLogger(PreferencesService.class);
    private static final int MONEY_SCALE = 4;

    private final PreferencesMapper preferencesMapper;
    private final AccountMapper accountMapper;
    private final CurrencyConversionService currencyConversionService;

    public PreferencesService(
            PreferencesMapper preferencesMapper,
            AccountMapper accountMapper,
            CurrencyConversionService currencyConversionService) {

        this.preferencesMapper = preferencesMapper;
        this.accountMapper = accountMapper;
        this.currencyConversionService = currencyConversionService;
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

    /**
     * Saves the document and, when the currency differs from the account's, converts the account to it. The
     * conversion and the save are one transaction: either the account and its preferences both change, or neither.
     */
    @Transactional
    public PreferencesResponse update(long userId, long accountId, UpdatePreferencesRequest request) {
        ownedAccount(userId, accountId);

        String currency = request.preferredCurrency();
        if (!SupportedCurrencies.isSupported(currency)) {
            throw new UnsupportedCurrencyException(currency);
        }

        changeAccountCurrency(accountId, currency);
        preferencesMapper.upsert(PreferenceRow.of(accountId, request.toPreferences()));

        // Read back so the answer carries the stored timestamp, and is exactly what the next GET returns.
        PreferenceRow stored = preferencesMapper.selectByAccountId(accountId)
                .orElseThrow(() -> new IllegalStateException("Preferences row missing after save"));
        return PreferencesResponse.of(accountId, stored.toPreferences(), stored.updatedAt());
    }

    /**
     * Moves the account to {@code newCurrency}, if it is not already in it. Every amount the account keeps in its own
     * currency is multiplied by one exchange factor, taken once, so they stay consistent with each other:
     * the balance and purchasing power, every order's price and every holding's purchase price.
     *
     * <ul>
     *   <li>Refused ({@code ACC-409}) while any order is still NEW: it is waiting to be filled in the old currency.</li>
     *   <li>Refused ({@code FX-503}) when there is no exchange rate; nothing is changed.</li>
     *   <li>The account row is locked and its version bumped, so a fill running at the same moment waits, then
     *       fails its own optimistic-lock check and retries against the converted account.</li>
     *   <li>Each conversion uses the rate of that moment, so going EUR to USD and back does not return exactly the
     *       original amounts.</li>
     * </ul>
     */
    private void changeAccountCurrency(long accountId, String newCurrency) {
        AccountMoney money = preferencesMapper.selectAccountMoneyForUpdate(accountId)
                .orElseThrow(() -> new AccountNotFoundException(accountId));
        String oldCurrency = money.currency().trim();
        if (oldCurrency.equals(newCurrency)) {
            return;
        }

        long openOrders = preferencesMapper.countOpenOrders(accountId);
        if (openOrders > 0) {
            throw new CurrencyChangeBlockedException(accountId, openOrders);
        }

        BigDecimal factor;
        try {
            factor = currencyConversionService.convert(BigDecimal.ONE, oldCurrency, newCurrency);
        } catch (ExchangeRateUnavailableException ex) {
            throw new FxRateUnavailableException(oldCurrency, newCurrency);
        }

        int updated = preferencesMapper.updateAccountCurrency(
                accountId,
                newCurrency,
                scaled(money.balance(), factor),
                scaled(money.purchasingPower(), factor),
                money.version());
        if (updated == 0) {
            throw new OptimisticLockException();
        }
        int orders = preferencesMapper.convertOrderPrices(accountId, factor);
        int holdings = preferencesMapper.convertHoldingPrices(accountId, factor);

        logger.info("Account {} converted from {} to {} ({} orders, {} holdings)",
                accountId, oldCurrency, newCurrency, orders, holdings);
    }

    private static BigDecimal scaled(BigDecimal amount, BigDecimal factor) {
        return amount.multiply(factor).setScale(MONEY_SCALE, RoundingMode.HALF_UP);
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
