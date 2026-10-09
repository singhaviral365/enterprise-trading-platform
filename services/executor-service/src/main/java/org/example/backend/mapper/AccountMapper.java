package org.example.backend.mapper;

import org.apache.ibatis.annotations.Param;
import org.example.backend.entities.Account;

import java.util.Optional;

public interface AccountMapper {

    Optional<Account> selectAccountById(
            @Param("accountId") int accountId);

    int updateAccountBalanceWithVersion(
            @Param("accountId") int accountId,
            @Param("balance") java.math.BigDecimal balance,
            @Param("version") long version);
}

