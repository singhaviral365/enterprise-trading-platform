package org.example.trade_executor.config;

import org.example.backend.mapper.AccountMapper;
import org.example.backend.mapper.HoldingMapper;
import org.example.backend.mapper.InstrumentMapper;
import org.example.backend.mapper.OrderMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.Optional;

@Configuration
@Profile("fallback-mappers")
public class MapperFallbackConfiguration {

    @Bean
    public AccountMapper accountMapper() {
        return proxy(AccountMapper.class);
    }

    @Bean
    public HoldingMapper holdingMapper() {
        return proxy(HoldingMapper.class);
    }

    @Bean
    public InstrumentMapper instrumentMapper() {
        return proxy(InstrumentMapper.class);
    }

    @Bean
    public OrderMapper orderMapper() {
        return proxy(OrderMapper.class);
    }

    @SuppressWarnings("unchecked")
    private static <T> T proxy(Class<T> mapperType) {
        InvocationHandler handler = (Object proxy, Method method, Object[] args) -> {
            Class<?> returnType = method.getReturnType();
            if (Optional.class.equals(returnType)) {
                return Optional.empty();
            }
            if (returnType == boolean.class || returnType == Boolean.class) {
                return false;
            }
            if (returnType == int.class || returnType == Integer.class) {
                return 0;
            }
            if (returnType == long.class || returnType == Long.class) {
                return 0L;
            }
            if (returnType == double.class || returnType == Double.class) {
                return 0d;
            }
            if (returnType == float.class || returnType == Float.class) {
                return 0f;
            }
            return null;
        };

        return (T) Proxy.newProxyInstance(
                mapperType.getClassLoader(),
                new Class<?>[]{mapperType},
                handler);
    }
}

