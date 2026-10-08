# How the trade signal works, as a customer sees it

Status: **explainer**. A flow document: what the feature is for and how it behaves for the customer, with no code.
The technical version is `documentation/readme/SIGNALS.md`; this one has no code and tries to answer "what is this for and can I trust what it shows?".

## 1. In one paragraph

When you open an instrument on **Market data**, under the price chart there is a card called **Trade signal**. It reads the instrument's recent price history
and gives one of three readings: **BUY**, **SELL** or **HOLD**, with a **strength from 0 to 100**, the few numbers it is built from, and a short explanation in
plain words. It is a summary of what the chart is doing, not a recommendation. It never places an order and it says so beside every signal.

## 2. What it is for (the use case)

You are looking at an instrument and want a quick, consistent second look at its trend without drawing lines on a chart yourself:

- "Has this been generally rising or falling lately?"
- "Is it stretched (rose very fast) or beaten down (fell very fast)?"
- "How clear is the picture, or are the signs mixed?"

It helps you **decide where to look more closely**, and gives you words for what you are seeing. It does **not** tell you what to do, predict tomorrow's price, or
know anything about the company, the news or your finances.

## 3. What you see, step by step

1. Open **Market data** and click an instrument (or open one from your Portfolio). The detail slides in.
2. The **price card** shows today's price and change. Below it is the one-year price chart.
3. Under the chart the **Trade signal** card loads in a moment:
   - a coloured badge: **BUY** (green), **SELL** (red) or **HOLD** (neutral);
   - a **strength meter** ("Signal strength 78 / 100"; for HOLD it is labelled "Balance of the indicators");
   - four facts: **20-day average**, **50-day average**, **RSI (14)** with a word for where it sits (middle, overbought, oversold) and the **latest close**;
   - an **explanation** in a few sentences, labelled either "Written by the AI assistant" or "Standard explanation";
   - "As of <date>, from N trading days", and a warning if the price history could not be refreshed;
   - **How is this worked out?** (click to read the method) and the disclaimer.
4. **Optional chat:** if you switched on the **AI assistant** in Settings, you can tap a question ("Why this signal?", "What does the RSI tell me?", "How strong is it?",
   "What would change it?") or type your own, and the assistant answers about this signal. If you did not switch it on, the card says so and **nothing about you is sent to it**.
5. If the instrument has too little history (fewer than 50 trading days), the card says there is not enough data yet instead of guessing.

## 4. The ideas behind the numbers (no jargon)

The signal uses only **daily closing prices** (the last price of each trading day), over roughly the last three months. Three ingredients:

### 4.1 The 20-day and 50-day averages (the "trend")
A **moving average** is the average closing price over the last N trading days. It smooths out the day-to-day jitter so you can see the direction.

- The **20-day average** reacts quickly (about one month).
- The **50-day average** is slower (about two and a half months).

If the quick average is **above** the slow one, prices lately have been higher than the longer-run level: an **upward** trend. If it is below, a **downward** trend.
Think of it like a runner: if their last month is faster than their last quarter, they are speeding up.

### 4.2 The latest close vs the quick average ("is the price confirming it?")
If the latest close is **above** the 20-day average, today's price is also running above recent norms; below, it is running under them. This checks that the trend is still
showing up in the most recent price, not just in the averages.

### 4.3 RSI, the 14-day "momentum" gauge
RSI (Relative Strength Index) looks at the last 14 days and asks: **how big were the up days compared with the down days?**

```
average gain on up days   = 1.20
average loss on down days = 0.87
ratio                     = 1.20 / 0.87 = 1.38
RSI = 100 - 100 / (1 + 1.38) = 58
```

