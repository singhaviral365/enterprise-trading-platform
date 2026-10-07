package org.example.backend.notifications.config;

import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.example.backend.notifications.exceptions.PoisonTradeEventException;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.RecoverableDataAccessException;
import org.springframework.dao.TransientDataAccessException;
import org.springframework.jdbc.CannotGetJdbcConnectionException;
import org.springframework.kafka.annotation.EnableKafka;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;
import org.springframework.kafka.listener.CommonErrorHandler;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.kafka.support.ExponentialBackOffWithMaxRetries;

import java.util.HashMap;
import java.util.Map;

/**
 * Kafka wiring owned by the notifications module: its {@code trade-events} consumer and dead-letter path. Bean names
 * are prefixed {@code notifications} so nothing here collides with, or is picked up by, another module's Kafka setup.
 *
 * <p>Offsets are committed by the container after the listener returns (auto-commit is off), which is after the
 * notification has been durably recorded and not after any provider has confirmed.
 */
@Configuration
@EnableKafka
public class NotificationsKafkaConfiguration {

    @Bean
    public ConsumerFactory<String, String> notificationsConsumerFactory(
            @Value("${spring.kafka.bootstrap-servers:localhost:9092}") String bootstrapServers,
            @Value("${notifications.kafka.consumer-group:customer-notifications}") String groupId,
            @Value("${notifications.kafka.consumer.start-from:latest}") String startFrom) {

        Map<String, Object> properties = new HashMap<>();
        properties.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        // The group is this module's own. Never reuse another service's or module's group id.
        properties.put(ConsumerConfig.GROUP_ID_CONFIG, groupId);
        properties.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        properties.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        // A brand-new group starts at the end, not the beginning: trade-events keeps 30 days, and telling a customer
        // today about a fill from last month (by email, too) would be worse than missing an event while this group
        // did not exist yet. After its first start the group resumes from its committed offsets.
        properties.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, startFrom);
        properties.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);

        return new DefaultKafkaConsumerFactory<>(properties);
    }

    @Bean
    public ProducerFactory<String, String> notificationsDeadLetterProducerFactory(
            @Value("${spring.kafka.bootstrap-servers:localhost:9092}") String bootstrapServers) {

        Map<String, Object> properties = new HashMap<>();
        properties.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        properties.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        properties.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        properties.put(ProducerConfig.ACKS_CONFIG, "all");

        return new DefaultKafkaProducerFactory<>(properties);
    }

    @Bean
    public KafkaTemplate<String, String> notificationsDeadLetterKafkaTemplate(
            @Qualifier("notificationsDeadLetterProducerFactory") ProducerFactory<String, String> producerFactory) {

        return new KafkaTemplate<>(producerFactory);
    }

    @Bean
    public DeadLetterPublishingRecoverer notificationsDeadLetterRecoverer(
            @Qualifier("notificationsDeadLetterKafkaTemplate") KafkaTemplate<String, String> template,
            @Value("${notifications.kafka.trade-events-topic:trade-events}") String topic) {

        // trade-events.DLT has 1 partition, so let the producer choose rather than reuse the source partition number.
        return new DeadLetterPublishingRecoverer(
                template,
                (record, ex) -> new TopicPartition(topic + ".DLT", -1));
    }

    @Bean
    public CommonErrorHandler notificationsKafkaErrorHandler(
            @Qualifier("notificationsDeadLetterRecoverer") DeadLetterPublishingRecoverer recoverer,
            @Value("${notifications.kafka.consumer.retry.initial-interval-millis:100}") long initialIntervalMillis,
            @Value("${notifications.kafka.consumer.retry.multiplier:2.0}") double multiplier,
            @Value("${notifications.kafka.consumer.retry.max-interval-millis:1000}") long maxIntervalMillis,
            @Value("${notifications.kafka.consumer.retry.max-attempts:3}") int maxAttempts) {

        ExponentialBackOffWithMaxRetries backOff = new ExponentialBackOffWithMaxRetries(Math.max(0, maxAttempts - 1));
        backOff.setInitialInterval(Math.max(1L, initialIntervalMillis));
        backOff.setMultiplier(Math.max(1.0d, multiplier));
        backOff.setMaxInterval(Math.max(1L, maxIntervalMillis));

        DefaultErrorHandler errorHandler = new DefaultErrorHandler(recoverer, backOff);
        errorHandler.setCommitRecovered(true);
        // Neither will ever get better: dead-letter at once so they cannot stall the partition.
        // DataIntegrityViolation here means the event names an account that does not exist.
        errorHandler.addNotRetryableExceptions(PoisonTradeEventException.class, DataIntegrityViolationException.class);
        errorHandler.addRetryableExceptions(
                CannotGetJdbcConnectionException.class,
                RecoverableDataAccessException.class,
                TransientDataAccessException.class);

        return errorHandler;
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, String> notificationsKafkaListenerContainerFactory(
            @Qualifier("notificationsConsumerFactory") ConsumerFactory<String, String> consumerFactory,
            @Qualifier("notificationsKafkaErrorHandler") CommonErrorHandler errorHandler) {

        ConcurrentKafkaListenerContainerFactory<String, String> factory =
                new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(consumerFactory);
        factory.setCommonErrorHandler(errorHandler);
        return factory;
    }
}
