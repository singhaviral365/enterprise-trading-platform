package org.example.backend.strategy;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * The strategy module never places an order. An order is placed only by POST /api/v1/orders, so nothing in this package may
 * reach order placement, the orders topic or the orders table. This reads the module's own source and fails if it ever does,
 * because the day somebody takes that shortcut is the day a strategy bug spends a customer's money without the route's checks.
 *
 * <p>(The one class that does place an order for an executor's token, {@code StrategyOrderService}, lives outside this package
 * on purpose, and calls the ordinary route code behind a gate.)
 */
class StrategyBoundaryTest {

    private static final Path SOURCE = Path.of("src", "main", "java", "org", "example", "backend", "strategy");
    private static final Path MAPPER_XML = Path.of("src", "main", "resources", "mapper", "StrategyMapper.xml");

    private static final Pattern WRITES_ORDERS = Pattern.compile("(?i)\\b(insert\\s+into|update|delete\\s+from)\\s+orders\\b");

    private static final List<Pattern> FORBIDDEN = List.of(
            Pattern.compile("\\bTradeService\\b"),
            Pattern.compile("\\bOrderEventProducer\\b"),
            Pattern.compile("\\bOrderPlacedAfterCommitListener\\b"),
            Pattern.compile("\\bKafkaTemplate\\b"),
            Pattern.compile("\\borders?Mapper\\s*\\.\\s*(insert|update|delete|fill|reject|cancel)\\w*", Pattern.CASE_INSENSITIVE),
            WRITES_ORDERS);

    @Test
    void noSourceFileOfTheStrategyModuleReachesOrderPlacement() throws IOException {
        assumeTrue(Files.isDirectory(SOURCE), SOURCE.toAbsolutePath() + " is not reachable from this working directory");

        try (Stream<Path> files = Files.walk(SOURCE)) {
            for (Path file : files.filter(path -> path.toString().endsWith(".java")).toList()) {
                String text = Files.readString(file);
                for (Pattern forbidden : FORBIDDEN) {
                    assertFalse(forbidden.matcher(text).find(),
                            file.getFileName() + " must not match " + forbidden.pattern()
                                    + ": strategies place orders only through POST /api/v1/orders");
                }
            }
        }
    }

    @Test
    void theStrategyMappersSqlNeverWritesToTheOrdersTable() throws IOException {
        assumeTrue(Files.exists(MAPPER_XML), MAPPER_XML.toAbsolutePath() + " is not reachable from this working directory");

        assertFalse(WRITES_ORDERS.matcher(Files.readString(MAPPER_XML)).find());
    }

    @Test
    void theMappersSqlUsesBindParametersOnly() throws IOException {
        assumeTrue(Files.exists(MAPPER_XML), MAPPER_XML.toAbsolutePath() + " is not reachable from this working directory");

        assertFalse(Files.readString(MAPPER_XML).contains("${"), "a ${...} would put a request value into the SQL text");
    }
}
