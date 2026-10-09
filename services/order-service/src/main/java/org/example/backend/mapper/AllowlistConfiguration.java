package org.example.backend.mapper;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * Allowlist Configuration for MyBatis Mapper Dynamic SQL
 *
 * PURPOSE:
 * This class maintains allowlists for column names and sort directions that
 * CANNOT be bound as JDBC parameters. These are checked before use to prevent
 * SQL injection via dynamic columns and sort orders.
 *
 * SECURITY REQUIREMENT (from story):
 * "If a column name or sort direction genuinely cannot be a bind parameter,
 *  check it against a fixed list of permitted names first and declare it in
 *  the manifest allowlist with a comment saying what does that checking."
 *
 * RATIONALE:
 * - ORDER BY, GROUP BY, and SELECT list items cannot use JDBC bind parameters
 * - Column names and aliases must be part of SQL text, not parameters
 * - Sort directions (ASC, DESC) must be part of SQL text
 * - Therefore, these must be validated against a whitelist before use
 *
 * INJECTION PREVENTION:
 * - Invalid column names are rejected immediately
 * - Invalid sort directions are rejected immediately
 * - All other values remain as JDBC bind parameters
 */
public class AllowlistConfiguration {

    // ========================================================
    // ALLOWED COLUMN NAMES
    // ========================================================
    // Allowlist for column names that can appear in ORDER BY or GROUP BY.
    // Only columns that exist in the schema are permitted.
    // This checking prevents: " ORDER BY account_id; DROP TABLE account;--"
    // ========================================================

    public static final Set<String> ALLOWED_ACCOUNT_COLUMNS = Collections.unmodifiableSet(
            new HashSet<String>() {{
                add("account_id");
                add("account_number");
                add("opening_date");
                add("balance");
                add("purchasing_power");
                add("account_status");
                add("currency");
                add("version");
                add("suspended_at");
                add("closed_at");
                add("user_id");
            }}
    );

    public static final Set<String> ALLOWED_ORDER_COLUMNS = Collections.unmodifiableSet(
            new HashSet<String>() {{
                add("order_id");
                add("idempotency_key");
                add("order_status");
                add("received_at");
                add("order_type");
                add("price");
                add("quantity");
                add("transaction_date");
                add("account_id");
                add("instrument_id");
            }}
    );

    public static final Set<String> ALLOWED_HOLDING_COLUMNS = Collections.unmodifiableSet(
            new HashSet<String>() {{
                add("holding_id");
                add("quantity");
                add("purchase_price");
                add("account_id");
                add("instrument_id");
            }}
    );

    public static final Set<String> ALLOWED_INSTRUMENT_COLUMNS = Collections.unmodifiableSet(
            new HashSet<String>() {{
                add("instrument_id");
                add("instrument_ticker");
                add("instrument_name");
                add("asset_class");
                add("instrument_status");
            }}
    );

    // ========================================================
    // ALLOWED SORT DIRECTIONS
    // ========================================================
    // Allowlist for sort directions in ORDER BY clauses.
    // Only ASC (ascending) and DESC (descending) are permitted.
    // This checking prevents: " ORDER BY account_id; UPDATE account SET..."
    // ========================================================

    public static final Set<String> ALLOWED_SORT_DIRECTIONS = Collections.unmodifiableSet(
            new HashSet<String>() {{
                add("ASC");
                add("DESC");
                add("asc");
                add("desc");
            }}
    );

    // ========================================================
    // VALIDATION METHODS
    // ========================================================

    /**
     * Validate that a column name is in the allowed list.
     * Throws an exception if the column is not allowed.
     *
     * @param columnName the column name to validate
     * @param allowedColumns the set of allowed column names
     * @throws IllegalArgumentException if column is not in allowlist
     */
    public static void validateColumnName(String columnName, Set<String> allowedColumns) {
        if (columnName == null || columnName.isBlank()) {
            throw new IllegalArgumentException("Column name cannot be null or blank");
        }

        if (!allowedColumns.contains(columnName.toLowerCase())) {
            throw new IllegalArgumentException(
                    String.format(
                            "Column '%s' is not in the allowlist. Permitted columns: %s",
                            columnName,
                            allowedColumns
                    )
            );
        }
    }

    /**
     * Validate that a sort direction is in the allowed list.
     * Throws an exception if the direction is not allowed.
     *
     * @param sortDirection the sort direction to validate (ASC or DESC)
     * @throws IllegalArgumentException if direction is not in allowlist
     */
    public static void validateSortDirection(String sortDirection) {
        if (sortDirection == null || sortDirection.isBlank()) {
            throw new IllegalArgumentException("Sort direction cannot be null or blank");
        }

        if (!ALLOWED_SORT_DIRECTIONS.contains(sortDirection)) {
            throw new IllegalArgumentException(
                    String.format(
                            "Sort direction '%s' is not in the allowlist. Use ASC or DESC.",
                            sortDirection
                    )
            );
        }
    }

    /**
     * Validate and sanitize a column name for use in ORDER BY.
     * Throws an exception if the column is not allowed.
     *
     * @param columnName the column name to validate
     * @param allowedColumns the set of allowed columns for this entity
     * @return the validated column name (lowercase for consistency)
     * @throws IllegalArgumentException if column is not in allowlist
     */
    public static String sanitizeColumnName(String columnName, Set<String> allowedColumns) {
        validateColumnName(columnName, allowedColumns);
        return columnName.toLowerCase();
    }

    /**
     * Validate and sanitize a sort direction.
     * Throws an exception if the direction is not allowed.
     *
     * @param sortDirection the sort direction (ASC or DESC)
     * @return the validated sort direction (uppercase for consistency)
     * @throws IllegalArgumentException if direction is not in allowlist
     */
    public static String sanitizeSortDirection(String sortDirection) {
        validateSortDirection(sortDirection);
        return sortDirection.toUpperCase();
    }

    /**
     * Create a safe ORDER BY clause.
     * Both column name and sort direction are validated.
     *
     * @param columnName the column to sort by
     * @param sortDirection ASC or DESC
     * @param allowedColumns the set of allowed columns
     * @return a safe ORDER BY clause (e.g., "ORDER BY account_id ASC")
     * @throws IllegalArgumentException if column or direction is invalid
     */
    public static String createSafeOrderByClause(
            String columnName,
            String sortDirection,
            Set<String> allowedColumns) {

        String safeColumn = sanitizeColumnName(columnName, allowedColumns);
        String safeDirection = sanitizeSortDirection(sortDirection);

        return String.format("ORDER BY %s %s", safeColumn, safeDirection);
    }
}
