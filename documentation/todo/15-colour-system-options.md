# 15 · Colour system: three alternatives to the green primary

Status: **proposal for a decision**. Nothing is changed. Each option is a **complete replacement** of the colour tokens (light and dark), not a tweak.

## 1. What we have, and the one thing worth fixing

The design system is already token-driven: components use `var(--token)`, and the only file that defines colour values is `styles.css` (`:root` for light, `:root[data-theme="dark"]` for dark).
That is what makes a full re-skin cheap: **change the two token blocks, not the components.**

Today's palette is an emerald family. The point worth fixing in any re-skin is that **one green does two jobs**:

| Token group | Today (light / dark) | Meaning it carries |
|---|---|---|
| `--accent-primary-*` | `#047857` / `#34D399` | The brand: primary buttons, links, selected rows, focus |
| `--status-success-*` | `#047857` / `#34D399` | **Gain, up, filled, success** |

They are the same colour, so a primary "Create strategy" button looks identical to a profit figure, "Buy" and "Sell" both use the brand colour, and a selected row looks like "good news".
On a trading platform, **green and red should be reserved for money moving up and down**. Moving the brand to another hue gives green/red back their exact meaning, which is the real usability gain of this exercise.

### Rules all three options follow
1. **Gain = green, loss = red, in every option** (`--status-success-*`, `--status-error-*`, the green/red mono ramps). They are semantic, not brand, and they stay recognisable.
2. **The brand colour must not look like gain, loss or warning.** Where a new brand hue crowds an existing status colour, that status colour is moved (called out per option).
3. **WCAG AA by construction**: every text/background pair below was checked (ratios listed); white or near-black text on the primary, brand colour as link text on the page background, subtle text on all surfaces.
4. Light and dark are designed as a pair (dark is not an inversion): the dark theme uses lighter, slightly desaturated brand tones with dark text on them, as today.
5. No new token names are needed; no component should hold a colour value (a few exceptions to clean up are listed in section 5).

## 2. The three options at a glance

| | **A. Sapphire** | **B. Ultraviolet** | **C. Graphite and Brass** |
|---|---|---|---|
| Brand hue | Deep blue | Violet | Brass / gold on warm graphite |
| Personality | Institutional, calm, trustworthy (retail brokers, banks) | Modern fintech, distinctive, a little bold | Premium, private-bank, "terminal" feel |
| Neutrals | Cool blue-slate | Faintly violet slate | Warm graphite and stone |
| Closest to today | Closest (same cool slate family) | Same neutrals, new hue | Furthest (warm neutrals) |
| Risk | Blue is the most common brokerage colour: safe, less memorable | Violet can read as "crypto/fintech startup" to some audiences | Brass sits near amber warnings: needs the status colours moved and care with icons |
| Info colour must move to | Sky/cyan (blue is now the brand) | Sky/cyan | Sky/cyan, **and warning moves to orange** |

## 3. Option A: Sapphire

*Navy-blue brand on cool slate. Reads as an established, serious institution; gain and loss colours pop against it because nothing else on the page is saturated.*

