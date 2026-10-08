# 14 · UI: the 6-digit code as six boxes

Status: **plan**. A new shared component and three small template changes.

## 1. Today

Wherever the customer types the emailed code, it is an ordinary text field with a shield icon and a "123456" placeholder (`.form-input.code-input`):

| Screen | Field id / test id | Form |
|---|---|---|
| Sign in (two-step) | `login-code` / `login-code` | `features/auth/login-form` |
| Register (email check) | `register-code` / `register-code` | `features/auth/register-form` |
| Forgot password | `forgot-code` / `forgot-code` | `features/auth/forgot-password-form` |

(Also search Settings for any "enter the code" step when two-step sign-in is switched on; today it only toggles, so probably none.)
The codes are exactly six digits (`required` + a six-digit validator in each form's Signal Form).

## 2. Target

Six large, evenly spaced boxes, one digit each, filling in as the customer types, like most modern verification screens:

```
   Verification code
   [ 4 ] [ 8 ] [ 1 ] [   ] [   ] [   ]      <- the next empty box has the focus ring (and a blinking caret)
   Enter the 6-digit code from your email.   <- error text only when invalid and touched
```

- Boxes about 48x56px on desktop (44x52 on narrow phones so six fit in 320px with gaps), centred, large digits (24px, tabular numerals), `--radius` like other inputs.
- States use tokens only: default (`--surface-line-subtle` border on `--surface-container-background-low`), active box (primary border + focus ring), filled (slightly stronger border), error (error border and container tint), disabled (reduced opacity), success (brief primary tint on the last digit is optional; no animation needed).
- Layout: 3 + 3 grouping with a slightly larger gap in the middle (`123 456`) reads like how codes are said and shown in emails; optional.
- Both themes; no shadows; respects `prefers-reduced-motion` (the caret blink stops).

## 3. How: one real input, six drawn boxes (not six inputs)

The robust pattern is **a single real `<input>` that carries all the behaviour, with six presentational boxes drawn from its value**. Six separate inputs look the same but break things people rely on.

| Concern | One input + six boxes (recommended) | Six separate inputs |
|---|---|---|
| **Autofill from SMS/email app** (`autocomplete="one-time-code"`) | Works: the browser/phone fills one field with all six digits | Often fills only the first box |
| **Paste "481 927"** | One `paste` handler cleans it (strip spaces and dashes, keep six digits) | Needs per-box paste logic and focus jumping |
| **Screen readers** | One labelled field ("Verification code, 6 digits"), digits announced as typed | Six unlabeled fields to tab through; very noisy |
| **Backspace, arrows, selection** | Native | Hand-written focus management, easy to get wrong |
| **e2e tests** (`getByTestId('login-code').fill('123456')`) | Keep the `data-testid` on the real input: **tests and the e2e MailHog helpers need no change** | All e2e helpers change |
| **Form integration** | The real input is the field; the existing `[formField]`, validators and error text stay as they are | Six controls to reconcile into one value |

### Component: `OtpInput` (`shared/ui/otp-input`)
- Standalone, `host` object bindings (no `@HostBinding`), `input()`/`model()`, signals.
- Implements the Signal Forms **custom control** contract (a `value` model, plus `disabled`, `invalid` and `touched` as the forms API expects) so it is used exactly like today's field:
  `<app-otp-input inputId="login-code" label="Verification code" testId="login-code" [formField]="codeForm.code" [length]="6" />`.
- Inputs: `length` (default 6), `inputId`, `label` (visible label stays outside as the existing `<label for>`), `testId`, `autoFocus`, `ariaDescribedBy` (for the error text).
- The real `<input>`: `type="text"`, `inputmode="numeric"`, `pattern="[0-9]*"`, `autocomplete="one-time-code"`, `maxlength="6"`, `spellcheck="false"`, positioned over the boxes with transparent text and caret (so clicks and selection hit it, and the boxes are decorative, `aria-hidden="true"`).
- Behaviour: only digits are accepted (everything else is dropped on input and on paste); the active box is `value.length` (or the last box when full); clicking anywhere focuses the input and puts the caret at the end; Backspace removes the last digit.
- Optional `completed` output when the sixth digit is entered. **Do not auto-submit** (a mistyped code would be sent immediately and could count against rate limits); the forms keep the explicit "Verify" button. A later option: auto-submit on paste only.
- Accessibility: one label, `aria-describedby` pointing at the error text, `aria-invalid` from the form state, visible focus ring on the active box (not only colour: the box also gets a thicker border), a minimum 44px touch target, contrast AA for digits and borders in both themes. The visually-hidden live status says "3 of 6 digits entered" only if user testing shows it helps (it can be noisy).

## 4. Changes
1. `shared/ui/otp-input/{otp-input.ts,html,css,spec.ts}`: the component and its specs (typing, paste with spaces, paste of more than six digits, non-digits ignored, backspace, autofill value set programmatically, disabled, error state, `data-testid` on the real input, works inside a Signal Form with the existing validators).
2. Replace the field markup in the three forms (keep labels, error texts, test ids `login-code`, `register-code`, `forgot-code`, and the existing `*-field-error` ids). Remove the `.code-input` styling and the shield icon from those fields.
3. Update the three form specs where they set the value (`fill` / `setValue` on the input should still work because the real input remains; adjust only selectors that depend on the old classes).
4. Add the component to the `/showcase` page, and a short entry in `DESIGN_SYSTEM.md` (Forms or Components).
5. Visual check: 320px, 375px, desktop, light/dark, error and disabled states, browser autofill, paste.

## 5. Acceptance criteria
- Six clear boxes appear in all three places; typing, backspace, paste and phone autofill all work as in a normal field.
- The value is still one string handled by the existing validators and requests; e2e helpers keep passing unchanged.
- A screen reader announces one field with its label and error; keyboard-only use works (Tab in, type, Tab to the button).
- No shadows, no hardcoded colours; both themes pass AA.
