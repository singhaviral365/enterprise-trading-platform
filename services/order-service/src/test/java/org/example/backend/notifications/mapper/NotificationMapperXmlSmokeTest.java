package org.example.backend.notifications.mapper;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * No database here, so this guards what can be checked without one: every mapper method has a statement, the SQL that
 * makes the module safe is still in the statements, and the schema carries the constraints the module relies on.
 */
class NotificationMapperXmlSmokeTest {

    private static String resource(String path) throws IOException {
        try (var stream = Thread.currentThread().getContextClassLoader().getResourceAsStream(path)) {
            assertNotNull(stream, path);
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    @Test
    void everyMapperMethodHasAStatement() throws IOException {
        String xml = resource("mapper/NotificationMapper.xml");

        assertTrue(xml.contains("namespace=\"org.example.backend.notifications.mapper.NotificationMapper\""));
        for (var method : NotificationMapper.class.getDeclaredMethods()) {
            assertTrue(xml.contains("id=\"" + method.getName() + "\""), "no statement for " + method.getName());
        }
    }

    @Test
    void replayIsNoOpAtTheDatabaseAndEveryReadIsScopedToTheAccount() throws IOException {
        String xml = resource("mapper/NotificationMapper.xml");

        assertTrue(xml.contains("ON CONFLICT (event_key) DO NOTHING"));
        // Marking read and reading one entry are scoped to the account in the SQL, never by the id alone.
        int markRead = xml.indexOf("id=\"markRead\"");
        assertTrue(xml.substring(markRead, xml.indexOf("</update>", markRead)).contains("account_id = #{accountId}"));
        int entry = xml.indexOf("id=\"selectInboxEntry\"");
        assertTrue(xml.substring(entry, xml.indexOf("</select>", entry)).contains("account_id = #{accountId}"));
        assertTrue(xml.contains("FOR UPDATE OF d SKIP LOCKED"));
    }

    @Test
    void searchTextIsBoundNeverConcatenated() throws IOException {
        String xml = resource("mapper/NotificationMapper.xml");

        assertTrue(xml.contains("ILIKE #{pattern}"));
        assertFalse(xml.contains("${"), "a ${} substitution would put customer text straight into SQL");
    }

    @Test
    void theSchemaMakesTheEventKeyUniqueAndTracksEachChannelOnce() throws IOException {
        String sql = resource("notifications-schema.sql");

        assertTrue(sql.contains("CONSTRAINT uq_notification_event_key"));
        assertTrue(sql.contains("UNIQUE (event_key)"));
        assertTrue(sql.contains("UNIQUE (notification_id, channel)"));
        assertTrue(sql.contains("('QUEUED', 'SENT', 'FAILED', 'SKIPPED')"));
        assertTrue(sql.contains("ON DELETE CASCADE"));
    }

    /** The test resources have their own application.properties, so read the real ones from the source tree. */
    private static String mainResource(String name) throws IOException {
        return java.nio.file.Files.readString(java.nio.file.Path.of("src", "main", "resources", name));
    }

    @Test
    void theApplicationLoadsTheNotificationSchemaAtStartUp() throws IOException {
        assertTrue(mainResource("application.properties").contains("classpath:notifications-schema.sql"));
    }

    @Test
    void emailIsOffByDefaultAndOnlyTheDevProfileSwitchesItOn() throws IOException {
        assertTrue(mainResource("application.properties").contains("notifications.email.enabled=false"));
        assertTrue(mainResource("application-dev.properties").contains("notifications.email.enabled=true"));
        assertFalse(mainResource("application.properties").contains("notifications.email.enabled=true"));
    }
}
