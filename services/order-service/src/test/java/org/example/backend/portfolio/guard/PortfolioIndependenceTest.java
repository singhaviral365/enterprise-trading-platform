package org.example.backend.portfolio.guard;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The portfolio module is independent of the other three (notifications, preferences, watchlist), and the order write
 * path does not depend on it. Nothing in the sprint waits on this module and it waits on nothing in the sprint; a
 * pricing outage answers on its own routes and leaves order placement alone. Enforced by looking at the imports.
 */
class PortfolioIndependenceTest {

    private static final Path BACKEND = Path.of("src", "main", "java", "org", "example", "backend");
    private static final Pattern IMPORT = Pattern.compile("^import\\s+(?:static\\s+)?([\\w.]+);", Pattern.MULTILINE);

    private static final List<String> OTHER_MODULES = List.of(
            "org.example.backend.notifications.",
            "org.example.backend.preferences.",
            "org.example.backend.watchlist.");

    @Test
    void portfolioImportsNothingFromTheOtherModules() throws IOException {
        List<String> offences = new ArrayList<>();
        for (Path file : PortfolioIsReadOnlyTest.javaFilesOf(BACKEND.resolve("portfolio"))) {
            for (String imported : importsOf(file)) {
                if (OTHER_MODULES.stream().anyMatch(imported::startsWith)) {
                    offences.add(file.getFileName() + " imports " + imported);
                }
            }
        }
        assertTrue(offences.isEmpty(), "portfolio must be independent: " + offences);
    }

    @Test
    void noOtherModuleAndNoCodeThatRecordsOrdersImportsPortfolio() throws IOException {
        List<String> offences = new ArrayList<>();
        for (Path file : PortfolioIsReadOnlyTest.javaFilesOf(BACKEND)) {
            String path = file.toString().replace('\\', '/');
            if (path.contains("/backend/portfolio/")) {
                continue;
            }
            for (String imported : importsOf(file)) {
                if (imported.startsWith("org.example.backend.portfolio.")) {
                    offences.add(file.getFileName() + " imports " + imported);
                }
            }
        }
        assertTrue(offences.isEmpty(), "nothing outside portfolio may depend on it: " + offences);
    }

    private static List<String> importsOf(Path file) throws IOException {
        Matcher matcher = IMPORT.matcher(Files.readString(file, StandardCharsets.UTF_8));
        List<String> imports = new ArrayList<>();
        while (matcher.find()) {
            imports.add(matcher.group(1));
        }
        return imports;
    }
}
