package org.example.backend.notifications.email;

/** The mail server did not accept a message. The message never carries an address or a credential. */
public class EmailDeliveryException extends RuntimeException {

    public EmailDeliveryException(String message, Throwable cause) {
        super(message, cause);
    }
}
