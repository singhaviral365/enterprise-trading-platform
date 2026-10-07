package org.example.trade_executor.strategy.config;

import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.header.Headers;
import org.apache.kafka.common.header.internals.RecordHeaders;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.example.trade_executor.strategy.PoisonStrategyQuoteException;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.dao.RecoverableDataAccessException;
import org.springframework.dao.TransientDataAccessException;
import org.springframework.jdbc.CannotGetJdbcConnectionException;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.ContainerProperties;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.kafka.support.ExponentialBackOffWithMaxRetries;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * The strategy worker's own Kafka consumer. Its group and its error handling are its own, so nothing here can move the
 * offsets of the order consumer or send a market-data message to the orders dead-letter topic.
 */
@Configuration
public class StrategyKafkaConfiguration {

    @Bean
    public ConsumerFactory<String, String> strategyConsumerFactory(
            @Value("${spring.kafka.bootstrap-servers:localhost:9092}") String bootstrapServers,
            @Value("${strategy.kafka.consumer-group:strategy-worker}") String groupId,
            @Value("${strategy.kafka.consumer.start-from:latest}") String startFrom) {

        Map<String, Object> properties = new HashMap<>();
        properties.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        properties.put(ConsumerConfig.GROUP_ID_CONFIG, groupId);
        properties.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        properties.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        properties.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, startFrom);
        properties.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);
        // A quote can take a while to act on (an HTTP call per triggered strategy): do not let the broker think we died.
        properties.put(ConsumerConfig.MAX_POLL_INTERVAL_MS_CONFIG, 300_000);
        properties.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, 20);

        return new DefaultKafkaConsumerFactory<>(properties);
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, String> strategyKafkaListenerContainerFactory(
            ConsumerFactory<String, String> strategyConsumerFactory,
            @Qualifier("deadLetterKafkaTemplate") KafkaTemplate<String, String> deadLetterKafkaTemplate,
            @Value("${trading.kafka.market-data-topic:market-data}") String marketDataTopic,
            @Value("${trading.kafka.consumer.retry.initial-interval-millis:100}") long initialIntervalMillis,
            @Value("${trading.kafka.consumer.retry.multiplier:2.0}") double multiplier,
            @Value("${trading.kafka.consumer.retry.max-interval-millis:1000}") long maxIntervalMillis,
            @Value("${trading.kafka.consumer.retry.max-attempts:3}") int maxAttempts) {

        // A message that cannot be processed goes to market-data.DLT (which exists for exactly this), keeping the one
        // partition that topic has, and the reason in a header.
        DeadLetterPublishingRecoverer recoverer = new DeadLetterPublishingRecoverer(
                deadLetterKafkaTemplate,
                (record, ex) -> new TopicPartition(marketDataTopic + ".DLT", 0));
        recoverer.setHeadersFunction((record, ex) -> {
            Headers headers = new RecordHeaders();
            headers.add("failure-reason", rootCauseMessage(ex).getBytes(StandardCharsets.UTF_8));
            return headers;
        });

        ExponentialBackOffWithMaxRetries backOff = new ExponentialBackOffWithMaxRetries(Math.max(0, maxAttempts - 1));
        backOff.setInitialInterval(Math.max(1L, initialIntervalMillis));
        backOff.setMultiplier(Math.max(1.0d, multiplier));
        backOff.setMaxInterval(Math.max(1L, maxIntervalMillis));

        DefaultErrorHandler errorHandler = new DefaultErrorHandler(recoverer, backOff);
        errorHandler.setCommitRecovered(true);
        errorHandler.addNotRetryableExceptions(PoisonStrategyQuoteException.class);
        errorHandler.addRetryableExceptions(
                CannotGetJdbcConnectionException.class,
                RecoverableDataAccessException.class,
                TransientDataAccessException.class);

        ConcurrentKafkaListenerContainerFactory<String, String> factory = new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(strategyConsumerFactory);
        factory.setCommonErrorHandler(errorHandler);
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL_IMMEDIATE);
        return factory;
    }

    private static String rootCauseMessage(Exception exception) {
        Throwable cause = exception;
        while (cause.getCause() != null) {
            cause = cause.getCause();
        }
        String message = cause.getMessage();
        return message == null || message.isBlank() ? cause.getClass().getSimpleName() : message;
    }
}
