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
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The portfolio module shares the connection the rest of the service uses to record orders, so nothing at runtime stops
 * it writing to {@code orders}, {@code holdings} or {@code account}. This test is the control that is not a person
 * reading a diff: it fails the build if the module's SQL writes anywhere but its own table, or if its Java calls a
 * write method on a trading mapper or on the trade service.
 */
class PortfolioIsReadOnlyTest {

    /** The only tables this module may write. */
    private static final java.util.Set<String> OWNED_TABLES =
            java.util.Set.of("realised_pnl_entry", "price_candle_daily", "portfolio_nav_daily");

    private static final Path MAIN_JAVA = Path.of("src", "main", "java");
    private static final Path PORTFOLIO = MAIN_JAVA.resolve("org/example/backend/portfolio");
    private static final List<Path> MAPPER_XMLS = List.of(
            Path.of("src", "main", "resources", "mapper", "PortfolioMapper.xml"),
            Path.of("src", "main", "resources", "mapper", "PerformanceMapper.xml"));

    private static final Pattern WRITE_STATEMENT = Pattern.compile(
            "<(insert|update|delete)\\b[^>]*>(.*?)</\\1>", Pattern.DOTALL);

    @Test
    void everyWritingStatementInTheMappersTargetsOnlyTheModulesOwnTables() throws IOException {
        int found = 0;
        for (Path mapperXml : MAPPER_XMLS) {
            String xml = Files.readString(mapperXml, StandardCharsets.UTF_8);
            for (Matcher statement = WRITE_STATEMENT.matcher(xml); statement.find(); ) {
                found++;
                String sql = statement.group(2).replaceAll("\s+", " ").trim().toLowerCase();
                String kind = statement.group(1);
                String target = switch (kind) {
                    case "insert" -> after(sql, "insert into ");
                    case "update" -> after(sql, "update ");
                    default -> after(sql, "delete from ");
                };
                assertTrue(OWNED_TABLES.contains(target), mapperXml.getFileName() + ": a " + kind + " statement writes to " + target + ": " + sql);
            }
        }
        assertTrue(found >= 3, "the ledger insert and the two performance upserts should be found; has the XML layout changed?");
    }

    @Test
    void noStatementWritesViaOtherSqlKeywords() throws IOException {
        for (Path mapperXml : MAPPER_XMLS) {
            String xml = Files.readString(mapperXml, StandardCharsets.UTF_8).toLowerCase();
            for (String keyword : List.of("truncate ", "drop table", "alter table", "merge into", "create table")) {
                assertFalse(xml.contains(keyword), mapperXml.getFileName() + " must not contain: " + keyword);
            }
            // A SELECT ... FOR UPDATE would take row locks on the trading tables.
            assertFalse(xml.contains("for update"), "reads of the trading tables must not lock them");
        }
    }

    @Test
    void theModulesJavaNeverCallsAWriteMethodOnATradingMapper() throws IOException {
        Pattern tradingWrite = Pattern.compile(
                "\\b(accountMapper|orderMapper|holdingMapper|instrumentMapper)\\s*\\.\\s*"
                        + "(insert|update|delete|reject|fill|cancel|next|set)\\w*\\s*\\(");

        List<String> offences = new ArrayList<>();
        for (Path file : javaFilesOf(PORTFOLIO)) {
            Matcher matcher = tradingWrite.matcher(Files.readString(file, StandardCharsets.UTF_8));
            while (matcher.find()) {
                offences.add(file.getFileName() + ": " + matcher.group());
            }
        }
        assertTrue(offences.isEmpty(), "writes to trading tables: " + offences);
    }

    @Test
    void theOnlyTradeServiceMethodsTheModuleCallsAreReads() throws IOException {
        Pattern call = Pattern.compile("\\b(?:tradeService|trade)\\s*\\.\\s*(\\w+)\\s*\\(");
        List<String> allowed = List.of("getBalance", "getPositions");

        List<String> offences = new ArrayList<>();
        for (Path file : javaFilesOf(PORTFOLIO)) {
            Matcher matcher = call.matcher(Files.readString(file, StandardCharsets.UTF_8));
            while (matcher.find()) {
                if (!allowed.contains(matcher.group(1))) {
                    offences.add(file.getFileName() + ": " + matcher.group(1));
                }
            }
        }
        assertTrue(offences.isEmpty(), "TradeService methods other than reads: " + offences);
    }

    @Test
    void theModuleDoesNotOpenATransactionOnTheSharedConnection() throws IOException {
        for (Path file : javaFilesOf(PORTFOLIO)) {
            String source = Files.readString(file, StandardCharsets.UTF_8);
            assertFalse(source.contains("@Transactional"),
                    file.getFileName() + " opens a transaction; the module reads, and books one row at a time");
        }
    }

    private static String after(String sql, String prefix) {
        int start = sql.indexOf(prefix);
        assertTrue(start >= 0, "expected '" + prefix + "' in: " + sql);
        String rest = sql.substring(start + prefix.length()).trim();
        int end = 0;
        while (end < rest.length() && (Character.isLetterOrDigit(rest.charAt(end)) || rest.charAt(end) == '_')) {
            end++;
        }
        return rest.substring(0, end);
    }

    static List<Path> javaFilesOf(Path root) throws IOException {
        try (Stream<Path> files = Files.walk(root)) {
            return files.filter(path -> path.toString().endsWith(".java")).toList();
        }
    }
}