| Token | Light | Dark |
|---|---|---|
| `--surface-background` | `#F5F7FB` | `#070B16` |
| `--surface-background-bright` | `#FFFFFF` | `#0E1424` |
| `--surface-container-background` | `#ECF0F8` | `#151C2F` |
| `--surface-container-background-low` | `#F8FAFD` | `#0E1424` |
| `--surface-container-background-high` | `#FFFFFF` | `#1B2440` |
| `--surface-foreground` | `#0B1B3A` | `#E6EBF7` |
| `--surface-foreground-subtle` | `#55627A` | `#98A4BF` |
| `--surface-line` | `#8A96AD` | `#46506B` |
| `--surface-line-subtle` | `#E1E7F2` | `#232C45` |
| `--surface-foreground-link` / `-interaction` | `#1D4ED8` / `#1E3A8A` | `#8FB0FF` / `#BFD1FF` |
| `--accent-primary-background` / `-interaction` | `#1D4ED8` / `#1E40AF` | `#7AA2FF` / `#A3BFFF` |
| `--accent-primary-foreground` | `#FFFFFF` | `#06122E` |
| `--accent-primary-container-background` | `#EAF0FF` | `#12234D` |
| Status success / error / warning | unchanged (green `#047857`, red `#DC2626`, amber `#B45309` in light; green `#34D399`, red `#F87171`, amber `#FBBF24` in dark) | |
| Status info (moves off blue) | bg `#0369A1`, container `#E0F2FE`, text `#075985`, line `#BAE6FD` | bg `#38BDF8`, container `#0B2433`, text `#7DD3FC`, line `#1E5A7A` |
| `--accent-gradient` | `135deg #1D4ED8 -> #1E3A8A` | `135deg #5B84F0 -> #3B5FD0` (dark text kept off gradients) |
| `--hero-gradient` | `135deg #1E3A8A, #1D4ED8 45%, #0369A1` | `135deg #1B2C66, #2447B5 45%, #0B5A86` |
| `--page-glow` | blue `rgb(29 78 216 / .08)` + sky `rgb(14 165 233 / .06)` | same hues at `.14` / `.10` |
| Categorical 1-10 | blue `#4F7DF3`, teal `#14B8A6`, amber `#F59E0B`, violet `#A78BFA`, pink `#F472B6`, sky `#38BDF8`, lime `#84CC16`, rose `#FB7185`, slate `#94A3B8`, orange `#FB923C` | same (mid-tones work on both) |
| Mono ramps | "mono-blue" becomes the **brand ramp** (`#DCE6FF, #9DB8FF, #4F7DF3, #1D4ED8, #0B1F66`); green, red and neutral ramps stay (neutral tinted cool) | |

Contrast (WCAG): text on page 15.9:1 / 16.5:1; subtle text on page 5.7:1 / 7.9:1; white on primary 6.7:1; dark text on dark-theme primary 7.4:1; link on page 6.3:1 / 9.2:1; link on primary container 5.9:1 / 7.2:1.

**Strengths:** least disruptive visually, hugely familiar, the status colours stand out. **Weakness:** the least distinctive of the three.

## 4. Option B: Ultraviolet

*A violet brand on faintly violet-tinted slate. Distinct, modern, and unmistakably not a green "profit" colour. Gain and loss are the only warm/green signals on screen.*

| Token | Light | Dark |
|---|---|---|
| `--surface-background` | `#F7F5FC` | `#0B0814` |
| `--surface-background-bright` | `#FFFFFF` | `#130F20` |
| `--surface-container-background` | `#F0ECF9` | `#1B1630` |
| `--surface-container-background-low` | `#FAF9FE` | `#130F20` |
| `--surface-container-background-high` | `#FFFFFF` | `#241D3E` |
| `--surface-foreground` | `#1B1236` | `#ECE8F7` |
| `--surface-foreground-subtle` | `#625A7C` | `#A39CBB` |
| `--surface-line` | `#9A93B3` | `#50476B` |
| `--surface-line-subtle` | `#E8E3F4` | `#2A2342` |
| `--surface-foreground-link` / `-interaction` | `#6D28D9` / `#5B21B6` | `#C4B5FD` / `#DDD6FE` |
| `--accent-primary-background` / `-interaction` | `#6D28D9` / `#5B21B6` | `#A78BFA` / `#C4B5FD` |
| `--accent-primary-foreground` | `#FFFFFF` | `#1A0A3D` |
| `--accent-primary-container-background` | `#F3EDFF` | `#231A45` |
| Status success / error / warning | unchanged | unchanged |
| Status info (moves off blue-violet) | bg `#0369A1`, container `#E0F2FE`, text `#075985`, line `#BAE6FD` | bg `#38BDF8`, container `#0B2433`, text `#7DD3FC`, line `#1E5A7A` |
| `--accent-gradient` | `135deg #6D28D9 -> #4C1D95` | `135deg #8B6CF0 -> #6B46D6` |
| `--hero-gradient` | `135deg #4C1D95, #6D28D9 45%, #0369A1` | `135deg #33196B, #5226B8 45%, #0B5A86` |
| `--page-glow` | violet `rgb(109 40 217 / .09)` + sky `rgb(14 165 233 / .06)` | `.15` / `.10` |
| Categorical 1-10 | violet `#8B5CF6`, teal `#14B8A6`, amber `#F59E0B`, blue `#60A5FA`, pink `#F472B6`, lime `#84CC16`, sky `#38BDF8`, rose `#FB7185`, slate `#94A3B8`, orange `#FB923C` | same |
| Mono ramps | brand ramp `#EBE1FF, #C4B0FB, #8B5CF6, #6D28D9, #2E1065`; green, red, neutral (violet-tinted) | |

