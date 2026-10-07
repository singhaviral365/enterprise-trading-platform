package org.example.backend;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * update_trading_db.sql is meant to be pasted into pgAdmin as one file, so it carries a copy of the application's own
 * start-up scripts and the sample data instead of including them. A copy can drift: this fails when a source script
 * changes and the update script was not rebuilt, and when a psql-only command (which pgAdmin cannot run) sneaks in.
 */
class UpdateScriptSyncTest {

    private static final Path MIGRATIONS = Path.of("..", "..", "databases", "PostgreSQL", "migrations");
    private static final Path RESOURCES = Path.of("src", "main", "resources");

    @Test
    void theTradingUpdateScriptContainsEveryStartUpScriptAndTheSampleDataUnchanged() throws IOException {
        String update = read(MIGRATIONS.resolve("update_trading_db.sql"));
        List<Path> sources = List.of(
                RESOURCES.resolve("schema.sql"),
                RESOURCES.resolve("watchlist-schema.sql"),
                RESOURCES.resolve("preferences-schema.sql"),
                RESOURCES.resolve("notifications-schema.sql"),
                MIGRATIONS.resolve("sample_data.sql"));

        for (Path source : sources) {
            // The update script runs in one transaction of its own, so each file's BEGIN; and COMMIT; are left out.
            String body = read(source).replaceAll("(?m)^(BEGIN|COMMIT);\\n", "").strip();
            assertTrue(update.contains(body),
                    source.getFileName() + " has changed since update_trading_db.sql was built: rebuild it");
        }
    }

    @Test
    void theUpdateScriptsAreFreeOfPsqlCommandsSoPgAdminCanRunThem() throws IOException {
        for (String file : List.of("update_trading_db.sql", "update_auth_db.sql")) {
            String sql = read(MIGRATIONS.resolve(file));
            assertFalse(sql.matches("(?s).*(?m)^\\s*\\\\[a-zA-Z].*"), file + " contains a psql meta-command");
        }
    }

    private static String read(Path path) throws IOException {
        assumeTrue(Files.exists(path), path.toAbsolutePath() + " is not reachable from this working directory");
        return Files.readString(path, StandardCharsets.UTF_8).replace("\r\n", "\n");
    }
}
