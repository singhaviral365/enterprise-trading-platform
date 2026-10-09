package org.example.backend.portfolio.config;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Registers the portfolio module's MyBatis mappers, and switches on scheduling for the nightly history job (the module
 * does not rely on another module having done so). The application class scans only the shared
 * {@code org.example.backend.mapper} package, so the module scans its own.
 */
@Configuration
@MapperScan("org.example.backend.portfolio.mapper")
@EnableScheduling
public class PortfolioMapperConfiguration {
}
