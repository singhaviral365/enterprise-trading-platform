package org.example.backend.portfolio.ledger;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Brings the ledger up to date once the application is ready: history from before this module existed gets booked.
 * A failure is logged and never stops the application starting; the portfolio route reconciles an account on read anyway.
 */
@Component
@ConditionalOnProperty(name = "portfolio.reconcile.on-startup", havingValue = "true", matchIfMissing = true)
public class StartupReconciliation {

    private static final Logger LOGGER = LoggerFactory.getLogger(StartupReconciliation.class);

    private final RealisedPnlReconciler reconciler;

    public StartupReconciliation(RealisedPnlReconciler reconciler) {
        this.reconciler = reconciler;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        try {
            int booked = reconciler.reconcileAll();
            LOGGER.info("Realised profit and loss reconciled at start-up: {} sale(s) booked", booked);
        } catch (RuntimeException ex) {
            LOGGER.warn("Realised profit and loss could not be reconciled at start-up; it will be done when each account is read", ex);
        }
    }
}
