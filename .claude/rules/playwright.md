# Playwright e2e rules

## Never assert `getByRole("alert")`

The Next.js App Router renders a visually-hidden `role="alert"` live region
(the route announcer) on every navigation. Asserting on `getByRole("alert")`
will match that announcer — or race against it — producing flaky, misleading
results. Target the specific element instead:

- For form errors, use the rendered text, e.g.
  `page.getByText("Incorrect passcode.")` (the passcode-form error text from
  `src/lib/actions/auth-actions.ts:35`).
- For headings, use `getByRole("heading", { name, level })` — but ONLY for
  real heading elements. The login "Welcome to Outlay" title is a CardTitle
  `<div data-slot="card-title">`, NOT a heading, so assert it with
  `getByText("Welcome to Outlay")`. The dashboard "Dashboard" title is a real
  `<h1>` (PageHeader) and can use `getByRole("heading", { level: 1 })`.
- For inputs, use `getByPlaceholder(...)` or `getByLabel(...)`.

## Auth in e2e

Use the shared-passcode path only. Google sign-in requires a real IdP and is
out of scope for e2e. The passcode is `HOUSEHOLD_PASSCODE` from
`playwright.config.ts`'s `webServer.env` (`e2e-pass`).
