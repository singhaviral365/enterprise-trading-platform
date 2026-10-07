package org.example.backend.notifications.config;

import org.example.backend.notifications.consumer.TradeEventsConsumer;
import org.example.backend.notifications.gateway.NotificationGateway;
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
 * actually registered: one listener, on trade-events only, in the module's own group.
 */
class NotificationsConsumerWiringTest {

    @Test
    void registersOneListenerOnTradeEventsInTheCustomerNotificationsGroup() {
        System.setProperty("notifications.kafka.consumer.enabled", "false");
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            context.register(NotificationsKafkaConfiguration.class, TradeEventsConsumer.class);
            // What the consumer hands notifications to; its behaviour is tested on its own.
            context.registerBean(NotificationGateway.class, () -> mock(NotificationGateway.class));
            context.refresh();

            Collection<MessageListenerContainer> containers =
                    context.getBean(KafkaListenerEndpointRegistry.class).getListenerContainers();

            assertEquals(1, containers.size());
            MessageListenerContainer container = containers.iterator().next();
            assertEquals("customer-notifications", container.getGroupId());
            assertArrayEquals(new String[] {"trade-events"}, container.getContainerProperties().getTopics());
            assertFalse(container.isRunning(), "disabled by notifications.kafka.consumer.enabled=false");
        } finally {
            System.clearProperty("notifications.kafka.consumer.enabled");
        }
    }

    @Test
    void theGroupIsNeitherTheExecutorsNorTheWatchlistsSoOffsetsNeverInterfere() {
        System.setProperty("notifications.kafka.consumer.enabled", "false");
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            context.register(NotificationsKafkaConfiguration.class, TradeEventsConsumer.class);
            context.registerBean(NotificationGateway.class, () -> mock(NotificationGateway.class));
            context.refresh();

            String group = context.getBean(KafkaListenerEndpointRegistry.class)
                    .getListenerContainers().iterator().next().getGroupId();

            assertFalse(group.equals("executor-service") || group.equals("watchlist-prices"));
        } finally {
            System.clearProperty("notifications.kafka.consumer.enabled");
        }
    }
}
