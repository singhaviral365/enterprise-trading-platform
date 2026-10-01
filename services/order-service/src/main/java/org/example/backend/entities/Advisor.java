package org.example.backend.entities;

import java.time.LocalDate;
import java.util.Objects;

public class Advisor {

    private final int advisorId;
    private final String advisorName;
    private final String email;
    private final String passwordHash;
    private final LocalDate hireDate;

    public Advisor(
            int advisorId,
            String advisorName,
            String email,
            String passwordHash,
            LocalDate hireDate) {

        // Advisor ID must be at least 1
        if (advisorId < 1) {
            throw new IllegalArgumentException(
                    "Advisor ID must be at least 1"
            );
        }

        // Advisor name cannot be null or blank
        if (advisorName == null || advisorName.isBlank()) {
            throw new IllegalArgumentException(
                    "Advisor name is required"
            );
        }

        // Email cannot be null or blank
        if (email == null || email.isBlank()) {
            throw new IllegalArgumentException(
                    "Email is required"
            );
        }

        // Password hash cannot be null or blank
        if (passwordHash == null || passwordHash.isBlank()) {
            throw new IllegalArgumentException(
                    "Password hash is required"
            );
        }

        // Hire date cannot be null
        Objects.requireNonNull(
                hireDate,
                "Hire date is required"
        );

        // Assign validated values
        this.advisorId = advisorId;
        this.advisorName = advisorName;
        this.email = email;
        this.passwordHash = passwordHash;
        this.hireDate = hireDate;
    }

    public int getAdvisorId() {
        return advisorId;
    }

    public String getAdvisorName() {
        return advisorName;
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public LocalDate getHireDate() {
        return hireDate;
    }
}
