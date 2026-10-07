package org.example.trade_executor.strategy;

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
 * The strategy worker never places an order itself. An order is placed only by POST /api/v1/orders on the order-service, so
 * nothing in this package may publish to the orders topic, write the orders table, or call the code that settles an order. This
 * reads the worker's own source and mapper and fails if it ever does.
 */
class StrategyBoundaryTest {

    private static final Path SOURCE = Path.of("src", "main", "java", "org", "example", "trade_executor", "strategy");
    private static final Path MAPPER_XML = Path.of("src", "main", "resources", "mapper", "ExecutorStrategyMapper.xml");

    private static final Pattern WRITES_ORDERS = Pattern.compile("(?i)\\b(insert\\s+into|update|delete\\s+from)\\s+orders\\b");

    private static final List<Pattern> FORBIDDEN = List.of(
            Pattern.compile("\\bKafkaTemplate\\b"),
            Pattern.compile("\\bOrderPlacedMessage\\b"),
            Pattern.compile("\\bTradeEventProducer\\b"),
            Pattern.compile("\\bOrderSettlementService\\b"),
            Pattern.compile("\\bTradeExecutorService\\b"),
            Pattern.compile("\\bOrderMapper\\b"),
            Pattern.compile("\\bOrderResolved\\w*\\b"),
            WRITES_ORDERS);

    @Test
    void noSourceFileOfTheWorkerReachesOrderPlacementOrSettlement() throws IOException {
        assumeTrue(Files.isDirectory(SOURCE), SOURCE.toAbsolutePath() + " is not reachable from this working directory");

        try (Stream<Path> files = Files.walk(SOURCE)) {
            for (Path file : files.filter(path -> path.toString().endsWith(".java")).toList()) {
                String text = Files.readString(file);
                for (Pattern forbidden : FORBIDDEN) {
                    // The one legitimate Kafka producer here sends a market-data message that cannot be processed to its
                    // dead-letter topic; it carries no order.
                    if (forbidden.pattern().contains("KafkaTemplate") && file.getFileName().toString().equals("StrategyKafkaConfiguration.java")) {
                        continue;
                    }
                    assertFalse(forbidden.matcher(text).find(),
                            file.getFileName() + " must not match " + forbidden.pattern()
                                    + ": strategies place orders only through POST /api/v1/orders");
                }
            }
        }
    }

    @Test
    void theWorkersSqlOnlyReadsTheOrdersTable() throws IOException {
        assumeTrue(Files.exists(MAPPER_XML), MAPPER_XML.toAbsolutePath() + " is not reachable from this working directory");

        assertFalse(WRITES_ORDERS.matcher(Files.readString(MAPPER_XML)).find());
    }

    @Test
    void theWorkersSqlUsesBindParametersOnly() throws IOException {
        assumeTrue(Files.exists(MAPPER_XML), MAPPER_XML.toAbsolutePath() + " is not reachable from this working directory");

        assertFalse(Files.readString(MAPPER_XML).contains("${"), "a ${...} would put a request value into the SQL text");
    }

    @Test
    void theOrderIsSentOverHttpAndTheTokenIsNeverLogged() throws IOException {
        Path client = SOURCE.resolve("OrderApiClient.java");
        Path minter = SOURCE.resolve("ExecutorTokenMinter.java");
        assumeTrue(Files.exists(client), client.toAbsolutePath() + " is not reachable from this working directory");

        for (Path file : List.of(client, minter, SOURCE.resolve("StrategyWorker.java"))) {
            String text = Files.readString(file);
            // A log call that passes the token (or the request that carries it) as an argument. The word in a message is fine.
            assertFalse(Pattern.compile("LOGGER\\.\\w+\\([^;]*,\\s*(token|request)\\b").matcher(text).find(),
                    file.getFileName() + " logs a token or the request that carries it");
        }
    }
}
