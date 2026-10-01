package org.example.backend.entities;

import org.example.backend.enums.AccountStatus;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Objects;

public class Account {

    @Positive
    private final int accountId;

    @NotBlank
    @Size(max = 30)
    private final String accountNumber;

    @NotNull
    private final LocalDate openingDate;

    @NotNull
    @DecimalMin(value = "0.00")
    private BigDecimal balance;

    @NotNull
    @DecimalMin(value = "0.00")
    private BigDecimal purchasingPower;

    @NotNull
    private AccountStatus accountStatus;

    @NotBlank
    @Size(min = 3, max = 3)
    private final String currency;

    @Positive
    private final long version;

    private OffsetDateTime suspendedAt;
    private OffsetDateTime closedAt;

    @Positive
    private final int clientId;

    public Account(
            int accountId,
            String accountNumber,
            LocalDate openingDate,
            BigDecimal balance,
            BigDecimal purchasingPower,
            AccountStatus accountStatus,
            String currency,
            long version,
            OffsetDateTime suspendedAt,
            OffsetDateTime closedAt,
            int clientId) {

        if (accountId < 1) {
            throw new IllegalArgumentException(
                    "Account ID must be at least 1");
        }

        if (accountNumber == null || accountNumber.isBlank()) {
            throw new IllegalArgumentException(
                    "Account number is required");
        }

        if (accountNumber.length() > 30) {
            throw new IllegalArgumentException(
                    "Account number cannot exceed 30 characters");
        }

        Objects.requireNonNull(
                openingDate,
                "Opening date is required");

        validateMoney(balance, "Balance");
        validateMoney(purchasingPower, "Purchasing power");

        Objects.requireNonNull(
                accountStatus,
                "Account status is required");

        if (currency == null || !currency.matches("[A-Z]{3}")) {
            throw new IllegalArgumentException(
                    "Currency must be a three-letter uppercase code");
        }

        if (version < 1) {
            throw new IllegalArgumentException(
                    "Version must be at least 1");
        }

        if (clientId < 1) {
            throw new IllegalArgumentException(
                    "Client ID must be at least 1");
        }


        this.accountId = accountId;
        this.accountNumber = accountNumber;
        this.openingDate = openingDate;
        this.balance = normaliseMoney(balance);
        this.purchasingPower = normaliseMoney(purchasingPower);
        this.accountStatus = accountStatus;
        this.currency = currency;
        this.version = version;
        this.suspendedAt = suspendedAt;
        this.closedAt = closedAt;
        this.clientId = clientId;
    }

    public void credit(BigDecimal amount) {

        if (amount == null) {
            throw new IllegalArgumentException("Credit amount cannot be null");
        }

        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Credit amount must be positive");
        }

        balance = balance.add(amount);
    }

    public void debit(BigDecimal amount) {

        if (amount == null) {
            throw new IllegalArgumentException("Debit amount cannot be null");
        }

        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Debit amount must be positive");
        }

        if (!canAfford(amount)) {
            throw new IllegalArgumentException("Insufficient balance");
        }

        balance = balance.subtract(amount);
    }

    public boolean canAfford(BigDecimal amount) {

        if (amount == null) {
            return false;
        }

        if (amount.compareTo(BigDecimal.ZERO) < 0) {
            return false;
        }

        return balance.compareTo(amount) >= 0;
    }

    private static BigDecimal normaliseMoney(
            BigDecimal value) {

        return value.setScale(4);
    }

    private static void validateMoney(
            BigDecimal value,
            String fieldName) {

        Objects.requireNonNull(
                value,
                fieldName + " is required");

        if (value.compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException(
                    fieldName + " cannot be negative");
        }

        if (value.scale() > 4) {
            throw new IllegalArgumentException(
                fieldName
                    + " cannot have more than four decimal places");
        }
    }

    public int getAccountId() {
        return accountId;
    }

    public String getAccountNumber() {
        return accountNumber;
    }

    public LocalDate getOpeningDate() {
        return openingDate;
    }

    public BigDecimal getBalance() {
        return balance;
    }

    public BigDecimal getPurchasingPower() {
        return purchasingPower;
    }

    public AccountStatus getAccountStatus() {
        return accountStatus;
    }

    public String getCurrency() {
        return currency;
    }

    public long getVersion() {
        return version;
    }

    public OffsetDateTime getSuspendedAt() {
        return suspendedAt;
    }

    public OffsetDateTime getClosedAt() {
        return closedAt;
    }

    public int getClientId() {
        return clientId;
    }
}
