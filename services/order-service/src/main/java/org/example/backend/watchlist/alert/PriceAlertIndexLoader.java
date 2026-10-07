package org.example.backend.watchlist.alert;

import org.example.backend.watchlist.mapper.WatchlistMapper;
import org.example.backend.watchlist.model.AlertWatch;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.List;

/** Fills {@link PriceAlertIndex} from the database once the application is up, so armed alerts survive a restart. */
@Component
public class PriceAlertIndexLoader {

    private static final Logger LOGGER = LoggerFactory.getLogger(PriceAlertIndexLoader.class);

    private final WatchlistMapper mapper;
    private final PriceAlertIndex index;

    public PriceAlertIndexLoader(WatchlistMapper mapper, PriceAlertIndex index) {
        this.mapper = mapper;
        this.index = index;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void load() {
        try {
            index.clear();
            List<AlertWatch> active = mapper.selectActiveAlerts();
            active.forEach(index::put);
            LOGGER.info("Loaded {} active price alerts into the index", active.size());
        } catch (RuntimeException ex) {
            LOGGER.error("Could not load the active price alerts; none will fire until the service is restarted", ex);
        }
    }
}
