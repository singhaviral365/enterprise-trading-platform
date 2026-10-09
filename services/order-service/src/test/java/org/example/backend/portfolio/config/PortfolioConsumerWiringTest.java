package org.example.backend.portfolio.config;

import org.example.backend.portfolio.consumer.FilledSellConsumer;
import org.example.backend.portfolio.ledger.RealisedPnlReconciler;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.kafka.config.KafkaListenerEndpointRegistry;
import org.springframework.kafka.listener.MessageListenerContainer;

import java.util.Collection;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.Mockito.mock;

/**
 * Boots the module's real Kafka beans (without starting the consumer or touching a broker) and checks what Spring
 * registered: one listener, on trade-events only, in the module's own group.
 */
class PortfolioConsumerWiringTest {

    @Test
    void registersOneListenerOnTradeEventsInThePortfolioGroup() {
        System.setProperty("portfolio.kafka.consumer.enabled", "false");
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            context.register(PortfolioKafkaConfiguration.class, FilledSellConsumer.class);
            context.registerBean(RealisedPnlReconciler.class, () -> mock(RealisedPnlReconciler.class));
            context.refresh();

            Collection<MessageListenerContainer> containers =
                    context.getBean(KafkaListenerEndpointRegistry.class).getListenerContainers();

            assertEquals(1, containers.size());
            MessageListenerContainer container = containers.iterator().next();
            assertEquals("portfolio-pnl", container.getGroupId());
            assertArrayEquals(new String[] {"trade-events"}, container.getContainerProperties().getTopics());
            assertFalse(container.isRunning(), "disabled by portfolio.kafka.consumer.enabled=false");
        } finally {
            System.clearProperty("portfolio.kafka.consumer.enabled");
        }
    }

    @Test
    void theGroupIsNoOtherModulesSoOffsetsNeverInterfere() {
        System.setProperty("portfolio.kafka.consumer.enabled", "false");
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            context.register(PortfolioKafkaConfiguration.class, FilledSellConsumer.class);
            context.registerBean(RealisedPnlReconciler.class, () -> mock(RealisedPnlReconciler.class));
            context.refresh();

            String group = context.getBean(KafkaListenerEndpointRegistry.class)
                    .getListenerContainers().iterator().next().getGroupId();

            assertFalse(group.equals("executor-service") || group.equals("watchlist-prices") || group.equals("customer-notifications"));
        } finally {
            System.clearProperty("portfolio.kafka.consumer.enabled");
        }
    }
}
