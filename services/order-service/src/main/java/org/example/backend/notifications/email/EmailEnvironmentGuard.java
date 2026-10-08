package org.example.backend.notifications.email;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Makes the rules of each email mode something the application enforces, not something people remember. Present only when email is
 * switched on ({@code notifications.email.enabled=true}); it stops the application starting when the profile and the settings do
 * not agree. The mode is the Spring profile: <b>no profile means email is off</b>, {@code dev} (or {@code local}) is the local
 * catcher, {@code prod} (or {@code production}) is a real provider.
 *
 * <table>
 *   <caption>The rules</caption>
 *   <tr><th>Mode</th><th>Must hold</th></tr>
 *   <tr><td>dev</td><td>the SMTP host is this machine or the MailHog container; no production-like profile is active</td></tr>
 *   <tr><td>prod</td><td>the SMTP host is not local; TLS is {@code starttls} or {@code implicit}; a username and password are set; the
 *       {@code from} address is on one of {@code notifications.email.from-domains}; the {@code dev} profile is not also active</td></tr>
 *   <tr><td>staging</td><td>as prod, and {@code notifications.email.allowed-recipient-domains} is set so a staging deployment cannot
 *       mail real customers</td></tr>
 *   <tr><td>neither</td><td>email enabled with no mode profile: refused, with the profile to set</td></tr>
 * </table>
 *
 * A misconfiguration fails loudly at start-up instead of quietly mailing customers through a test server, or mailing test data to a
 * real one. Every message names the property to change and never prints a password.
 */
@Component
@ConditionalOnProperty(name = "notifications.email.enabled", havingValue = "true")
public class EmailEnvironmentGuard {

    static final Set<String> DEV_PROFILES = Set.of("dev", "local");
    static final Set<String> PROD_PROFILES = Set.of("prod", "production");
    static final Set<String> STAGING_PROFILES = Set.of("staging");
    static final Set<String> LOCAL_HOSTS = Set.of("localhost", "127.0.0.1", "::1", "mailhog", "host.docker.internal");
    static final Set<String> TLS_MODES = Set.of("starttls", "implicit");

    /** What the guard checks, read from the configuration (a plain value so the rules can be tested without Spring). */
    record Settings(String host, String tls, String username, String password, String from,
                    List<String> fromDomains, List<String> allowedRecipientDomains) {
    }

    private final Environment environment;
    private final Settings settings;

    public EmailEnvironmentGuard(
            Environment environment,
            @Value("${notifications.email.smtp.host:localhost}") String host,
            @Value("${notifications.email.smtp.tls:none}") String tls,
            @Value("${notifications.email.smtp.username:}") String username,
            @Value("${notifications.email.smtp.password:}") String password,
            @Value("${notifications.email.from:noreply@etpteamriya.com}") String from,
            @Value("${notifications.email.from-domains:}") String fromDomains,
            @Value("${notifications.email.allowed-recipient-domains:}") String allowedRecipientDomains) {
        this.environment = environment;
        this.settings = new Settings(host, tls, username, password, from, domains(fromDomains), domains(allowedRecipientDomains));
    }

    @PostConstruct
    void verify() {
        check(Arrays.asList(environment.getActiveProfiles()), settings);
    }

    /** A comma list of domains, lowercased and trimmed; blank items are dropped. */
    static List<String> domains(String raw) {
        List<String> result = new ArrayList<>();
        if (raw != null) {
            for (String item : raw.split(",")) {
                String domain = item.trim().toLowerCase(Locale.ROOT);
                if (!domain.isEmpty()) {
                    result.add(domain);
                }
            }
        }
        return result;
    }

    static String domainOf(String address) {
        if (address == null) {
            return "";
        }
        int at = address.lastIndexOf('@');
        return at < 0 ? "" : address.substring(at + 1).trim().toLowerCase(Locale.ROOT);
    }

    /** Throws {@link IllegalStateException} unless email may run with these profiles and these settings. */
    static void check(Iterable<String> activeProfiles, Settings settings) {
        boolean dev = false;
        boolean prod = false;
        boolean staging = false;
        for (String profile : activeProfiles) {
            String normalised = profile.toLowerCase(Locale.ROOT);
            dev |= DEV_PROFILES.contains(normalised);
            prod |= PROD_PROFILES.contains(normalised);
            staging |= STAGING_PROFILES.contains(normalised);
        }
        boolean real = prod || staging;

        if (dev && real) {
            throw new IllegalStateException(
                    "notifications.email.enabled=true with both a development profile (dev/local) and a production-like one "
                            + "(prod/production/staging): choose one. Dev mail goes to a local catcher, prod mail to a real provider.");
        }
        if (dev) {
            if (!isLocal(settings.host())) {
                throw new IllegalStateException(
                        "notifications.email.smtp.host must be localhost or the mailhog container in the dev profile, not '"
                                + settings.host() + "'. Dev email never goes to a real mail server.");
            }
            return;
        }
        if (!real) {
            throw new IllegalStateException(
                    "notifications.email.enabled=true needs the 'dev' profile (a local catcher) or the 'prod' profile (a real "
                            + "provider) to be active, for example SPRING_PROFILES_ACTIVE=dev. With no profile email stays off.");
        }

        List<String> problems = new ArrayList<>();
        if (isLocal(settings.host())) {
            problems.add("notifications.email.smtp.host must be a real provider, not the local host '" + settings.host() + "'");
        }
        if (!TLS_MODES.contains(settings.tls() == null ? "" : settings.tls().trim().toLowerCase(Locale.ROOT))) {
            problems.add("notifications.email.smtp.tls must be starttls or implicit (a provider connection without TLS is refused)");
        }
        if (blank(settings.username()) || blank(settings.password())) {
            problems.add("notifications.email.smtp.username and notifications.email.smtp.password are required "
                    + "(set NOTIFICATIONS_EMAIL_SMTP_USERNAME and NOTIFICATIONS_EMAIL_SMTP_PASSWORD)");
        }
        if (settings.fromDomains().isEmpty()) {
            problems.add("notifications.email.from-domains must list the domain(s) mail is sent from");
        } else if (!settings.fromDomains().contains(domainOf(settings.from()))) {
            problems.add("notifications.email.from (" + settings.from() + ") must be on one of notifications.email.from-domains ("
                    + String.join(", ", settings.fromDomains()) + ")");
        }
        if (staging && settings.allowedRecipientDomains().isEmpty()) {
            problems.add("notifications.email.allowed-recipient-domains is required in the staging profile, "
                    + "so a staging deployment cannot mail real customers");
        }
        if (!problems.isEmpty()) {
            throw new IllegalStateException("Email in the " + (staging ? "staging" : "prod")
                    + " profile is not configured safely: " + String.join("; ", problems) + ".");
        }
    }

    private static boolean isLocal(String host) {
        return host != null && LOCAL_HOSTS.contains(host.trim().toLowerCase(Locale.ROOT));
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
