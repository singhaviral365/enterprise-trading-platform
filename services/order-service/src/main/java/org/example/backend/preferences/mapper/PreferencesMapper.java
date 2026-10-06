package org.example.backend.preferences.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.example.backend.preferences.model.AccountMoney;
import org.example.backend.preferences.model.PreferenceRow;

import java.math.BigDecimal;
import java.util.Optional;

@Mapper
public interface PreferencesMapper {

    /** The saved row for the account, or empty when the customer has never saved anything. */
    Optional<PreferenceRow> selectByAccountId(@Param("accountId") long accountId);

    /** Inserts the account's row or replaces it, in one statement, so two saves at once cannot both insert. */
    int upsert(@Param("row") PreferenceRow row);

    // ---- Changing the account currency -----------------------------------------------------------------------------
    // Everything below runs inside one transaction (PreferencesService.update). Each amount the account holds in its
    // currency is multiplied by the same factor, so balances, order prices and holding prices stay consistent.

    /** The account's currency, balance, purchasing power and version, locked until the transaction ends. */
    Optional<AccountMoney> selectAccountMoneyForUpdate(@Param("accountId") long accountId);

    /** How many of the account's orders are still NEW (waiting to be filled). */
    long countOpenOrders(@Param("accountId") long accountId);

    /** Moves the account to the new currency with its converted amounts; 0 if the version changed underneath. */
    int updateAccountCurrency(
            @Param("accountId") long accountId,
            @Param("currency") String currency,
            @Param("balance") BigDecimal balance,
            @Param("purchasingPower") BigDecimal purchasingPower,
            @Param("expectedVersion") long expectedVersion);

    /** Multiplies every order price of the account by {@code factor} (to 4 decimal places, never below 0.0001). */
    int convertOrderPrices(@Param("accountId") long accountId, @Param("factor") BigDecimal factor);

    /** Multiplies every holding's purchase price of the account by {@code factor} (to 4 decimal places). */
    int convertHoldingPrices(@Param("accountId") long accountId, @Param("factor") BigDecimal factor);
}
