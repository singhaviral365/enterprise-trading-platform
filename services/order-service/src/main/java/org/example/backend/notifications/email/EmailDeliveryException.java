package org.example.backend.notifications.email;

/**
 * The mail server did not accept a message. The message never carries an address or a credential. {@code permanent} says that trying
 * again cannot help (the server refused the address for good), so the delivery is failed at once instead of being retried.
 */
public class EmailDeliveryException extends RuntimeException {

    private final boolean permanent;

    public EmailDeliveryException(String message, Throwable cause) {
        this(message, cause, false);
    }

    public EmailDeliveryException(String message, Throwable cause, boolean permanent) {
        super(message, cause);
        this.permanent = permanent;
    }

    public boolean isPermanent() {
        return permanent;
    }
}