It lives between 0 and 100. Around 50 means balanced. **Above 70** is called overbought (rose very fast, often followed by a pause or pull-back); **below 30** is oversold
(fell very fast). The platform uses the standard method (Wilder's smoothing), checked against the published textbook example.

## 5. How the reading is decided

| Reading | Rule |
|---|---|
| **BUY** | the 20-day average is **above** the 50-day average **and** the latest close is **above** the 20-day average (trend up, and price agrees) |
| **SELL** | the 20-day average is **below** the 50-day average **and** the latest close is **below** the 20-day average (trend down, and price agrees) |
| **HOLD** | anything else: the signs disagree |

### Strength (0-100)
How **convincing** the reading is. For BUY or SELL it is half **trend** and half **momentum**:

- **Trend (up to 50 points):** how far apart the two averages are, as a share of the 50-day average. A gap of 3% or more earns the full 50; a smaller gap earns less.
- **Momentum (up to 50 points):** for a BUY, an RSI between 40 and 65 earns the full 50 (healthy, not stretched); below 40 earns less, and above 65 earns less again, because a price
  that has already shot up is more likely to cool off. For a SELL the same idea applies mirrored.

For **HOLD** the number means something different: **how balanced** the indicators are. An RSI right at 50 scores 100 (perfectly balanced); the further from 50, the lower.

### A worked example
> 20-day average 150.50, 50-day average 148.00, latest close 153.20, RSI 58.
> - Averages: 150.50 is above 148.00, and 153.20 is above 150.50 -> **BUY**.
> - Trend points: the gap is (150.50 - 148.00) / 148.00 = 1.69%. Full marks need 3%, so 1.69 / 3 = 56% of 50 = **28**.
> - Momentum points: RSI 58 is inside 40-65 -> the full **50**.
> - Strength = 28 + 50 = **78 / 100**.
>
> Same instrument another week: 20-day average 149.00 is **below** the 50-day 150.50, but the latest close 151.00 is **above** the 20-day -> the signs disagree -> **HOLD**, and with RSI 46 the balance is
> 100 - 2 x |46 - 50| = **92**: "the indicators are nicely balanced", not "a strong signal to do nothing".

## 6. The explanation and the chat (the AI part)

- **The explanation** under the numbers is written in plain words. If you turned the AI assistant on, a language model writes it (labelled "Written by the AI assistant"); if you did not, or the
  assistant is busy or unavailable, the platform's own template is used (labelled "Standard explanation"). The numbers are the same either way.
- **What the assistant is told:** only the instrument's symbol, the signal's numbers, and how many units you hold of **that instrument** and their average cost. **Not** your name, email, account number, balance, orders or other holdings.
- **What it must not do:** tell you to buy, sell or hold; predict a price; imply a return. It has no tools and cannot place orders; it can only produce text. Your own words are treated as a question, never as instructions.
- **Limits:** the free service allows a limited number of questions a minute; if it is busy, a chat answer says to try again shortly (explanations quietly fall back to the standard wording).

## 7. How it relates to the rest of the platform

| Feature | Relationship |
|---|---|
| **Order ticket (Buy/Sell)** | The signal never fills it in and never places an order. You decide |
| **Strategies** | Independent. A strategy trades on a **price level you choose**, not on this signal |
| **Watchlist and alerts** | Independent today (an idea for later: alert when a signal changes) |
| **Portfolio** | Independent. The signal is about an instrument, not your holdings (the only personal input to the chat is your position in that one instrument) |

## 8. Honest limits (read these before relying on it)

- **Backward-looking.** Every input is a past price. Trends continue until they do not.
- **Daily closes only.** It does not react to what happened an hour ago, and it does not see news, earnings, the economy or other instruments.
- **Simple by design.** Two moving averages and one momentum gauge: easy to check by hand, but they lag, and sideways markets give mixed or false readings. A BUY is not a promise of a rise.
- **Needs enough history.** At least 50 trading days; newer instruments show "not enough price history".
- **It can be slightly out of date.** Results are cached for a few minutes and prices come from a shared data provider with a daily quota; the card shows the "as of" date and warns when the data could not be refreshed.
- **Not advice.** It is information about a chart. Whether a real launch needs compliance review is a business decision.

## 9. Quick glossary

| Word | Meaning |
|---|---|
| Close | The last price of a trading day |
| Moving average (SMA) | The plain average of the last N closes |
| RSI | A 0-100 gauge of how strong recent rises were compared with recent falls |
| Overbought / oversold | RSI above 70 / below 30: unusually fast rise / fall |
| Strength | How convincing the reading is (or, for HOLD, how balanced) |
| Stale | The data could not be refreshed, so what you see may be out of date |
