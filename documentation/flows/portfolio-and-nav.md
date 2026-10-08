# How the Portfolio page and the NAV curve work, as a customer sees it

Status: **explainer**. A flow document: what the feature is for and how it behaves for the customer, with no code. Technical detail: `documentation/readme/PORTFOLIO_PLAN.md` and
`contracts/portfolio-api.yaml` / `contracts/portfolio-performance-api.yaml`.

## 1. In one paragraph

**Portfolio** answers three questions: *What do I own right now and what is it worth?*, *Am I up or down, and how much of that is already in my pocket?*, and
*How has my account actually performed over time, fairly?* The first two come from live prices; the third is the **NAV curve**, which measures performance the way
a fund does, so that adding or removing money cannot make you look better or worse than you really did.

## 2. What you see

1. **Summary tiles** at the top: **Total value**, **Cash**, **Market value**, **Unrealised P&L**, **Realised P&L**, **Today's P&L**.
2. A line "**Prices as of 14:05**", a **Delayed** marker if prices are not fresh, and a notice if some holdings could not be priced.
3. The **performance curve** (NAV) with range buttons (1M, 3M, 6M, 1Y, All), an optional **benchmark** to compare against, and small tiles for return, profit, drawdown, best and worst day.
4. **Holdings**: cards or a table of each instrument with quantity, average cost, price, market value, unrealised and today's change; click one for its buys and to trade it.
5. **Profit and loss breakdown** by instrument, with a date filter for realised results.
6. **Daily statements**: one row per closed day.

## 3. The holdings maths in plain words

Every number is in **your account's currency** (an instrument quoted in another currency is converted at the current rate).

| Term | Meaning | Formula |
|---|---|---|
| **Quantity** | How many units you hold | from your orders |
| **Average cost** | What you paid per unit on average, across all your buys | updated at each buy; **a sell does not change it** |
| **Cost basis** | What your current holding cost you | quantity x average cost |
| **Price** | The latest quote | live, cached for a short time |
| **Market value** | What the holding is worth right now | quantity x price |
| **Unrealised P&L** | The profit or loss **on paper**, if you sold now | market value - cost basis |
| **Realised P&L** | The profit or loss you have **already locked in** by selling | sum over sales of (sale price - average cost at the time) x units sold |
| **Today's P&L** | How much your holdings moved today | quantity x (price now - previous close) |
| **Total value** | Everything the account is worth | cash + market value of holdings |

### A worked example
You start with **10,000** in cash.
1. Buy 10 AAPL at **100** -> cost 1,000. Buy 10 more at **120** -> cost 1,200. You hold 20 at an average cost of **110** (2,200 in total).
2. Sell 5 at **130** -> you receive 650. **Realised P&L = (130 - 110) x 5 = 100.** You now hold 15, **average cost still 110**, cost basis 15 x 110 = **1,650**.
3. Cash = 10,000 - 2,200 + 650 = **8,450**.
4. AAPL is now **140**: market value 15 x 140 = **2,100**; **unrealised P&L = 2,100 - 1,650 = 450** (+27.3%).
5. Its previous close was 138: **today's P&L = 15 x (140 - 138) = 30** (+1.45%).
6. **Total value = 8,450 + 2,100 = 10,550**, which is exactly your **10,000 start + 100 realised + 450 unrealised**.

Realised profit is **booked when you sell** and never recalculated from later prices: if AAPL doubles tomorrow, the 100 you banked is still 100.

### Fresh, delayed, partial
- **Delayed:** the price is older than normal or could not be refreshed. You still see the last known number, clearly marked, rather than nothing.
- **Partial:** some holdings could not be priced (or converted to your currency). Totals then cover only the priced ones and the page tells you ("2 holdings could not be priced, so totals are understated").
- **Unavailable:** if nothing can be priced the page falls back to your holdings at cost, with a retry, never an empty screen.
- **Realised P&L still shows** while prices are down, because it does not need a live price.

## 4. Why the NAV curve exists

Suppose your account is worth 10,000 and a month later 15,000. Did you do well? It depends: if you **added 5,000** of your own money, you did not make a cent. The total value
cannot tell the difference between "the market made me money" and "I put more in". The **NAV** (net asset value) solves this the same way a mutual fund does.

