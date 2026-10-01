package org.example.trade_executor;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@MapperScan("org.example.backend.mapper")
@EnableScheduling
public class TradeExecutorApplication {

    public static void main(String[] args) {
        SpringApplication.run(TradeExecutorApplication.class, args);
    }
}