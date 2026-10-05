package org.example.backend.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.example.backend.dto.AccountResponse;
import org.example.backend.dto.BalanceResponse;
import org.example.backend.entities.Account;
import org.example.backend.enums.AccountStatus;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

@Mapper
public interface AccountMapper {

    int insertAccount(@Param("account") Account account);

    long nextAccountId();

    Integer selectAnyAdvisorId();

    boolean accountExists(
            @Param("accountId") int accountId);

    Integer selectAccountLinkedUserId(
            @Param("accountId") int accountId);

    long countAccountsByUserId(
            @Param("userId") int userId);

    boolean isAccountLinkedToUser(
            @Param("accountId") int accountId,
            @Param("userId") int userId);

    Optional<Account> selectAccountById(
            @Param("accountId") int accountId);

    Optional<Account> selectAccountByNumber(
            @Param("accountNumber") String accountNumber);

    List<Account> selectAccountsByUserId(
            @Param("userId") int userId);

    List<Account> selectAccountsByStatus(
            @Param("accountStatus") AccountStatus accountStatus);

    List<Account> selectAccountsByUserIdAndStatus(
            @Param("userId") int userId,
            @Param("accountStatus") AccountStatus accountStatus);

    int updateAccountStatus(
            @Param("accountId") int accountId,
            @Param("newStatus") AccountStatus newStatus);

    int updateAccountBalance(
            @Param("accountId") int accountId,
            @Param("newBalance") BigDecimal newBalance,
            @Param("newPurchasingPower") BigDecimal newPurchasingPower);

    /*
     * Story 5:
     * Optimistic locking.
     *
     * The UPDATE must use the version that was read from
     * the account row and increment the version atomically.
     */
    int updateAccountBalanceWithVersion(
            @Param("accountId") int accountId,
            @Param("newBalance") BigDecimal newBalance,
            @Param("expectedVersion") long expectedVersion);

    int updateSuspensionTimestamp(
            @Param("accountId") int accountId,
            @Param("suspendedAt") OffsetDateTime suspendedAt);

    int updateClosureTimestamp(
            @Param("accountId") int accountId,
            @Param("closedAt") OffsetDateTime closedAt);

    List<Account> selectAccountsByOpeningDateRange(
            @Param("fromDate") LocalDate fromDate,
            @Param("toDate") LocalDate toDate);

    long countAllAccounts();

    boolean accountNumberExists(
            @Param("accountNumber") String accountNumber);

    /*
     * Story 6:
     * Account details.
     */
    AccountResponse selectAccountResponseById(
            @Param("accountId") long accountId);

    /*
     * Story 6:
     * Account cash balance.
     */
    BalanceResponse selectBalanceResponseByAccountId(
            @Param("accountId") long accountId);
}