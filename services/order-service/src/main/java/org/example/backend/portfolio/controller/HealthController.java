package org.example.backend.portfolio.controller;

import org.example.backend.portfolio.dto.HealthResponse;
import org.example.backend.portfolio.service.PortfolioHealth;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code GET /health} of {@code contracts/portfolio-api.yaml}. Needs no token (it is outside {@code /api/v1}) and always
 * answers {@code 200}: a failing dependency makes {@code status} {@code degraded}, it does not fail the response.
 */
@RestController
public class HealthController {

    private final PortfolioHealth health;

    public HealthController(PortfolioHealth health) {
        this.health = health;
    }

    @GetMapping("/health")
    public HealthResponse health() {
        return health.check();
    }
}
