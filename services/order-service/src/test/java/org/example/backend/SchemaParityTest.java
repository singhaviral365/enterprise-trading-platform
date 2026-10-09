package org.example.backend;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * databases/PostgreSQL/trading/schema.sql is what a person runs to create trading_db from nothing; the order-service also runs its own
 * idempotent scripts (src/main/resources/*-schema.sql) at every start. If a developer adds a table or a column to the scripts and forgets the
 * file, a freshly created database would be missing it. This test fails the build when that happens.
 */
class SchemaParityTest {

    private static final Path RESOURCES = Path.of("src", "main", "resources");
    private static final Path FILE = Path.of("..", "..", "databases", "PostgreSQL", "trading", "schema.sql");
    private static final List<String> STARTUP_SCRIPTS = List.of(
            "schema.sql", "watchlist-schema.sql", "preferences-schema.sql", "notifications-schema.sql",
            "portfolio-schema.sql", "portfolio-performance-schema.sql", "strategy-schema.sql");

    private static final Pattern TABLE =
            Pattern.compile("CREATE TABLE(?: IF NOT EXISTS)?\\s+(\\w+)\\s*\\((.*?)\\n\\)\\s*;", Pattern.DOTALL | Pattern.CASE_INSENSITIVE);
    private static final Set<String> NOT_COLUMNS = Set.of("CONSTRAINT", "PRIMARY", "FOREIGN", "UNIQUE", "CHECK");

    @Test
    void theDatabaseScriptHasEveryTableAndColumnTheApplicationsOwnScriptsDefine() throws IOException {
        Path file = FILE;
        assumeTrue(Files.exists(file), file.toAbsolutePath() + " is not reachable from this working directory");
        Map<String, Set<String>> expected = new TreeMap<>();
        for (String script : STARTUP_SCRIPTS) {
            expected.putAll(tables(Files.readString(RESOURCES.resolve(script), StandardCharsets.UTF_8)));
        }
        Map<String, Set<String>> actual = tables(Files.readString(file, StandardCharsets.UTF_8));

        assertFalse(expected.isEmpty(), "no tables were found in the start-up scripts: has the layout changed?");
        for (Map.Entry<String, Set<String>> table : expected.entrySet()) {
            assertEquals(true, actual.containsKey(table.getKey()), "trading/schema.sql lacks the table " + table.getKey());
            Set<String> missing = new TreeSet<>(table.getValue());
            missing.removeAll(actual.get(table.getKey()));
            assertEquals(Set.of(), missing, "trading/schema.sql lacks these columns of " + table.getKey());
        }
    }

    private static Map<String, Set<String>> tables(String sql) {
        String text = sql.replace("\r\n", "\n").replaceAll("(?m)--.*$", "");
        Map<String, Set<String>> result = new TreeMap<>();
        for (Matcher m = TABLE.matcher(text); m.find(); ) {
            Set<String> columns = new TreeSet<>();
            for (String part : topLevelParts(m.group(2))) {
                String[] words = part.trim().split("\\s+");
                if (words.length > 0 && !words[0].isEmpty() && !NOT_COLUMNS.contains(words[0].toUpperCase(Locale.ROOT))) {
                    columns.add(words[0].toLowerCase(Locale.ROOT));
                }
            }
            result.put(m.group(1).toLowerCase(Locale.ROOT), columns);
        }
        return result;
    }

    /** Splits a CREATE TABLE body at the commas that are not inside parentheses. */
    private static List<String> topLevelParts(String body) {
        List<String> parts = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        int depth = 0;
        for (char c : body.toCharArray()) {
            if (c == '(') depth++;
            if (c == ')') depth--;
            if (c == ',' && depth == 0) {
                parts.add(current.toString());
                current.setLength(0);
            } else {
                current.append(c);
            }
        }
        parts.add(current.toString());
        return parts;
    }
}
