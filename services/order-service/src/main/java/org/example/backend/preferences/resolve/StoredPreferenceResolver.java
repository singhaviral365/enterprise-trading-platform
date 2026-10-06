package org.example.backend.preferences.resolve;

import org.example.backend.preferences.mapper.PreferencesMapper;
import org.example.backend.preferences.model.CustomerPreferences;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Component;

/**
 * Resolves from the {@code customer_preference} table: one primary-key read per call, no cache to go stale. Anything
 * short of a stored row, including a database error, answers {@link AlertPreference#DEFAULT} (see
 * {@link PreferenceResolver}). Only the account id is logged, never a preference value.
 */
@Component
public class StoredPreferenceResolver implements PreferenceResolver {

    private static final Logger logger = LoggerFactory.getLogger(StoredPreferenceResolver.class);

    private final PreferencesMapper preferencesMapper;

    public StoredPreferenceResolver(PreferencesMapper preferencesMapper) {
        this.preferencesMapper = preferencesMapper;
    }

    @Override
    public AlertPreference resolveAlerts(long accountId) {
        try {
            return preferencesMapper.selectByAccountId(accountId)
                    .map(row -> {
                        CustomerPreferences preferences = row.toPreferences();
                        return new AlertPreference(preferences.channels(), preferences.categories());
                    })
                    .orElse(AlertPreference.DEFAULT);
        } catch (DataAccessException ex) {
            logger.warn("Preferences unavailable for account {}; using the defaults", accountId, ex);
            return AlertPreference.DEFAULT;
        }
    }
}
