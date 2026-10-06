package org.example.backend.preferences.model;

/** How the application writes a date. The stored name is the contract value; the browser turns it into a pattern. */
public enum DateFormatOption {
    /** 06/10/2026 */
    DD_MM_YYYY,
    /** 10/06/2026 */
    MM_DD_YYYY,
    /** 06-October-2026 */
    DD_MONTH_YYYY,
    /** 06-Oct-2026 */
    DD_MON_YYYY,
    /** 2026-10-06 */
    YYYY_MM_DD,
    /** Oct 6, 2026 (what the application showed before this was configurable) */
    MON_DD_YYYY
}
