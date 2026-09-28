package org.example.trade_executor.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.header.Headers;
import org.apache.kafka.common.header.internals.RecordHeaders;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.example.backend.exceptions.OptimisticLockException;
import org.example.trade_executor.executor.PoisonOrderMessageException;
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
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.CommonErrorHandler;
import org.springframework.kafka.listener.ContainerProperties;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.kafka.support.ExponentialBackOffWithMaxRetries;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

@Configuration
@EnableKafka
public class KafkaConsumerConfiguration {

    @Bean
    public ObjectMapper objectMapper() {
        return new ObjectMapper().findAndRegisterModules();
    }

    @Bean
    public ConsumerFactory<String, String> ordersConsumerFactory(
            @Value("${spring.kafka.bootstrap-servers:localhost:9092}") String bootstrapServers,
            @Value("${trading.kafka.orders-consumer-group:trade-executor}") String consumerGroupId) {

        Map<String, Object> properties = new HashMap<>();
        properties.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        properties.put(ConsumerConfig.GROUP_ID_CONFIG, consumerGroupId);
        properties.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        properties.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        properties.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        properties.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);

        return new DefaultKafkaConsumerFactory<>(properties);
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, String> ordersKafkaListenerContainerFactory(
            ConsumerFactory<String, String> ordersConsumerFactory,
            CommonErrorHandler kafkaCommonErrorHandler) {

        ConcurrentKafkaListenerContainerFactory<String, String> factory =
                new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(ordersConsumerFactory);
        factory.setCommonErrorHandler(kafkaCommonErrorHandler);
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL_IMMEDIATE);
        return factory;
    }

    @Bean
    public DeadLetterPublishingRecoverer deadLetterPublishingRecoverer(
            KafkaTemplate<String, String> deadLetterKafkaTemplate,
            @Value("${trading.kafka.orders-topic:orders}") String ordersTopic) {

        DeadLetterPublishingRecoverer recoverer = new DeadLetterPublishingRecoverer(
                deadLetterKafkaTemplate,
                (record, ex) -> new TopicPartition(ordersTopic + ".DLT", record.partition()));

        recoverer.setHeadersFunction((record, ex) -> {
            Headers headers = new RecordHeaders();
            headers.add(
                    "failure-reason",
                    rootCauseMessage(ex).getBytes(StandardCharsets.UTF_8));
            return headers;
        });

        return recoverer;
    }

    @Bean
    public CommonErrorHandler kafkaCommonErrorHandler(
            DeadLetterPublishingRecoverer deadLetterPublishingRecoverer,
            @Value("${trading.kafka.consumer.retry.initial-interval-millis:100}") long initialIntervalMillis,
            @Value("${trading.kafka.consumer.retry.multiplier:2.0}") double multiplier,
            @Value("${trading.kafka.consumer.retry.max-interval-millis:1000}") long maxIntervalMillis,
            @Value("${trading.kafka.consumer.retry.max-attempts:3}") int maxAttempts) {

        ExponentialBackOffWithMaxRetries backOff = new ExponentialBackOffWithMaxRetries(Math.max(0, maxAttempts - 1));
        backOff.setInitialInterval(Math.max(1L, initialIntervalMillis));
        backOff.setMultiplier(Math.max(1.0d, multiplier));
        backOff.setMaxInterval(Math.max(1L, maxIntervalMillis));

        DefaultErrorHandler errorHandler = new DefaultErrorHandler(deadLetterPublishingRecoverer, backOff);
        errorHandler.setCommitRecovered(true);
        errorHandler.addNotRetryableExceptions(PoisonOrderMessageException.class);
        errorHandler.addRetryableExceptions(
                OptimisticLockException.class,
                CannotGetJdbcConnectionException.class,
                RecoverableDataAccessException.class,
                TransientDataAccessException.class);

        return errorHandler;
    }

    private static String rootCauseMessage(Exception exception) {
        Throwable cause = exception;
        while (cause.getCause() != null) {
            cause = cause.getCause();
        }

        String message = cause.getMessage();
        if (message == null || message.isBlank()) {
            return cause.getClass().getSimpleName();
        }
        return message;
    }
}

