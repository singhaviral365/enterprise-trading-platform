# Customer Preferences and Personalization

Channel of Communication: Multiselect Component
- SMS
- Email
- In Application Notifications
- No Notifications

Currency: Single Dropdown Component
- Fixed Values
- EUR, USD, INR, etc. via dropdown
- During account creation - default currency of USD (already done)
- In settings page, can change anytime

Notification Categories - Multiselect Component
- Order Placement Status - REJECTED/FILLED
- Watchlist Alerts

Date Format - Single Dropdown Component
- DD/MM/YYYY
- MM/DD/YYYY
- DD-Month-YYYY
add more

Number Format - Single Dropdown Component
- US (100,000,000)
- INR (10,000,000)

AI/Not - Single Dropdown Component
- Yes - chatbot icon appears
- No - no chatbot

TO DO:

- DB design update - Preferences - multiple tables
- Settings screen in UI

# Customer Notifications

- In App Notifications
- SMS (TBD)
- Email (TBD)
- Watchlist + Price Alerts

## UI - In App

- Notification Bell Component on Sidebar, click to view notifications in a pop-up card that is scrollable
- Paginated
- Search Box (Pattern Matching)
- Filter by Notification Categories
- Default Sorted by Latest
- Only Unread Notifications
- When clicked on a notification, it is marked as read, and disappears after an hour or so
- Storing notifications in DB - so have read/unread flags

## Email

- Plan is to use MailHog
- sender email ID: noreply@etpteamriya.com
- send to registered email ID which is stored

## SMS

- MailHog alternative that is simple and easy to implement, OR maybe even a fully custom local implementation with SMS mocking - maybe a free version fo Twilio
- Plan out something that can be easily implemented, if nothing is concret and feasibly - leave it, email and in-app alone is fine.

We will dive deep into UI in-app notifications for now and work on it. Plan out the implementation for email and SMS such that it is DEV only - with MailHog and the SMS thing. Even when we eventually implement it, it should be in such a way that it is decoupled from a prod env, that it can be easily disabled in a different env, and that it works only in DEV/local. This is only for SMS and Email. So draft the plan for this in that way. If it's good for Email, you can implement it now itself, because Mailhog config is pretty easy and it should be decoupled well. It is SMS that we are not clear about yet, so draft plan for that.

## Watchlist Notifications

Price alerts for watchlist. 

- A target price that we can set (so a small update to DB)
- Need to be alerted when the price goes above/below target - can be anyone of those two. So maybe a dropdown for Above/Below, and a form field for desired target price. It can't be both Above and Below, potentially, so that should be good.
- Where are the prices fetched from to make the notifications? The market-data kafka, of course. 

So in-app notifications for order placement/filled, fetched from trade-events, and watchlist notifications, only ever consumed from market-data, for price alerts. And Email notifications.