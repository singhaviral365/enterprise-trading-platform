package org.example.backend.watchlist.config;

import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.example.backend.watchlist.exceptions.PoisonQuoteMessageException;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
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
 * Kafka wiring owned by the watchlist module: its market-data consumer and dead-letter path.
 * Bean names are prefixed {@code watchlist} so nothing here collides with, or is picked up by,
 * another module's Kafka setup.
 */
@Configuration
@EnableKafka
public class WatchlistKafkaConfiguration {

    @Bean
    public ConsumerFactory<String, String> watchlistConsumerFactory(
            @Value("${spring.kafka.bootstrap-servers:localhost:9092}") String bootstrapServers,
            @Value("${watchlist.kafka.consumer-group:watchlist-prices}") String groupId) {

        Map<String, Object> properties = new HashMap<>();
        properties.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        // The group is this module's own. Never reuse another service's or module's group id.
        properties.put(ConsumerConfig.GROUP_ID_CONFIG, groupId);
        properties.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        properties.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        // A new group starts from the oldest retained quote so prices appear without waiting a poll cycle.
        // Quotes carry quotedAt, and the store ignores anything older than what it holds.
        properties.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        properties.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);

        return new DefaultKafkaConsumerFactory<>(properties);
    }

    @Bean
    public ProducerFactory<String, String> watchlistDeadLetterProducerFactory(
            @Value("${spring.kafka.bootstrap-servers:localhost:9092}") String bootstrapServers) {

        Map<String, Object> properties = new HashMap<>();
        properties.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        properties.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        properties.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        properties.put(ProducerConfig.ACKS_CONFIG, "all");

        return new DefaultKafkaProducerFactory<>(properties);
    }

    @Bean
    public KafkaTemplate<String, String> watchlistDeadLetterKafkaTemplate(
            @Qualifier("watchlistDeadLetterProducerFactory") ProducerFactory<String, String> producerFactory) {

        return new KafkaTemplate<>(producerFactory);
    }

    @Bean
    public DeadLetterPublishingRecoverer watchlistDeadLetterRecoverer(
            @Qualifier("watchlistDeadLetterKafkaTemplate") KafkaTemplate<String, String> template,
            @Value("${watchlist.kafka.market-data-topic:market-data}") String topic) {

        // market-data has 6 partitions but market-data.DLT has 1, so let the producer pick the
        // partition (negative = unspecified) instead of reusing the source partition number.
        return new DeadLetterPublishingRecoverer(
                template,
                (record, ex) -> new TopicPartition(topic + ".DLT", -1));
    }

    @Bean
    public CommonErrorHandler watchlistKafkaErrorHandler(
            @Qualifier("watchlistDeadLetterRecoverer") DeadLetterPublishingRecoverer recoverer,
            @Value("${watchlist.kafka.consumer.retry.initial-interval-millis:100}") long initialIntervalMillis,
            @Value("${watchlist.kafka.consumer.retry.multiplier:2.0}") double multiplier,
            @Value("${watchlist.kafka.consumer.retry.max-interval-millis:1000}") long maxIntervalMillis,
            @Value("${watchlist.kafka.consumer.retry.max-attempts:3}") int maxAttempts) {

        ExponentialBackOffWithMaxRetries backOff = new ExponentialBackOffWithMaxRetries(Math.max(0, maxAttempts - 1));
        backOff.setInitialInterval(Math.max(1L, initialIntervalMillis));
        backOff.setMultiplier(Math.max(1.0d, multiplier));
        backOff.setMaxInterval(Math.max(1L, maxIntervalMillis));

        DefaultErrorHandler errorHandler = new DefaultErrorHandler(recoverer, backOff);
        errorHandler.setCommitRecovered(true);
        // A malformed message will never get better: dead-letter it at once so it cannot stall the partition.
        errorHandler.addNotRetryableExceptions(PoisonQuoteMessageException.class);
        errorHandler.addRetryableExceptions(
                CannotGetJdbcConnectionException.class,
                RecoverableDataAccessException.class,
                TransientDataAccessException.class);

        return errorHandler;
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, String> watchlistKafkaListenerContainerFactory(
            @Qualifier("watchlistConsumerFactory") ConsumerFactory<String, String> consumerFactory,
            @Qualifier("watchlistKafkaErrorHandler") CommonErrorHandler errorHandler) {

        ConcurrentKafkaListenerContainerFactory<String, String> factory =
                new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(consumerFactory);
        factory.setCommonErrorHandler(errorHandler);
        return factory;
    }
}
