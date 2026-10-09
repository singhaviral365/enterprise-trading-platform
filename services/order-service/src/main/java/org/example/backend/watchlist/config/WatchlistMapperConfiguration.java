package org.example.backend.watchlist.config;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;

/**
 * Registers the watchlist module's MyBatis mapper. The application class scans only the shared
 * {@code org.example.backend.mapper} package, so the module scans its own.
 */
@Configuration
@MapperScan("org.example.backend.watchlist.mapper")
public class WatchlistMapperConfiguration {
}
