package org.example.trade_executor.strategy.config;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;

/**
 * Registers the strategy worker's MyBatis mapper. The application class scans only the shared
 * {@code org.example.backend.mapper} package, so the module scans its own.
 */
@Configuration
@MapperScan("org.example.trade_executor.strategy.mapper")
public class StrategyMapperConfiguration {
}
