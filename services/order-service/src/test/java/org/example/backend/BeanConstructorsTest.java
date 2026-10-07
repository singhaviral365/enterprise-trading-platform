package org.example.backend;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.stereotype.Component;

import java.lang.reflect.Constructor;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A bean with more than one constructor (a second one usually lets a test fix the clock) cannot be created by Spring
 * unless exactly one is marked {@code @Autowired}: start-up fails with "No default constructor found". Unit tests build
 * such classes with {@code new}, so they never notice. This scans every component in the application instead.
 */
class BeanConstructorsTest {

    @Test
    void everyBeanWithSeveralConstructorsMarksExactlyOne() throws ClassNotFoundException {
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false);
        // @Service, @Controller, @RestController, @Repository and @Configuration are all meta-annotated @Component.
        scanner.addIncludeFilter(new AnnotationTypeFilter(Component.class));

        List<String> problems = new ArrayList<>();
        for (BeanDefinition definition : scanner.findCandidateComponents("org.example.backend")) {
            Class<?> type = Class.forName(definition.getBeanClassName());
            Constructor<?>[] constructors = type.getDeclaredConstructors();
            if (constructors.length < 2) {
                continue;
            }
            long marked = Arrays.stream(constructors).filter(c -> c.isAnnotationPresent(Autowired.class)).count();
            if (marked != 1) {
                problems.add(type.getName() + " has " + constructors.length + " constructors, " + marked
                        + " marked @Autowired");
            }
        }

        assertTrue(problems.isEmpty(), () -> "Spring cannot choose a constructor for: " + problems);
    }
}
