package org.example.backend;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * The login (auth_db.users) and the trading account (trading_db.account) are in different databases, so nothing in
 * the database stops one user having two different emails. The seeds are the only place to keep them equal: this test
 * reads the SQL files and fails if an account's email differs from its user's, for the same user_id.
 */
class SeedDataConsistencyTest {

    private static final Path MIGRATIONS = Path.of("..", "..", "databases", "PostgreSQL", "migrations");

    /** The people the seeds are written for, in user_id order starting at 1000. */
    private static final List<String> USERNAMES = List.of(
            "alice.trader", "yuvaraj.k", "aviral.singh", "riya.rajesh", "lalitha.prakash",
            "vishal.fmri", "aashifa.aalifa", "swetha.fmri", "agneya.fmri", "nanditha.fmri");

    /** (1000, 'alice.trader', 'alice.trader@example.com', '$2b$... */
    private static final Pattern AUTH_USER =
            Pattern.compile("\\(\\s*(\\d+),\\s*'([^']+)',\\s*'([^'@]+@[^']+)',\\s*'\\$2b");
    /** (1001, 'ACC000001001', 1000, 'alice.trader@example.com', '+353850000001', ... */
    private static final Pattern ACCOUNT =
            Pattern.compile("\\(\\s*(\\d+),\\s*'ACC\\d+',\\s*(\\d+),\\s*'([^'@]+@[^']+)',\\s*'([^']+)'");
    /** (1001, 1000, 'alice.trader@example.com', '+353850000001') in the fill-in UPDATE at the end of sample_data.sql */
    private static final Pattern ACCOUNT_FILL =
            Pattern.compile("\\(\\s*(\\d+),\\s*(\\d+),\\s*'([^'@]+@[^']+)',\\s*'(\\+[0-9]+)'\\)");

    @Test
    void everySeededAccountHoldsTheEmailOfTheUserItBelongsTo() throws IOException {
        Map<Integer, String> userEmails = authEmails("auth_setup.sql");
        Map<Integer, String> accountEmails = new TreeMap<>();
        for (Matcher m = ACCOUNT.matcher(read("sample_data.sql")); m.find(); ) {
            accountEmails.put(Integer.parseInt(m.group(2)), m.group(3));
        }

        assertFalse(accountEmails.isEmpty(), "no seeded accounts with an email were found: has the file layout changed?");
        assertEquals(userEmails, accountEmails, "account.email must equal users.email for the same user_id");
    }

    @Test
    void theUpdateScriptSeedsTheSameUsersAsTheAuthSetup() throws IOException {
        assertEquals(authEmails("auth_setup.sql"), authEmails("update_auth_db.sql"));
    }

    @Test
    void theUpdateScriptFillsAccountsWithTheSameContactDetailsAsTheSeed() throws IOException {
        Map<Integer, String> inserted = new TreeMap<>();
        for (Matcher m = ACCOUNT.matcher(read("sample_data.sql")); m.find(); ) {
            inserted.put(Integer.parseInt(m.group(1)), m.group(3) + " " + m.group(4));
        }
        Map<Integer, String> filled = new TreeMap<>();
        String sample = read("sample_data.sql");
        String fillSection = sample.substring(sample.indexOf("7. CONTACT DETAILS"));
        for (Matcher m = ACCOUNT_FILL.matcher(fillSection); m.find(); ) {
            assertEquals(Integer.parseInt(m.group(1)) - 1, Integer.parseInt(m.group(2)),
                    "account " + m.group(1) + " belongs to the user one id lower");
            filled.put(Integer.parseInt(m.group(1)), m.group(3) + " " + m.group(4));
        }

        assertFalse(filled.isEmpty());
        assertEquals(inserted, filled);
    }

    private static Map<Integer, String> authEmails(String file) throws IOException {
        Map<Integer, String> emails = new TreeMap<>();
        for (Matcher m = AUTH_USER.matcher(read(file)); m.find(); ) {
            int userId = Integer.parseInt(m.group(1));
            assertEquals(USERNAMES.get(userId - 1000), m.group(2), "username of user " + userId + " in " + file);
            emails.put(userId, m.group(3));
        }
        assertEquals(USERNAMES.size(), emails.size(), "every one of the ten users must be seeded in " + file);
        return emails;
    }

    private static String read(String file) throws IOException {
        Path path = MIGRATIONS.resolve(file);
        assumeTrue(Files.exists(path), path.toAbsolutePath() + " is not reachable from this working directory");
        return Files.readString(path, StandardCharsets.UTF_8).replace("\r\n", "\n");
    }
}
