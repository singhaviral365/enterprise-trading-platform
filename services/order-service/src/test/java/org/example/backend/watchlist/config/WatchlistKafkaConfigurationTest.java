package org.example.backend.watchlist.config;

import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.example.backend.watchlist.exceptions.PoisonQuoteMessageException;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;

import java.util.concurrent.CompletableFuture;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WatchlistKafkaConfigurationTest {

    private final WatchlistKafkaConfiguration configuration = new WatchlistKafkaConfiguration();

    @Test
    void consumerUsesTheModulesOwnGroupAndManualOffsetCommits() {
        ConsumerFactory<String, String> factory =
                configuration.watchlistConsumerFactory("localhost:9092", "watchlist-prices");

        assertEquals("watchlist-prices", factory.getConfigurationProperties().get(ConsumerConfig.GROUP_ID_CONFIG));
        assertFalse(factory.isAutoCommit());
    }

    @Test
    @SuppressWarnings("unchecked")
    void aRecordThatCannotBeProcessedIsPublishedToTheMarketDataDeadLetterTopic() {
        KafkaTemplate<String, String> template = mock(KafkaTemplate.class);
        when(template.send(any(ProducerRecord.class))).thenReturn(CompletableFuture.completedFuture(null));
        DeadLetterPublishingRecoverer recoverer = configuration.watchlistDeadLetterRecoverer(template, "market-data");

        // Source partition 5 exists on market-data (6 partitions) but not on market-data.DLT (1).
        ConsumerRecord<String, String> poison = new ConsumerRecord<>("market-data", 5, 42L, "AAPL", "garbage");
        recoverer.accept(poison, new PoisonQuoteMessageException("malformed JSON"));

        ArgumentCaptor<ProducerRecord<String, String>> sent = ArgumentCaptor.forClass(ProducerRecord.class);
        verify(template).send(sent.capture());
        assertEquals("market-data.DLT", sent.getValue().topic());
        assertNull(sent.getValue().partition());
        assertEquals("garbage", sent.getValue().value());
    }
}
