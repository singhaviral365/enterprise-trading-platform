package org.example.backend.preferences.model;

import java.math.BigDecimal;

/** What an account holds in its own currency: the amounts a currency change has to convert. */
public record AccountMoney(String currency, BigDecimal balance, BigDecimal purchasingPower, long version) {
}
