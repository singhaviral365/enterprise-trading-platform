package org.example.backend.preferences.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.example.backend.preferences.model.PreferenceRow;

import java.math.BigDecimal;
import java.util.Optional;

@Mapper
public interface PreferencesMapper {

    /** The saved row for the account, or empty when the customer has never saved anything. */
    Optional<PreferenceRow> selectByAccountId(@Param("accountId") long accountId);

    /** Inserts the account's row or replaces it, in one statement, so two saves at once cannot both insert. */
    int upsert(@Param("row") PreferenceRow row);
}
