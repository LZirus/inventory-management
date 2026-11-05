# Audit Action Plan: Inventory Management

**Date:** 2026-11-05
**Method:** three parallel reviewers (Security, Performance, UX), followed by a round of cross-team severity challenges. The audit was read-only: no code was changed.
**Sources:** 11 security findings (SEC), 11 performance findings (PERF) and 18 UX findings (UX). The severities below are the final ones agreed after the debate.

## Executive summary

- **No security finding is Critical or High.** The app is a demo with no login by design. The three Medium security findings would become High if the app were deployed.
- **No performance problem is measurable today.** Every endpoint answers in 0.7 to 1.3 ms, and the JS bundle is 92 KB gzipped. All 11 performance findings are Low, and three of them would matter as the data grows.
- **The real risk is correctness and accessibility in the UI:**
  - A currency bug lets a Japanese-locale user commit about 150x more money than they see on screen.
  - A finance chart shows the same height for every month.
  - Two global menus can't be used with a keyboard.
  - Two features (Purchase Orders, Tasks) call backend routes that don't exist.

Several findings share one root cause across teams. Those groups are fixed together below.

---

## Priority 0: fix first (wrong numbers, money, WCAG Level A)

| # | Action | Findings | Effort |
|---|---|---|---|
| P0-1 | **Make currency consistent in the client and enforce it on the server.** Send every money value through one shared formatter in `client/src/utils/currency.js`. Today `formatMoney` in `client/src/views/Restocking.vue:240-246`, and similar code in Inventory, Orders and Spending, only swaps `$` for `¥`; Reports hardcodes `$`. On Restocking, either fix the budget to USD or convert both ways and label the currency. On the server, add a `currency` field, or a check that rejects anything other than USD, to the order request (`server/main.py:152,242`). | UX-1 (High), SEC-2 (Medium) | M |
| P0-2 | **Fix the scale of the Spending "Monthly cost flow" chart.** The axis is hardcoded to 25K (`Spending.vue:83`) and `maxValue = 25000` (`Spending.vue:387`), but each month is $1.37M to $1.87M, so every bar draws at the same height. Scale from the largest value in the data, as the revenue chart already does. | UX-4 (High) | S |
| P0-3 | **Make LanguageSwitcher and ProfileMenu work with a keyboard.** Use `@click` instead of `@mousedown`, close on Esc and when focus leaves the menu, and add `aria-expanded` and `aria-haspopup`. Copy the pattern from `FilterBar.vue`. | UX-2 (High, WCAG 2.1.1 Level A) | S |
| P0-4 | **Add input limits to the restocking API.** Cap quantity with `Field(gt=0, le=MAX)`. Reject infinite and NaN values with `allow_inf_nan=False`, set a maximum budget, and cap the item list with `max_length` at the catalogue size. Together these fix the 500 error on `budget=inf` (`server/restocking.py:78`) and the storage of 1e29-unit orders. | SEC-2 (Medium), SEC-4 (Low), SEC-3 (part) | S |

## Priority 1: next sprint (security hygiene, broken features, accessibility)

