package org.example.backend.entities;

import org.example.backend.enums.RiskProfile;

import java.time.LocalDate;
import java.util.Objects;

public class Client {

    private final int clientId;
    private final String clientName;
    private final String email;
    private final String passwordHash;
    private final String phoneNo;
    private final LocalDate dateOfBirth;
    private final LocalDate joinDate;
    private final RiskProfile riskProfile;
    private final int advisorId;

    public Client(
            int clientId,
            String clientName,
            String email,
            String passwordHash,
            String phoneNo,
            LocalDate dateOfBirth,
            LocalDate joinDate,
            RiskProfile riskProfile,
            int advisorId) {

        if (clientId < 1) {
            throw new IllegalArgumentException(
                    "Client ID must be at least 1"
            );
        }

        if (clientName == null || clientName.isBlank()) {
            throw new IllegalArgumentException(
                    "Client name is required"
            );
        }

        if (email == null || email.isBlank()) {
            throw new IllegalArgumentException(
                    "Email is required"
            );
        }

        if (passwordHash == null || passwordHash.isBlank()) {
            throw new IllegalArgumentException(
                    "Password hash is required"
            );
        }

        if (phoneNo == null || phoneNo.isBlank()) {
            throw new IllegalArgumentException(
                    "Phone number is required"
            );
        }

        Objects.requireNonNull(
                dateOfBirth,
                "Date of birth is required"
        );

        Objects.requireNonNull(
                joinDate,
                "Join date is required"
        );

        if (joinDate.isBefore(dateOfBirth)) {
            throw new IllegalArgumentException(
                    "Join date cannot be before date of birth"
            );
        }

        Objects.requireNonNull(
                riskProfile,
                "Risk profile is required"
        );

        if (advisorId < 1) {
            throw new IllegalArgumentException(
                    "Advisor ID must be at least 1"
            );
        }

        this.clientId = clientId;
        this.clientName = clientName;
        this.email = email;
        this.passwordHash = passwordHash;
        this.phoneNo = phoneNo;
        this.dateOfBirth = dateOfBirth;
        this.joinDate = joinDate;
        this.riskProfile = riskProfile;
        this.advisorId = advisorId;
    }

    public int getClientId() {
        return clientId;
    }

    public String getClientName() {
        return clientName;
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public String getPhoneNo() {
        return phoneNo;
    }

    public LocalDate getDateOfBirth() {
        return dateOfBirth;
    }

    public LocalDate getJoinDate() {
        return joinDate;
    }

    public RiskProfile getRiskProfile() {
        return riskProfile;
    }

    public int getAdvisorId() {
        return advisorId;
    }
}
