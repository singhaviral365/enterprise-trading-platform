package org.example.backend.notifications.config;

import org.example.backend.notifications.email.EmailSender;
import org.example.backend.notifications.gateway.NotificationGateway;
import org.example.backend.notifications.mapper.NotificationMapper;
import org.example.backend.notifications.service.NotificationRecorder;
import org.example.backend.preferences.resolve.PreferenceResolver;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;

import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.mockito.Mockito.mock;

/**
 * NotificationRecorder has two constructors (the second lets a test fix the clock). Spring creates it only if one is
 * marked for it; otherwise start-up fails with "No default constructor found". A plain unit test builds it with
 * {@code new}, so only a container can catch that.
 */
class NotificationRecorderBeanTest {

    @Test
    void springCanCreateTheRecorderDespiteItsSecondConstructor() {
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            context.registerBean(NotificationMapper.class, () -> mock(NotificationMapper.class));
            context.registerBean(PreferenceResolver.class, () -> mock(PreferenceResolver.class));
            context.registerBean(EmailSender.class, () -> mock(EmailSender.class));
            context.register(NotificationRecorder.class);
            context.refresh();

            assertInstanceOf(NotificationRecorder.class, context.getBean(NotificationGateway.class));
        }
    }
}
