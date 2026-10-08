package org.example.backend.strategy.config;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Registers the strategy module's MyBatis mapper and its scheduler. The application class scans only the shared
 * {@code org.example.backend.mapper} package, so the module scans its own.
 */
@Configuration
@MapperScan("org.example.backend.strategy.mapper")
@EnableScheduling
public class StrategyMapperConfiguration {
}
