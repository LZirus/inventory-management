---
name: vue-component-analyzer
description: Analyzes Vue 3 single-file components in client/src for performance problems, code-reuse opportunities, oversized structure and violations of this repo's CLAUDE.md rules, and suggests concrete optimizations without changing code. Use when the user asks to analyze, audit, review or optimize a Vue component or view, asks what to refactor in a .vue file, or wants to find duplicated logic across components.
---

# Vue Component Analyzer

Produces a findings report for one or more `.vue` files. **Suggest only: never edit
the analyzed components.** Fixes are a separate step the user starts, and per the
repo `CLAUDE.md` they go through the `vue-expert` subagent.

## Workflow

1. **Pick targets.** Use the files the user named. If they named none, ask, or take the
   views changed on the current branch (`git diff --name-only main -- '*.vue'`).

2. **Mechanical pre-scan.** From the repo root:
   ```bash
   node .claude/skills/vue-component-analyzer/scripts/scan.mjs <file.vue> [...]
   ```
   It reports sizes, `:key` problems, uncleared timers/listeners, deep watchers,
   `console.log`, unvalidated dates, missing i18n, Options API use, and functions or
   CSS rules that also exist in *other* components under `client/src`.
   Every hit is a **candidate**, not a finding. No dependencies needed.

3. **Read each component in full** and verify every candidate. Drop false positives
   (e.g. a `setTimeout` that is cleared via a stored handle, a `:style` object that only
   sets one CSS variable). For reuse hits, open the other file and compare the bodies:
   same name with different behaviour is not duplication.

4. **Add what the regex cannot see.** Check these by reading:

   | Area | What to look for |
   |------|------------------|
   | Performance | Methods called in the template that compute over arrays (should be `computed`); O(n) work repeated per row inside `v-for` (e.g. recomputing a max per bar); `v-if` on frequently toggled UI where `v-show` fits; data refetched on every filter change without debounce; large lists without pagination |
   | Reuse | Formatting helpers (`formatMoney`, `formatDate`, `formatNumber`) that belong in `client/src/utils/` or a composable; repeated loading/error/data boilerplate (candidate `useAsyncData`); repeated markup blocks (table, stat cell, modal shell) that could be a child component; scoped CSS that duplicates `App.vue` globals |
   | Structure | Thresholds from `client/CLAUDE.md`: template >100 lines or logic >150 lines means "consider extracting". Name the concrete sub-component or composable to extract, not just "too big". Props/emits declared with types; no prop mutation |
   | Project rules | `CLAUDE.md` + `client/CLAUDE.md`: no index keys, validate dates before `getMonth()`, Composition API only, no emojis in UI, user-facing text through `t()` (`useI18n`), loading and error states shown |

5. **Rate severity.**
   - **Hoch**: real bug or measurable cost (wrong DOM reuse from index keys on a list that changes, leak, O(n²) per render).
   - **Mittel**: rule violation or duplication across 3+ files.
   - **Niedrig**: style, small cleanup, "nice to have".

6. **Write the report** (format below) in the conversation, in the user's language,
   **and** save it to `docs/reports/vue-analysis-<YYYY-MM-DD>.md` (overwrite if it exists
   for the same day; one file covers all components analyzed in the run).

## Report format

```markdown
# Vue-Komponentenanalyse – <Datum>

Analysiert: `<file>`, `<file>` · Modus: nur Vorschläge

## Top 3
1. **<kurzer Titel>** (`<file>:<line>`) – <ein Satz Wirkung> → <ein Satz Fix>
2. ...

## <file> (<n> Zeilen: template a / script b / style c)

| Schwere | Kategorie | Ort | Befund | Vorschlag |
|---------|-----------|-----|--------|-----------|
| Hoch | Performance | L55 | ... | ... |

## Komponentenübergreifend
- <Duplikat> in <Dateien> → <Ziel: utils/format.js, Composable, Kindkomponente>

## Nächster Schritt
<1–2 Sätze: welche Fixes zuerst, über vue-expert umsetzen>
```

Rules for the report:
- Every finding has a `file:line` location and a concrete suggestion (what to move where, which key to use).
- Put cross-file duplication in its own section once, not repeated under every file.
- If a component is clean in a category, say nothing; do not pad the table.
- Do not report false positives you dropped in step 3.
