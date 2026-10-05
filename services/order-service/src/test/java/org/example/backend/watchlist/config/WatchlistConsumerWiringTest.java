package org.example.backend.watchlist.config;

import org.example.backend.watchlist.consumer.MarketDataQuoteConsumer;
import org.example.backend.watchlist.price.LatestQuoteStore;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.kafka.config.KafkaListenerEndpointRegistry;
import org.springframework.kafka.listener.MessageListenerContainer;

import java.util.Collection;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

/**
 * Boots the module's real Kafka beans (without starting the consumer or touching a broker) and
 * checks what Spring actually registered: one listener, on market-data only, in the module's own group.
 */
class WatchlistConsumerWiringTest {

    @Test
    void registersOneListenerOnMarketDataInTheWatchlistGroup() {
        System.setProperty("watchlist.kafka.consumer.enabled", "false");
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            context.register(WatchlistKafkaConfiguration.class, LatestQuoteStore.class, MarketDataQuoteConsumer.class);
            context.refresh();

            Collection<MessageListenerContainer> containers =
                    context.getBean(KafkaListenerEndpointRegistry.class).getListenerContainers();

            assertEquals(1, containers.size());
            MessageListenerContainer container = containers.iterator().next();
            assertEquals("watchlist-prices", container.getGroupId());
            assertArrayEquals(new String[] {"market-data"}, container.getContainerProperties().getTopics());
            assertFalse(container.isRunning(), "disabled by watchlist.kafka.consumer.enabled=false");
        } finally {
            System.clearProperty("watchlist.kafka.consumer.enabled");
        }
    }
}
