package org.example.backend.preferences.resolve;

/**
 * The one door other modules use to read a customer's preferences: a Java interface, called in-process, not an HTTP
 * route. The customer routes (a token and an account id in the path) are the only things on the wire, so there is no
 * endpoint a customer's token could use to read someone else's channel.
 *
 * <p>Callers depend on this interface and never on the preferences tables or mapper. Today the only caller is the
 * customer-notifications module, which asks for the alert preference of the account it is about to message.
 *
 * <p><b>It never fails and never returns null.</b> An account with nothing stored gets
 * {@link AlertPreference#DEFAULT}, and so does a call that cannot read the store: this sits on the path that tells a
 * customer about their own trade, so being slightly too chatty (an in-app message) is a better failure than telling
 * them nothing. That is a deliberate fail-open choice; a caller that must not guess can compare against
 * {@code DEFAULT} itself.
 */
public interface PreferenceResolver {

    /** How the account wants to be alerted. */
    AlertPreference resolveAlerts(long accountId);
}
