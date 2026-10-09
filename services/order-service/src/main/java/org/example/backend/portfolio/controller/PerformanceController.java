package org.example.backend.portfolio.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.example.backend.portfolio.dto.PerformanceBuilding;
import org.example.backend.portfolio.dto.PerformanceResponse;
import org.example.backend.portfolio.performance.PerformanceService;
import org.example.backend.security.AuthContext;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.Optional;

/**
 * {@code GET /api/v1/portfolio/{accountId}/performance} of {@code contracts/portfolio-performance-api.yaml}: the closed-day
 * history and NAV curve. {@code 200} with the history, or {@code 202} {@code {"status":"building"}} the first time, while it is
 * built in the background. Owner-only, like every portfolio route.
 */
@RestController
@RequestMapping("/api/v1/portfolio/{accountId}")
public class PerformanceController {

    private final PerformanceService performance;

    public PerformanceController(PerformanceService performance) {
        this.performance = performance;
    }

    @GetMapping("/performance")
    public ResponseEntity<?> performance(
            @PathVariable("accountId") long accountId,
            @RequestParam(name = "from", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(name = "to", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(name = "benchmark", required = false) String benchmark,
            HttpServletRequest request) {

        Optional<PerformanceResponse> history =
                performance.curve(AuthContext.requiredUserId(request), accountId, from, to, benchmark);
        return history.<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.ACCEPTED).body(PerformanceBuilding.building()));
    }
}
