package org.example.backend.preferences.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import org.example.backend.preferences.dto.PreferencesResponse;
import org.example.backend.preferences.dto.UpdatePreferencesRequest;
import org.example.backend.preferences.service.PreferencesService;
import org.example.backend.security.AuthContext;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The customer's own settings. Customers reach these routes with their token; the in-process
 * {@code PreferenceResolver} that other modules use is deliberately not a route.
 */
@RestController
@RequestMapping("/api/v1/accounts/{accountId}/preferences")
@Validated
public class PreferencesController {

    private final PreferencesService preferencesService;

    public PreferencesController(PreferencesService preferencesService) {
        this.preferencesService = preferencesService;
    }

    @GetMapping
    public PreferencesResponse getPreferences(
            @PathVariable("accountId") @Min(1) long accountId,
            HttpServletRequest httpServletRequest) {

        long userId = AuthContext.requiredUserId(httpServletRequest);
        return preferencesService.get(userId, accountId);
    }

    @PutMapping
    public PreferencesResponse replacePreferences(
            @PathVariable("accountId") @Min(1) long accountId,
            @Valid @RequestBody UpdatePreferencesRequest request,
            HttpServletRequest httpServletRequest) {

        long userId = AuthContext.requiredUserId(httpServletRequest);
        return preferencesService.update(userId, accountId, request);
    }
}
