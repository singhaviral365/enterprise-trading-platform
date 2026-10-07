package org.example.backend.notifications.email;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.Locale;
import java.util.Set;

/**
 * Makes "development only" something the application enforces, not something people remember. Present only when
 * email is switched on; it stops the application starting if that is set
 * <ul>
 *   <li>outside a development profile ({@code dev} or {@code local} must be active), or</li>
 *   <li>alongside a production profile, or</li>
 *   <li>with an SMTP host that is not this machine or the MailHog container.</li>
 * </ul>
 * A misconfigured production therefore fails loudly at start-up instead of quietly mailing customers through a test
 * server, or quietly mailing test data to a real one.
 */
@Component
@ConditionalOnProperty(name = "notifications.email.enabled", havingValue = "true")
public class DevOnlyEmailGuard {

    static final Set<String> DEV_PROFILES = Set.of("dev", "local");
    static final Set<String> FORBIDDEN_PROFILES = Set.of("prod", "production", "staging");
    static final Set<String> LOCAL_HOSTS = Set.of("localhost", "127.0.0.1", "::1", "mailhog");

    private final Environment environment;
    private final String smtpHost;

    public DevOnlyEmailGuard(
            Environment environment,
            @Value("${notifications.email.smtp.host:localhost}") String smtpHost) {
        this.environment = environment;
        this.smtpHost = smtpHost;
    }

    @PostConstruct
    void verify() {
        check(Arrays.asList(environment.getActiveProfiles()), smtpHost);
    }

    /** Throws {@link IllegalStateException} unless email may run with these profiles and this SMTP host. */
    static void check(Iterable<String> activeProfiles, String smtpHost) {
        boolean dev = false;
        for (String profile : activeProfiles) {
            String normalised = profile.toLowerCase(Locale.ROOT);
            if (FORBIDDEN_PROFILES.contains(normalised)) {
                throw new IllegalStateException(
                        "notifications.email.enabled=true is development-only, but the '" + profile
                                + "' profile is active. Remove the setting for this environment.");
            }
            dev |= DEV_PROFILES.contains(normalised);
        }
        if (!dev) {
            throw new IllegalStateException(
                    "notifications.email.enabled=true needs the 'dev' or 'local' profile to be active "
                            + "(SPRING_PROFILES_ACTIVE=dev). Email is development-only.");
        }
        if (smtpHost == null || !LOCAL_HOSTS.contains(smtpHost.trim().toLowerCase(Locale.ROOT))) {
            throw new IllegalStateException(
                    "notifications.email.smtp.host must be localhost or the mailhog container, not '" + smtpHost
                            + "'. Email is development-only and never goes to a real mail server.");
        }
    }
}
