package org.example.trade_executor.config;

import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.serialization.StringSerializer;
import org.example.backend.dto.kafka.KafkaEventEnvelope;
import org.example.backend.events.OrderPlacedMessage;
import org.example.trade_executor.events.OrderResolvedMessage;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;
import org.springframework.kafka.support.serializer.JacksonJsonSerializer;

import java.util.HashMap;
import java.util.Map;

@Configuration
public class KafkaProducerConfiguration {

    @Bean
    public ProducerFactory<String, KafkaEventEnvelope<OrderPlacedMessage>> orderPlacedProducerFactory(
            @Value("${spring.kafka.bootstrap-servers:localhost:9092}") String bootstrapServers,
            @Value("${spring.kafka.producer.acks:all}") String acks,
            @Value("${spring.kafka.producer.retries:2147483647}") int retries,
            @Value("${spring.kafka.producer.properties.enable.idempotence:true}") boolean idempotence,
            @Value("${spring.kafka.producer.properties.max.in.flight.requests.per.connection:5}") int maxInFlight) {

        return new DefaultKafkaProducerFactory<>(producerProperties(
                bootstrapServers,
                acks,
                retries,
                idempotence,
                maxInFlight));
    }

    @Bean
    public ProducerFactory<String, KafkaEventEnvelope<OrderResolvedMessage>> orderResolvedProducerFactory(
            @Value("${spring.kafka.bootstrap-servers:localhost:9092}") String bootstrapServers,
            @Value("${spring.kafka.producer.acks:all}") String acks,
            @Value("${spring.kafka.producer.retries:2147483647}") int retries,
            @Value("${spring.kafka.producer.properties.enable.idempotence:true}") boolean idempotence,
            @Value("${spring.kafka.producer.properties.max.in.flight.requests.per.connection:5}") int maxInFlight) {

        return new DefaultKafkaProducerFactory<>(producerProperties(
                bootstrapServers,
                acks,
                retries,
                idempotence,
                maxInFlight));
    }

    @Bean
    public ProducerFactory<String, String> deadLetterProducerFactory(
            @Value("${spring.kafka.bootstrap-servers:localhost:9092}") String bootstrapServers,
            @Value("${spring.kafka.producer.acks:all}") String acks,
            @Value("${spring.kafka.producer.retries:2147483647}") int retries,
            @Value("${spring.kafka.producer.properties.enable.idempotence:true}") boolean idempotence,
            @Value("${spring.kafka.producer.properties.max.in.flight.requests.per.connection:5}") int maxInFlight) {

        Map<String, Object> producerProperties = new HashMap<>(producerProperties(
                bootstrapServers,
                acks,
                retries,
                idempotence,
                maxInFlight));
        producerProperties.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        return new DefaultKafkaProducerFactory<>(producerProperties);
    }

    private static Map<String, Object> producerProperties(
            String bootstrapServers,
            String acks,
            int retries,
            boolean idempotence,
            int maxInFlight) {
        Map<String, Object> producerProperties = new HashMap<>();
        producerProperties.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        producerProperties.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        producerProperties.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JacksonJsonSerializer.class);
        producerProperties.put(ProducerConfig.ACKS_CONFIG, acks);
        producerProperties.put(ProducerConfig.RETRIES_CONFIG, retries);
        producerProperties.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, idempotence);
        producerProperties.put(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, maxInFlight);

        return producerProperties;
    }

    @Bean
    public KafkaTemplate<String, KafkaEventEnvelope<OrderPlacedMessage>> orderPlacedKafkaTemplate(
            ProducerFactory<String, KafkaEventEnvelope<OrderPlacedMessage>> orderPlacedProducerFactory) {

        return new KafkaTemplate<>(orderPlacedProducerFactory);
    }

    @Bean
    public KafkaTemplate<String, KafkaEventEnvelope<OrderResolvedMessage>> orderResolvedKafkaTemplate(
            ProducerFactory<String, KafkaEventEnvelope<OrderResolvedMessage>> orderResolvedProducerFactory) {

        return new KafkaTemplate<>(orderResolvedProducerFactory);
    }

    @Bean
    public KafkaTemplate<String, String> deadLetterKafkaTemplate(
            ProducerFactory<String, String> deadLetterProducerFactory) {
        return new KafkaTemplate<>(deadLetterProducerFactory);
    }
}