| # | Action | Findings | Effort |
|---|---|---|---|
| P1-1 | **Restrict CORS and the network binding.** Allow only `http://localhost:3000`, configurable through an environment variable, and remove `allow_credentials=True` (`server/main.py:53-59`). Bind to `127.0.0.1` by default (`server/main.py:389`). *Dependency:* the Restocking order flow must keep working afterwards. | SEC-1 (Medium) | S |
| P1-2 | **Limit request body size.** Add middleware or a reverse-proxy limit. A single 50 MB POST pushed the server to about 890 MB of memory. | SEC-3 (Medium) | S |
| P1-3 | **Decide what happens to the features with no backend.** Purchase Orders (`<PurchaseOrderModal>` doesn't exist and `/api/purchase-orders` has no route) and Tasks (`/api/tasks` returns 404 on every app load, failures are only logged, and delete has no confirm or undo) are broken. The recommendation is to remove the UI now and build the features later as tracked work. | UX-3 (Medium), UX-10 (Medium), PERF-5 (Low) | S to remove, L to build |
| P1-4 | **Fix error handling and stale responses in all filter views.** Reset `error` at the start of each load, show a translated message with a Retry button, and copy the request-sequence guard from `Restocking.vue:186-205` into Dashboard, Orders, Inventory, Backlog and Demand. | UX-7 (Medium), PERF-4 (Low; Medium if deployed) | S |
| P1-5 | **Build one shared, accessible `BaseModal` and use it for all six modals.** It needs `role="dialog"`, `aria-modal`, Esc to close, a focus trap, focus returned on close, and a labelled close button. | UX-5 (Medium) | M |
| P1-6 | **Make clickable rows and chart bars usable with a keyboard.** Put a button or link in each row, and make the bars buttons with an `aria-label`. | UX-6 (Medium) | S–M |
| P1-7 | **Fix text contrast.** Replace the hardcoded `#f59e0b`, `#10b981`, `#ef4444` and `#3b82f6` with status tokens, and darken `--c-faint` and `--c-warning`. | UX-8 (Medium) | S |
| P1-8 | **Make the charts accessible and correct.** Give each chart a text alternative (`role="img"` with a label, or a hidden table). Fix the donut's circumference: it is hardcoded as 440, but r=65 gives 408. | UX-11 (Medium) | S–M |
| P1-9 | **Stop showing hardcoded values as live KPIs.** Calculate the four fixed Dashboard values (4.2, 2.8, 187/200, 96.8%) from the data, or label them as sample targets. | UX-12 (Medium) | S–M |
| P1-10 | **Show only the filters each page honours.** Today Reports ignores all filters and Spending ignores most of them. Fix Reports at the same time: use `Promise.all` through `api.js` instead of hardcoded URLs, remove the `console.log` calls, and replace the `index` keys. | UX-9 (Medium), PERF-7 (Low) | M |
| P1-11 | **Make the Dashboard responsive and fix clipping in the Orders item list.** Collapse to one column below 900px. | UX-13 (Medium) | S–M |

## Priority 2: quick wins and growth readiness

| # | Action | Findings | Effort |
|---|---|---|---|
| P2-1 | Add `GZipMiddleware`: one line, makes `/api/orders` 8x smaller (108 KiB to 13 KiB). | PERF-2 | S |
| P2-2 | Paginate `GET /api/restocking/orders`, the only data users can make grow (10k rows: 101 ms, 5.9 MB). Ship it with rate limiting on POST. | PERF-3, SEC-5 | S–M |
| P2-3 | Paginate `/api/orders`. Give Dashboard and Spending server-side aggregates, and have Spending pass the period filter. | PERF-1 (Medium at scale), SEC-6 | M |
| P2-4 | Keep the previous data visible while loading, add `role="status"`, and only refetch requests the changed filter affects. Add a small client cache. | UX-17, PERF-6 | S–M |
| P2-5 | Fix the stale-plan window on Restocking: mark the plan pending on input, add `!error` to `canSubmit`, add `aria-live`, and optionally a confirm step. | UX-14 | S |
| P2-6 | Return fixed error messages or codes instead of the raw error text (`server/main.py:238`). | SEC-11 | S |
| P2-7 | Pin the MCP package versions (`.mcp.json`, `.claude/mcp-config.json`) and commit `uv.lock`. `package-lock.json` stays gitignored per CLAUDE.md; use Renovate or a minimum-version policy for npm instead. | SEC-8 | S |
| P2-8 | Host the Karla and Lexend fonts locally (GDPR), and add security headers if the app is deployed. | SEC-9 | S |

## Priority 3: backlog and polish

- **UX-15:** move the remaining hardcoded English (Reports, modals, Dashboard actions) into the locale files. Make dates and numbers follow the app locale, and set `<html lang>` to match.
- **UX-16:** give the Inventory search field a label.
- **UX-18:** give trend colours one meaning across all pages, and add a text or icon cue wherever status is shown by colour alone.
- **SEC-7:** validate the `month` parameter as `^\d{4}-\d{2}$` or a quarter key, and return 422 otherwise.
- **SEC-10:** change the mock user's email to an `example.com` address.
- **PERF-8:** load routes and the inactive locale lazily.
- **PERF-9:** use computed groupings instead of template method calls, and cache date formatters.
- **PERF-10:** cache the report aggregates at startup.
- **PERF-11:** turn on SQLite WAL mode and use `INSERT ... RETURNING` (optional).

---

## Severity debate: what changed

| Finding | Change | Reason |
|---|---|---|
| UX-3 (dead PO buttons) | High → Medium | Security argued that no money moves and no wrong data is shown. The fix is to remove the buttons. |
| UX-10 (Tasks) | Low → Medium | Both teammates confirmed `/api/tasks` returns 404 on every call. The feature never works and never says so. |
| UX-14 (stale Restocking plan) | Medium → Low | Only a keyboard sequence completed within 250 ms triggers it; a mouse user can't. Performance and UX agreed. |
| UX-4 (Spending chart) | stayed High | Security suggested Medium. UX defended High, with Performance agreeing, because it's the only month-by-month cost view and it's 60x off. |
| SEC-5 (order growth) | Low → Medium → Low | Raised after Performance's 10k-row numbers, then lowered back: rows are capped at 9 lines and growth needs sustained abuse. |
| SEC-6, SEC-7 | Low → Info | The order data is static, and the UI can't produce bad month values. |
| SEC-1 (CORS) | stayed Medium, reworded | The real problem is that the server echoes any Origin on a write endpoint with no login. The credentials flag is irrelevant because there are no cookies. |
| PERF-1/2/3/4 | Medium → Low | Not measurable at the current data size or local latency. PERF-1 and PERF-4 are tagged "Medium at scale / if deployed". |
| SEC-11 (raw error text) | added as Info | Came out of the UX debate. Only hand-written messages reach users and they render as plain text, but the pattern is fragile. |

> Note: the security report's debate log uses older UX numbering. In the final UX numbering, **UX-10 = Tasks fail silently** and **UX-14 = stale Restocking plan**. This plan uses the final UX numbering.

## Cross-team dependencies

1. **UX-1 + SEC-2:** the currency fix needs both the client display and a server-side currency contract (P0-1).
2. **UX-7 + PERF-4:** one change fixes both: reset the error on load and add the request-sequence guard (P1-4).
3. **SEC-5 + PERF-3:** rate limiting on POST and pagination on GET should ship together (P2-2).
4. **UX-3 + UX-10 + PERF-5:** one decision covers all three: build the missing backend routes or remove the UI (P1-3).
5. **SEC-1 and the Restocking flow:** the tighter CORS setting must still allow `http://localhost:3000`.
6. **UX-17 + PERF-6 + PERF-1:** the loading flash gets worse as payloads grow, so the fixes should land together.

## Checked and found clean

- All SQL queries are parameterized (`server/restocking.py`).
- There is no `v-html`, `innerHTML` or `eval` in the client.
- No secrets are committed. The GitHub token comes from an environment variable, `.npmrc` pins the public npm registry, and the `.db` files are gitignored.
- `npm audit` reports 0 vulnerabilities.
- No memory leaks were found in the client.
- No `v-for` uses an index key, except in Reports and at `Orders.vue:116`.
- The Restocking slider is debounced and guarded against stale responses. It is the model for P1-4.
