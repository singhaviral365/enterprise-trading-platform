package org.example.backend.signals.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.example.backend.security.AuthContext;
import org.example.backend.signals.dto.ChatRequest;
import org.example.backend.signals.dto.ChatResponse;
import org.example.backend.signals.dto.SignalResponse;
import org.example.backend.signals.service.SignalService;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Trade signals for an instrument and the assistant that explains them. Both routes answer for the token's user only, and
 * neither can place an order.
 */
@RestController
@RequestMapping("/api/v1")
@Validated
public class SignalController {

    private final SignalService signals;

    public SignalController(SignalService signals) {
        this.signals = signals;
    }

    /**
     * @param lookbackPeriods calendar days of history: 90 (default), 180 or 365
     * @param format          {@code numeric} (default) for the numbers only, {@code narrative} to include an explanation
     */
    @GetMapping("/accounts/{accountId}/signals/{symbol}")
    public SignalResponse getSignal(
            @PathVariable("accountId") @Min(1) long accountId,
            @PathVariable("symbol") @Size(min = 1, max = 20) String symbol,
            @RequestParam(name = "lookbackPeriods", required = false) Integer lookbackPeriods,
            @RequestParam(name = "format", required = false, defaultValue = "numeric")
            @Pattern(regexp = "numeric|narrative") String format,
            HttpServletRequest httpServletRequest) {

        return signals.getSignal(
                AuthContext.requiredUserId(httpServletRequest),
                accountId,
                symbol,
                lookbackPeriods,
                "narrative".equals(format));
    }

    @PostMapping("/signals/chat")
    public ChatResponse chat(@Valid @RequestBody ChatRequest request, HttpServletRequest httpServletRequest) {
        return signals.chat(AuthContext.requiredUserId(httpServletRequest), request);
    }
}
