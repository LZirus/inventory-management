# Vue-Komponentenanalyse – 2026-11-05

Analysiert: `client/src/views/Restocking.vue`, `client/src/views/Reports.vue`, `client/src/components/FilterBar.vue` · Modus: nur Vorschläge
Erzeugt mit dem Projekt-Skill `vue-component-analyzer` (Pre-Scan `scan.mjs` + manuelle Prüfung).

## Top 3
1. **Yen-Zeichen ohne Umrechnung** (`Restocking.vue:240`, `Orders.vue:206`): Bei JPY zeigt `formatMoney` den Dollarbetrag mit `¥` an, Dashboard und Spending rechnen über `utils/currency.js` ×150 um. Dieselbe Bestellung hat je nach Seite zwei verschiedene Yen-Beträge. → Ein gemeinsames `formatMoney` in `utils/currency.js`, das `convertAmount` nutzt, und überall importieren.
2. **O(n²) beim Rendern des Balkendiagramms** (`Reports.vue:55` → `getBarHeight`, L254): Für jeden Balken läuft eine Schleife über alle Monate, um das Maximum zu finden, dazu ein `console.log` pro Aufruf. → `maxRevenue` und `barHeights` als `computed`, im Template nur nachschlagen.
3. **`formatDate` siebenfach kopiert** (Restocking, Orders, Dashboard, Spending, drei Modals): Fast identische Funktionen mit kleinen Abweichungen. → `client/src/utils/format.js` mit `formatDate`, `formatNumber`, `formatMoney`, an `currentLocale` gekoppelt (z. B. Composable `useFormatters()`).

## client/src/views/Restocking.vue (606 Zeilen: template 128 / script 163 / style 313)

| Schwere | Kategorie | Ort | Befund | Vorschlag |
|---------|-----------|-----|--------|-----------|
| Hoch | Wiederverwendung | L240 | `formatMoney` setzt bei JPY nur das Symbol, rechnet nicht um (siehe Top 1) | Gemeinsamen Formatter mit `convertAmount` nutzen |
| Mittel | Struktur | L62–104 | Template 128 Zeilen (Schwelle 100); die Tabelle ist ein eigener Block mit 9 Spalten | `RestockTable.vue` extrahieren (Props: `items`, Formatter) |
| Mittel | Wiederverwendung | L240–254 | `formatMoney`, `formatNumber`, `formatDate` lokal definiert | In `useFormatters()` auslagern |
| Niedrig | Struktur | L130–292 | Script 163 Zeilen; Debounce, Request-Sequenz und Ladezustand sind generisch | Composable `useDebouncedRequest()` für Lade- und Abbruchlogik |
| Niedrig | Wiederverwendung | Style | `.marker-label` identisch in `Orders.vue`; `.num`, `.muted`, `.error-text` sind Kandidaten für `App.vue` | Gemeinsame Utility-Klassen global definieren |

Verworfen nach Prüfung: `setTimeout` wird über `debounceTimer` und `onBeforeUnmount` sauber geräumt; `:style` an L23 setzt nur eine CSS-Variable, ist unkritisch.

## client/src/views/Reports.vue (486 Zeilen: template 125 / script 191 / style 168)

| Schwere | Kategorie | Ort | Befund | Vorschlag |
|---------|-----------|-----|--------|-----------|
| Hoch | Performance | L55, L254 | `getBarHeight` sucht pro Balken das Maximum neu (O(n²) pro Render) | `maxRevenue` als `computed` |
| Hoch | Projektregel | L28, L51, L82 | `:key="index"` | `:key="q.quarter"` bzw. `:key="month.month"` |
| Mittel | Performance | L87–96 | `getChangeClass`/`getChangeValue`/`getGrowthRate` werden pro Zeile zweimal mit `monthlyData[index - 1]` aufgerufen | `monthlyRows` als `computed` mit vorberechnetem Delta und Wachstum |
| Mittel | Projektregel | L127 | Options API (`data`, `methods`, `mounted`) | Auf `setup()` umstellen wie die anderen Views |
| Mittel | Projektregel | L156, L162 | `axios.get('http://localhost:8001/...')` am `api.js` vorbei, Requests sequenziell | `api.getQuarterlyReport()`/`getMonthlyTrends()` in `api.js`, parallel per `Promise.all` |
| Mittel | Projektregel | Template | Kein `t()`, alle Texte hart codiert Englisch | `useI18n` wie in den anderen Views |
| Mittel | Projektregel | L145–256 | 13× `console.log` | Entfernen; Fehler per `console.error` |
| Niedrig | Wiederverwendung | L214–252 | Eigenes `formatNumber` mit Handschleife statt `toLocaleString`; `formatMonth` mit fest englischen Monatsnamen | `useFormatters()` verwenden |
| Niedrig | Wiederverwendung | Style | `.stat-value` identisch in `BacklogDetailModal.vue`, `InventoryDetailModal.vue` | Kleine `StatCell.vue` oder globale Klasse |

## client/src/components/FilterBar.vue (606 Zeilen: template 110 / script 178 / style 316)

| Schwere | Kategorie | Ort | Befund | Vorschlag |
|---------|-----------|-----|--------|-----------|
| Mittel | Struktur | L156–200 | Optionslisten (Lager, Kategorien, Status, Monate) fest im Component, gleiche Werte stehen im Backend und in `translateCategory` mehrerer Views | Filterdefinition nach `composables/useFilters.js` oder `constants/filters.js` |
| Niedrig | Wiederverwendung | L221–252 | Fokusfalle + Esc + Scroll-Sperre sind generische Drawer/Modal-Logik; die Modals haben eigene Varianten | Composable `useModalBehavior(drawerRef, isOpen)` |
| Niedrig | Struktur | Style | 316 Zeilen scoped CSS | Drawer-Styles in `FilterDrawer.vue` abtrennen, wenn der Drawer wiederverwendet wird |

Keine Performance-Befunde: `fields` und `activeFilters` sind `computed`, Keys sind stabil, Body-Overflow wird in `onBeforeUnmount` zurückgesetzt.

## Komponentenübergreifend
- `formatDate` in 7 Dateien, `formatMoney` in 2 (abweichend von `utils/currency.js`) → `utils/format.js` + `useFormatters()`
- `translateCategory` in Dashboard, Inventory, Spending; Kategoriewerte zusätzlich in FilterBar → eine Quelle in `constants/filters.js`
- Lade-/Fehler-Boilerplate (`loading`, `error`, try/finally) in jeder View → optional `useAsyncData()`

## Nächster Schritt
Zuerst Top 1 (sichtbarer Anzeigefehler bei JPY) und Top 3 zusammen als ein Refactoring über `vue-expert` umsetzen; danach die Reports-Punkte.
