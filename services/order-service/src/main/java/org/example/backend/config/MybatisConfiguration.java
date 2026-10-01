package org.example.backend.config;

import org.apache.ibatis.session.SqlSessionFactory;
import org.mybatis.spring.SqlSessionFactoryBean;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

import javax.sql.DataSource;

/**
 * Explicit MyBatis wiring for Spring Boot 4.
 * The current MyBatis starter version does not auto-register a SqlSessionFactory
 * under this project setup, so the mapper beans need manual session factory
 * and template configuration.
 */
@Configuration
public class MybatisConfiguration {

    @Bean
    @ConditionalOnMissingBean
    SqlSessionFactory sqlSessionFactory(
            DataSource dataSource,
            @Value("${mybatis.mapper-locations:classpath:mapper/*.xml}") String mapperLocations,
            @Value("${mybatis.type-aliases-package:}") String typeAliasesPackage) throws Exception {

        SqlSessionFactoryBean factoryBean = new SqlSessionFactoryBean();
        factoryBean.setDataSource(dataSource);
        factoryBean.setMapperLocations(
                new PathMatchingResourcePatternResolver().getResources(mapperLocations));

        if (!typeAliasesPackage.isBlank()) {
            factoryBean.setTypeAliasesPackage(typeAliasesPackage);
        }

        return factoryBean.getObject();
    }

    @Bean
    @ConditionalOnMissingBean
    SqlSessionTemplate sqlSessionTemplate(SqlSessionFactory sqlSessionFactory) {
        return new SqlSessionTemplate(sqlSessionFactory);
    }
}