Contrast: text on page 16.4:1 / 16.5:1; subtle on page 5.9:1 / 7.6:1; white on primary 7.1:1; dark text on dark primary 6.7:1; link on page 6.6:1 / 10.7:1; link on primary container 6.2:1 / 8.7:1.

**Strengths:** most distinctive and modern; the brand can never be mistaken for a market signal. **Weakness:** a stronger personality, so charts and imagery need more care to stay neutral.

## 5. Option C: Graphite and Brass

*Warm graphite surfaces with a brass/gold brand: the private-bank and trading-terminal look. Calm, premium, and very different from every green-and-blue broker.*

| Token | Light | Dark |
|---|---|---|
| `--surface-background` | `#F7F5F0` | `#0D0C0A` |
| `--surface-background-bright` | `#FFFFFF` | `#151411` |
| `--surface-container-background` | `#EFECE4` | `#1E1C17` |
| `--surface-container-background-low` | `#FAF8F4` | `#151411` |
| `--surface-container-background-high` | `#FFFFFF` | `#27241E` |
| `--surface-foreground` | `#1C1A16` | `#ECE8DE` |
| `--surface-foreground-subtle` | `#6A655A` | `#A8A294` |
| `--surface-line` | `#A39D8F` | `#5A5548` |
| `--surface-line-subtle` | `#E7E2D6` | `#2B2821` |
| `--surface-foreground-link` / `-interaction` | `#8A5A00` / `#6B4500` | `#EFC862` / `#F6DB93` |
| `--accent-primary-background` / `-interaction` | `#8A5A00` / `#6B4500` | `#E3B341` / `#EFC862` |
| `--accent-primary-foreground` | `#FFFFFF` | `#231800` |
| `--accent-primary-container-background` | `#FBF3DF` | `#2A2210` |
| Status success / error | unchanged | unchanged |
| Status **warning (moves to orange)** | bg `#C2410C`, container `#FFF1E6`, text `#9A3412`, line `#FDBA8C` | bg `#FB923C`, container `#2B1A0E`, text `#FDBA74`, line `#7A3F14` |
| Status info (sky) | as in A | as in A |
| `--accent-gradient` | `135deg #8A5A00 -> #5E3C00` | `135deg #EFC862 -> #C99A2E` (dark text on it) |
| `--hero-gradient` | `135deg #3A2A0A, #8A5A00 55%, #B07B12` | `135deg #2B2210, #6B4A0F 55%, #8A6212` |
| `--page-glow` | brass `rgb(138 90 0 / .08)` + warm grey `rgb(120 100 60 / .06)` | brass `.14` + `.08` |
| Categorical 1-10 | brass `#D4A017`, teal `#14B8A6`, blue `#60A5FA`, violet `#A78BFA`, pink `#F472B6`, lime `#84CC16`, sky `#38BDF8`, rose `#FB7185`, stone `#A8A29E`, orange `#FB923C` | same |
| Mono ramps | brand ramp `#FBF0CC, #EBCF7B, #D4A017, #8A5A00, #3D2800`; green, red; neutral becomes warm stone | |

