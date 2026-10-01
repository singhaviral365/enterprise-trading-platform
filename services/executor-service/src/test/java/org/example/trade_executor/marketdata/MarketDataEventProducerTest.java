package org.example.trade_executor.marketdata;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.trade_executor.client.LiveQuote;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.concurrent.CompletableFuture;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MarketDataEventProducerTest {

    @Mock
    private KafkaTemplate<String, String> kafkaTemplate;

    @Test
    void publishesMarketDataMessageKeyedBySymbol() {
        when(kafkaTemplate.send(anyString(), anyString(), anyString()))
                .thenReturn(CompletableFuture.completedFuture(null));

        MarketDataEventProducer producer = new MarketDataEventProducer(
                kafkaTemplate,
                new ObjectMapper(),
                "market-data",
                "trade-executor",
                1);

        producer.publish(new LiveQuote("AAPL", new BigDecimal("189.12")), OffsetDateTime.parse("2026-09-18T10:00:00Z"));

        verify(kafkaTemplate).send(anyString(), org.mockito.ArgumentMatchers.eq("AAPL"), anyString());
    }
}