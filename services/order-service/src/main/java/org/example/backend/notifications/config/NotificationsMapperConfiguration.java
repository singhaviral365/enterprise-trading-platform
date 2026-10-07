package org.example.backend.notifications.config;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Registers the notifications module's MyBatis mapper, and switches on scheduling for its email dispatcher.
 * The application class scans only the shared {@code org.example.backend.mapper} package, so the module scans its own.
 */
@Configuration
@MapperScan("org.example.backend.notifications.mapper")
@EnableScheduling
public class NotificationsMapperConfiguration {
}