Contrast: text on page 15.9:1 / 16.0:1; subtle on page 5.3:1 / 7.7:1; white on primary 5.9:1; dark text on dark primary 9.0:1; link on page 5.4:1 / 12.2:1; link on primary container 5.4:1 / 9.8:1.

**Strengths:** the most premium and the most unlike a typical broker. **Weakness / care needed:** brass, orange warnings and red errors are neighbours on the colour wheel. Mitigations are built in
(warning moves to a red-orange, every status keeps its **icon and text**, brass is used sparingly: one primary action per view, links and selection), but this is the option that needs the most visual testing.

## 6. Recommendation

| Priority | Option |
|---|---|
| Safest and closest to a classic trading platform | **A. Sapphire** |
| Best balance of distinctive and professional | **B. Ultraviolet** |
| Most premium, most work to get right | **C. Graphite and Brass** |

My pick: **B** if you want the product to look like itself, **A** if the audience is conservative. Whichever you choose, the semantic fix (brand no longer equals "gain") is the main improvement.
You do not have to decide from tables: the plan below lets you see all three live.

## 7. How to implement (and preview before choosing)

1. **Preview build (small, throw-away):** add the three palettes as extra blocks in `styles.css`, `:root[data-palette="sapphire"]`, `[data-palette="violet"]`, `[data-palette="brass"]`, each with a light and a dark variant (`[data-theme="dark"]` combined), and a small selector on the existing `/showcase` page that sets `document.documentElement.dataset.palette`. Every screen can then be looked at in every palette, in both themes, with real data. Nothing else changes.
2. **Choose one**, then **fold it into the default** `:root` / `:root[data-theme="dark"]` blocks and delete the other two and the selector. This is the real change.
3. **Token inventory (what is replaced):** surfaces (14), accent primary (5), status success/info/warning/error (4 x 5), data categorical (10), data mono ramps (4 x 5), shell (background, foreground, border, hover, CTA x3), `--page-glow`, `--accent-gradient`, `--accent-glow`, `--hero-gradient`, `--card-shadow*` (legacy, unused in new UI), `--icon-*` (stay light on purpose: logos are drawn for a light tile).
4. **Semantic audit** (the part that needs eyes, not a search-and-replace): list every use of `--accent-primary-*` that actually means "gain" or "buy" and move it to `--status-success-*`; list every use of `--status-success-*` that means "brand" and move it to accent. Likely places: Buy/Sell buttons and side toggle, selected rows, PnL values, success badges, the order ticket gradient (it blends `--status-success-background` with a hard-coded `#0f766e`).
5. **Clean the hard-coded colours** found while checking: `order-ticket.css` (`#0f766e` in a `color-mix`), the auth dialog backdrop (`rgb(20 20 20 / .35)`), and a handful of `rgb(...)` shadows that are commented out. Replace with tokens (a `--scrim` token for backdrops is a sensible addition).
6. **Charts:** Highcharts styled mode reads the same tokens, so charts follow automatically; verify the categorical order (first series = brand colour) and that gain/loss bars stay green/red.
7. **Docs and tests:** `DESIGN_SYSTEM.md` (colour tokens section: new values, the "brand is not gain" rule), the showcase page, and a quick contrast check script (the ratios above were computed with the WCAG formula) kept in the repo so future token edits can be validated.
8. **Visual regression pass:** every page, light and dark, with success/error/warning/info states, disabled and focus states.

## 8. Decisions
| # | Question | Recommendation |
|---|---|---|
| D1 | Build the three-palette preview first? | Yes: a few hours, removes the guesswork |
| D2 | Buy and Sell buttons: keep both as brand, or Buy = green and Sell = red? | Buy green, Sell red (the new brand colour is then free for everything else); decide while auditing |
| D3 | Add a `--scrim` token for dialog backdrops? | Yes |
