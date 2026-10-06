package org.example.backend.preferences.config;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;

/**
 * Registers the preferences module's MyBatis mapper. The application class scans only the shared
 * {@code org.example.backend.mapper} package, so the module scans its own.
 */
@Configuration
@MapperScan("org.example.backend.preferences.mapper")
public class PreferencesMapperConfiguration {
}