### The idea
- Imagine your account as a small fund made of **units**. At the start, 1 unit is worth **1,000** (the NAV).
- The **NAV = total value / number of units**.
- Money you put in **buys new units at the current NAV** (and money taken out cancels units), so it **cannot change the NAV**.
- Only the **market** changes the NAV. So the NAV curve is the pure performance of your decisions.

### Worked example
| Day | Event | Value | Units | NAV |
|---|---|---|---|---|
| Start | Account opens with 10,000 | 10,000 | 10 | **1,000** |
| Later | Market rises 4% | 10,400 | 10 | **1,040** (+4.0%) |
| Later | You add 5,000 at NAV 1,040 -> buys 4.81 units | 15,400 | 14.81 | **1,040** (no gain from depositing) |
| Next | Market adds another 1,000 | 16,400 | 14.81 | **1,108** (+10.8% since the start) |

A plain "value went from 10,000 to 16,400" would say +64%. The NAV says **+10.8%**, which is what your investing actually did.
(The platform has no deposit feature today: your starting balance is the only money in, and it is **derived** from your order history. The NAV is built so that deposits and withdrawals will behave correctly whenever they are added.)

## 5. What the curve and tiles show

| Item | Plain meaning |
|---|---|
| **The curve** | Your NAV over the chosen range, shown as % change from the start of that range |
| **Return** | How much the NAV changed over the range |
| **Profit (P&L)** | How much your account's value changed over the range, **excluding money you put in or took out** |
| **Annualised return** | The return scaled to a year, shown only for ranges longer than a year (shorter ranges would give misleading numbers) |
| **Max drawdown** | The worst fall from a peak: if the NAV went 1,100 -> 990 before recovering, the drawdown is -10%. A feel for how rough the ride was |
| **Best / worst day** | The biggest daily rise and fall |
| **Benchmark** | An optional comparison (for example SPY, a broad-market tracker), rebased to 1,000 on your first day so the two lines start together |
| **Daily statements** | One stored row per closed day: value, the day's P&L, cumulative realised, unrealised |

## 6. How the history is built (what happens behind the screen)

1. **Every night** a job writes a **statement for each closed day** for each account: cash, the value of each holding at that day's close, cost basis, unrealised and cumulative realised profit, the day's P&L, units and NAV.
2. Closed days are **stored and do not change**, except the last few days, which are re-checked in case the data provider replaces a placeholder price with the real one.
3. **Live figures are never stored**: Today's P&L, current unrealised and so on are computed from the latest quote when you open the page.
4. **First visit:** if your history has not been built yet, the page says it is **building** (the server answers "building, ask again shortly") and fills in when ready. The history starts on the day your account opened, flat at 1,000 until your first trade.
5. **Estimated days:** if a day had to use a placeholder price, a missing price (the holding carried at cost) or today's exchange rate, it is marked **estimated** so you do not read it as exact.
6. **An empty account** pauses the curve rather than showing nonsense.

## 7. How it is beneficial to you

- You can see **what you own and what it is worth** in one place, with honest freshness labels.
- You can tell **luck on paper from money banked** (unrealised vs realised).
- You get a **fair performance number** that deposits and withdrawals cannot distort, and a benchmark to put it in context.
- **Drawdown, best and worst day** tell you about the risk you took, not only the reward.
- Daily statements give you a record you can check against your own order history.

## 8. Honest limits

- Today's P&L measures your **current holdings** from yesterday's close; a position bought today is measured from the previous close, not from your purchase price. The exact day figure for closed days is the stored statement.
- Prices come from a shared provider with a daily quota; they can be delayed, and the page says when they are.
- Currency conversion uses the rate on the day it is computed, so a multi-currency account can differ slightly from a day-by-day exact rate; such days are marked estimated.
- Past performance is not a forecast.

## 9. Glossary

| Word | Meaning |
|---|---|
| NAV | Net asset value: the price of one "unit" of your account, 1,000 on day one |
| Unit | A slice of your account; deposits create units, withdrawals cancel them |
| Cost basis | What your current holdings cost |
| Realised / unrealised | Locked in by selling / on paper only |
| Drawdown | Fall from the highest point so far |
| Benchmark | A reference market line to compare with |
| Stale / delayed | The data is older than normal |
