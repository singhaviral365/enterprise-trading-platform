package org.example.trade_executor.config;

import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.example.backend.exceptions.OptimisticLockException;
import org.example.trade_executor.executor.OrderPlacedConsumer;
import org.example.trade_executor.executor.PoisonOrderMessageException;
import org.example.trade_executor.service.TradeExecutorService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.CannotGetJdbcConnectionException;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.CommonErrorHandler;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.kafka.listener.MessageListenerContainer;
import org.springframework.kafka.support.Acknowledgment;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.CompletableFuture;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class KafkaConsumerConfigurationTest {

    @SuppressWarnings("unchecked")
    @Test
    void malformedMessageGoesToDltImmediatelyWithOriginalPayloadAndFailureReason() {
        KafkaTemplate<String, String> dltTemplate = mock(KafkaTemplate.class);
        when(dltTemplate.send(any(ProducerRecord.class))).thenReturn(CompletableFuture.completedFuture(null));

        KafkaConsumerConfiguration configuration = new KafkaConsumerConfiguration();
        DeadLetterPublishingRecoverer recoverer = configuration.deadLetterPublishingRecoverer(dltTemplate, "orders");
        CommonErrorHandler commonErrorHandler = configuration.kafkaCommonErrorHandler(recoverer, 100L, 2.0d, 1000L, 3);
        DefaultErrorHandler errorHandler = (DefaultErrorHandler) commonErrorHandler;

        ConsumerRecord<String, String> record = new ConsumerRecord<>("orders", 0, 12L, "key-1", "{");
        errorHandler.handleOne(
                new PoisonOrderMessageException("malformed JSON"),
                record,
                mock(Consumer.class),
                mock(MessageListenerContainer.class));

        ArgumentCaptor<ProducerRecord<String, String>> recordCaptor = ArgumentCaptor.forClass((Class) ProducerRecord.class);
        verify(dltTemplate).send(recordCaptor.capture());

        ProducerRecord<String, String> dltRecord = recordCaptor.getValue();
        assertEquals("orders.DLT", dltRecord.topic());
        assertEquals("key-1", dltRecord.key());
        assertEquals("{", dltRecord.value());
        assertEquals(
                "malformed JSON",
                new String(dltRecord.headers().lastHeader("failure-reason").value(), StandardCharsets.UTF_8));
    }

    @SuppressWarnings("unchecked")
    @Test
    void transientFailureRetriesWithoutImmediateDltAndCanSucceedOnNextDelivery() {
        KafkaTemplate<String, String> dltTemplate = mock(KafkaTemplate.class);
        when(dltTemplate.send(any(ProducerRecord.class))).thenReturn(CompletableFuture.completedFuture(null));

        KafkaConsumerConfiguration configuration = new KafkaConsumerConfiguration();
        DeadLetterPublishingRecoverer recoverer = configuration.deadLetterPublishingRecoverer(dltTemplate, "orders");
        DefaultErrorHandler errorHandler = (DefaultErrorHandler) configuration
                .kafkaCommonErrorHandler(recoverer, 1L, 2.0d, 2L, 3);

        ConsumerRecord<String, String> record = new ConsumerRecord<>("orders", 0, 13L, "key-2", "valid-payload");
        boolean handled = errorHandler.handleOne(
                new CannotGetJdbcConnectionException("db unavailable"),
                record,
                mock(Consumer.class),
                mock(MessageListenerContainer.class));

        assertFalse(handled);
        verify(dltTemplate, never()).send(any(ProducerRecord.class));

        TradeExecutorService tradeExecutorService = mock(TradeExecutorService.class);
        Acknowledgment acknowledgment = mock(Acknowledgment.class);
        OrderPlacedConsumer orderPlacedConsumer = new OrderPlacedConsumer(
                new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules(),
                tradeExecutorService,
                "orders",
                "trade-executor");
        String nextDelivery = """
                {
                  \"eventId\": \"event-3\",
                  \"eventType\": \"ORDER_PLACED\",
                  \"eventTime\": \"2026-09-17T10:00:00Z\",
                  \"source\": \"trade-api\",
                  \"schemaVersion\": 1,
                  \"payload\": {
                    \"orderId\": 201,
                    \"accountId\": 1,
                    \"symbol\": \"ACME\",
                    \"side\": \"BUY\",
                    \"quantity\": 10,
                    \"receivedAt\": \"2026-09-17T10:00:00Z\"
                  }
                }
                """;

        orderPlacedConsumer.consume(nextDelivery, acknowledgment);
        verify(tradeExecutorService, times(1)).execute(any());
        verify(acknowledgment, times(1)).acknowledge();
    }

    @SuppressWarnings("unchecked")
    @Test
    void exhaustedTransientRetriesDeadLetterTheMessage() {
        KafkaTemplate<String, String> dltTemplate = mock(KafkaTemplate.class);
        when(dltTemplate.send(any(ProducerRecord.class))).thenReturn(CompletableFuture.completedFuture(null));

        KafkaConsumerConfiguration configuration = new KafkaConsumerConfiguration();
        DeadLetterPublishingRecoverer recoverer = configuration.deadLetterPublishingRecoverer(dltTemplate, "orders");
        DefaultErrorHandler errorHandler = (DefaultErrorHandler) configuration
                .kafkaCommonErrorHandler(recoverer, 1L, 2.0d, 2L, 3);

        ConsumerRecord<String, String> record = new ConsumerRecord<>("orders", 0, 14L, "key-3", "valid-payload");
        Consumer<String, String> consumer = mock(Consumer.class);
        MessageListenerContainer container = mock(MessageListenerContainer.class);

        errorHandler.handleOne(new OptimisticLockException(), record, consumer, container);
        errorHandler.handleOne(new OptimisticLockException(), record, consumer, container);
        errorHandler.handleOne(new OptimisticLockException(), record, consumer, container);

        verify(dltTemplate, times(1)).send(any(ProducerRecord.class));
    }

    @SuppressWarnings("unchecked")
    @Test
    void poisonMessageDeadLettersThenNextMessageCanStillBeConsumed() {
        KafkaTemplate<String, String> dltTemplate = mock(KafkaTemplate.class);
        when(dltTemplate.send(any(ProducerRecord.class))).thenReturn(CompletableFuture.completedFuture(null));

        KafkaConsumerConfiguration configuration = new KafkaConsumerConfiguration();
        DeadLetterPublishingRecoverer recoverer = configuration.deadLetterPublishingRecoverer(dltTemplate, "orders");
        DefaultErrorHandler errorHandler = (DefaultErrorHandler) configuration
                .kafkaCommonErrorHandler(recoverer, 1L, 2.0d, 2L, 3);

        ConsumerRecord<String, String> poisonRecord = new ConsumerRecord<>("orders", 0, 15L, "key-4", "{");
        errorHandler.handleOne(
                new PoisonOrderMessageException("malformed JSON"),
                poisonRecord,
                mock(Consumer.class),
                mock(MessageListenerContainer.class));
        verify(dltTemplate, times(1)).send(any(ProducerRecord.class));

        TradeExecutorService tradeExecutorService = mock(TradeExecutorService.class);
        Acknowledgment acknowledgment = mock(Acknowledgment.class);
        OrderPlacedConsumer orderPlacedConsumer = new OrderPlacedConsumer(
                new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules(),
                tradeExecutorService,
                "orders",
                "trade-executor");

        String nextMessage = """
                {
                  \"eventId\": \"event-2\",
                  \"eventType\": \"ORDER_PLACED\",
                  \"eventTime\": \"2026-09-17T10:00:00Z\",
                  \"source\": \"trade-api\",
                  \"schemaVersion\": 1,
                  \"payload\": {
                    \"orderId\": 200,
                    \"accountId\": 1,
                    \"symbol\": \"ACME\",
                    \"side\": \"BUY\",
                    \"quantity\": 10,
                    \"receivedAt\": \"2026-09-17T10:00:00Z\"
                  }
                }
                """;

        orderPlacedConsumer.consume(nextMessage, acknowledgment);

        verify(tradeExecutorService, times(1)).execute(any());
        verify(acknowledgment, times(1)).acknowledge();
    }
}


