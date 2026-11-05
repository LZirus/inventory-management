<template>
  <div class="restocking">
    <div class="page-header">
      <h2>{{ t('restocking.title') }}</h2>
      <p>{{ t('restocking.description') }}</p>
    </div>

    <div v-if="loading && !plan" class="loading">{{ t('common.loading') }}</div>
    <div v-else-if="error && !plan" class="error">{{ error }}</div>
    <div v-else-if="plan">
      <section class="budget-panel">
        <div class="budget-control">
          <label class="budget-label" for="restocking-budget">{{ t('restocking.budgetLabel') }}</label>
          <div class="budget-value num">{{ formatMoney(budget, 0) }}</div>
          <input
            id="restocking-budget"
            v-model.number="budget"
            class="budget-slider"
            type="range"
            min="0"
            :max="sliderMax"
            :step="BUDGET_STEP"
            :style="{ '--fill': fillPercent + '%' }"
            :aria-valuetext="formatMoney(budget, 0)"
            @input="onBudgetInput"
          />
          <div class="slider-scale num">
            <span>{{ formatMoney(0, 0) }}</span>
            <span>{{ t('restocking.fullRestock') }} {{ formatMoney(plan.full_restock_cost) }}</span>
          </div>
        </div>

        <!-- Single summary row separated by thin rules, not a card grid -->
        <dl class="summary-row">
          <div class="summary-cell">
            <dt>{{ t('restocking.budget') }}</dt>
            <dd class="num">{{ formatMoney(plan.budget) }}</dd>
          </div>
          <div class="summary-cell">
            <dt>{{ t('restocking.plannedSpend') }}</dt>
            <dd class="num">{{ formatMoney(plan.total_cost) }}</dd>
          </div>
          <div class="summary-cell">
            <dt>{{ t('restocking.remaining') }}</dt>
            <dd class="num">{{ formatMoney(plan.remaining_budget) }}</dd>
          </div>
          <div class="summary-cell summary-status">
            <span v-if="loading" class="muted">{{ t('restocking.updating') }}</span>
            <span v-else-if="error" class="error-text">{{ error }}</span>
          </div>
        </dl>
      </section>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">{{ t('restocking.recommendedItems') }}</h3>
          <span class="muted">
            {{ t('restocking.linesToOrder', { count: orderLines.length, total: plan.items.length }) }}
          </span>
        </div>

        <p v-if="plan.items.length === 0" class="empty">{{ t('restocking.noItems') }}</p>
        <div v-else class="table-container">
          <table class="restock-table">
            <thead>
              <tr>
                <th>{{ t('restocking.table.item') }}</th>
                <th>{{ t('restocking.table.trend') }}</th>
                <th class="num">{{ t('restocking.table.currentDemand') }}</th>
                <th class="num">{{ t('restocking.table.forecast') }}</th>
                <th class="num">{{ t('restocking.table.gap') }}</th>
                <th class="num">{{ t('restocking.table.unitCost') }}</th>
                <th class="num">{{ t('restocking.table.quantity') }}</th>
                <th class="num">{{ t('restocking.table.lineTotal') }}</th>
                <th class="num">{{ t('restocking.table.leadTime') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in plan.items"
                :key="item.sku"
                :class="{ 'not-covered': item.recommended_quantity === 0 }"
                :title="item.recommended_quantity === 0 ? t('restocking.notCovered') : null"
              >
                <td>
                  <div class="item-name">{{ translateProductName(item.name) }}</div>
                  <div class="item-sku">{{ item.sku }}</div>
                </td>
                <td>
                  <span class="marker-label">
                    <span :class="['marker', `marker-${item.trend}`]" aria-hidden="true"></span>
                    {{ t(`restocking.trends.${item.trend}`) }}
                  </span>
                </td>
                <td class="num">{{ formatNumber(item.current_demand) }}</td>
                <td class="num">{{ formatNumber(item.forecasted_demand) }}</td>
                <td class="num">{{ formatNumber(item.gap) }}</td>
                <td class="num">{{ formatMoney(item.unit_cost) }}</td>
                <td class="num strong">{{ formatNumber(item.recommended_quantity) }}</td>
                <td class="num strong">{{ formatMoney(item.line_total) }}</td>
                <td class="num">{{ t('restocking.days', { days: item.lead_time_days }) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="order-bar">
          <div class="order-feedback" aria-live="polite">
            <p v-if="submitError" class="error-text">{{ submitError }}</p>
            <p v-else-if="confirmation" class="confirmation">
              {{ t('restocking.success', { number: confirmation.order_number, date: formatDate(confirmation.expected_delivery) }) }}
              <router-link to="/orders">{{ t('restocking.viewOrders') }}</router-link>
            </p>
            <p v-else-if="orderLines.length === 0" class="muted">{{ t('restocking.nothingToOrder') }}</p>
          </div>
          <button
            type="button"
            class="place-order"
            :disabled="!canSubmit"
            @click="placeOrder"
          >
            {{ submitting ? t('restocking.placing') : t('restocking.placeOrder') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { api } from '../api'
import { useI18n } from '../composables/useI18n'

// Slider granularity and the step the slider maximum is rounded up to.
const BUDGET_STEP = 100
const MAX_ROUNDING = 500
// Budget used for the very first request, before full_restock_cost is known.
const INITIAL_BUDGET = 5000
const DEBOUNCE_MS = 250

export default {
  name: 'Restocking',
  setup() {
    const { t, currentCurrency, currentLocale, translateProductName } = useI18n()

    const currencySymbol = computed(() => (currentCurrency.value === 'JPY' ? '¥' : '$'))
    const numberLocale = computed(() => (currentLocale.value === 'ja' ? 'ja-JP' : 'en-US'))

    const budget = ref(INITIAL_BUDGET)
    const plan = ref(null)
    const loading = ref(true)
    const error = ref(null)

    const submitting = ref(false)
    const submitError = ref(null)
    const confirmation = ref(null)

    // The slider maximum is derived from the server's cost of covering every
    // forecast gap, rounded up so the end of the scale is a round figure.
    const sliderMax = computed(() => {
      const full = plan.value ? plan.value.full_restock_cost : 0
      const rounded = Math.ceil(full / MAX_ROUNDING) * MAX_ROUNDING
      return Math.max(rounded, MAX_ROUNDING)
    })

    // Drives the filled part of the custom slider track (see --fill in CSS).
    const fillPercent = computed(() => {
      if (!sliderMax.value) return 0
      return Math.min(100, (budget.value / sliderMax.value) * 100)
    })

    // Only lines the budget actually reaches go into the order.
    const orderLines = computed(() => {
      if (!plan.value) return []
      return plan.value.items.filter(item => item.recommended_quantity > 0)
    })

    // After a successful order the button stays disabled until the budget is
    // changed again, so a second click cannot submit the same plan twice.
    const canSubmit = computed(() => {
      return orderLines.value.length > 0 && !submitting.value && !loading.value && !confirmation.value
    })

    // Every request gets a sequence number; responses that arrive after a
    // newer request was sent are dropped so a slow reply cannot overwrite the
    // plan for the budget currently on the slider.
    let requestSeq = 0
    let debounceTimer = null

    const loadRecommendations = async () => {
      const seq = ++requestSeq
      loading.value = true
      error.value = null
      try {
        const data = await api.getRestockingRecommendations(budget.value)
        if (seq !== requestSeq) return
        plan.value = data
      } catch (err) {
        if (seq !== requestSeq) return
        error.value = t('restocking.loadError')
        console.error('Failed to load restocking recommendations:', err)
      } finally {
        if (seq === requestSeq) loading.value = false
      }
    }

    // Dragging fires many input events; wait until the value settles briefly
    // before asking the server for a new allocation.
    const onBudgetInput = () => {
      confirmation.value = null
      submitError.value = null
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(loadRecommendations, DEBOUNCE_MS)
    }

    const placeOrder = async () => {
      if (!canSubmit.value) return
      submitting.value = true
      submitError.value = null
      confirmation.value = null
      try {
        // Prices are deliberately omitted: the server prices every line.
        const payload = {
          budget: plan.value.budget,
          items: orderLines.value.map(item => ({ sku: item.sku, quantity: item.recommended_quantity }))
        }
        confirmation.value = await api.createRestockingOrder(payload)
      } catch (err) {
        const detail = err.response && err.response.data && err.response.data.detail
        submitError.value = typeof detail === 'string' && detail
          ? `${t('restocking.submitError')}: ${detail}`
          : t('restocking.submitError')
        console.error('Failed to place restocking order:', err)
      } finally {
        submitting.value = false
      }
    }

    const formatMoney = (value, digits = 2) => {
      const n = Number(value) || 0
      return currencySymbol.value + n.toLocaleString(numberLocale.value, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
      })
    }

    const formatNumber = (value) => (Number(value) || 0).toLocaleString(numberLocale.value)

    const formatDate = (dateString) => {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) return dateString || ''
      return date.toLocaleDateString(numberLocale.value, { year: 'numeric', month: 'short', day: 'numeric' })
    }

    onMounted(async () => {
      await loadRecommendations()
      // Keep the initial budget inside the derived range once it is known.
      if (plan.value && budget.value > sliderMax.value) {
        budget.value = sliderMax.value
        loadRecommendations()
      }
    })

    onBeforeUnmount(() => {
      if (debounceTimer) clearTimeout(debounceTimer)
    })

    return {
      t,
      BUDGET_STEP,
      budget,
      plan,
      loading,
      error,
      submitting,
      submitError,
      confirmation,
      sliderMax,
      fillPercent,
      orderLines,
      canSubmit,
      onBudgetInput,
      placeOrder,
      formatMoney,
      formatNumber,
      formatDate,
      translateProductName
    }
  }
}
</script>

<style scoped>
.restocking {
  font-family: var(--font);
  color: var(--c-ink);
}

.num {
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.muted {
  color: var(--c-muted);
  font-size: var(--fs-sm);
}

.error-text {
  color: var(--c-danger);
  font-size: var(--fs-sm);
}

/* Budget panel: slider on the left, one summary row on the right */
.budget-panel {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(0, 1.4fr);
  gap: var(--s-6);
  align-items: end;
  padding: var(--s-5) 0;
  margin-bottom: var(--s-5);
  border-top: 1px solid var(--c-line);
  border-bottom: 1px solid var(--c-line);
}

.budget-label {
  display: block;
  font-size: var(--fs-sm);
  color: var(--c-muted);
}

.budget-value {
  text-align: left;
  font-size: var(--fs-xl);
  font-weight: 600;
  color: var(--c-navy);
  margin: var(--s-1) 0 var(--s-3);
}

.slider-scale {
  display: flex;
  justify-content: space-between;
  margin-top: var(--s-2);
  font-size: var(--fs-xs);
  color: var(--c-faint);
}

/* Flat range slider: 2px track, navy fill up to --fill, square-ish thumb */
.budget-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 16px;
  margin: 0;
  background: transparent;
  cursor: pointer;
}

.budget-slider:focus {
  outline: none;
}

.budget-slider::-webkit-slider-runnable-track {
  height: 2px;
  background: linear-gradient(
    to right,
    var(--c-navy) 0,
    var(--c-navy) var(--fill),
    var(--c-line) var(--fill),
    var(--c-line) 100%
  );
}

.budget-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 10px;
  height: 16px;
  margin-top: -7px;
  background: var(--c-navy);
  border: 0;
  border-radius: var(--radius);
}

.budget-slider:focus-visible::-webkit-slider-thumb {
  box-shadow: var(--focus-ring);
}

.budget-slider::-moz-range-track {
  height: 2px;
  background: var(--c-line);
  border: 0;
}

.budget-slider::-moz-range-progress {
  height: 2px;
  background: var(--c-navy);
}

.budget-slider::-moz-range-thumb {
  width: 10px;
  height: 16px;
  background: var(--c-navy);
  border: 0;
  border-radius: var(--radius);
}

.budget-slider:focus-visible::-moz-range-thumb {
  box-shadow: var(--focus-ring);
}

.summary-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(0, 0.8fr);
  margin: 0;
}

.summary-cell {
  padding: 0 var(--s-4);
  border-left: 1px solid var(--c-line);
}

.summary-cell dt {
  font-size: var(--fs-sm);
  color: var(--c-muted);
}

.summary-cell dd {
  margin: var(--s-1) 0 0;
  text-align: left;
  font-size: var(--fs-lg);
  font-weight: 600;
}

.summary-status {
  display: flex;
  align-items: flex-end;
}

/* Recommendations table */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--s-4);
}

.empty {
  color: var(--c-muted);
  padding: var(--s-4) 0;
}

.restock-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-sm);
}

.restock-table th,
.restock-table td {
  padding: var(--s-2) var(--s-3);
  border-bottom: 1px solid var(--c-line);
  vertical-align: top;
}

.restock-table th {
  text-align: left;
  font-weight: 600;
  color: var(--c-muted);
  background: var(--c-surface-alt);
  white-space: nowrap;
}

.restock-table th.num {
  text-align: right;
}

.item-name {
  font-weight: 600;
}

.item-sku {
  font-size: var(--fs-xs);
  color: var(--c-muted);
  font-variant-numeric: tabular-nums;
}

.strong {
  font-weight: 600;
}

/* Rows the budget does not reach stay visible but recede */
.restock-table tr.not-covered td {
  color: var(--c-faint);
}

.restock-table tr.not-covered .item-name {
  font-weight: 400;
}

.restock-table tr.not-covered .marker {
  opacity: 0.5;
}

/* Trend shown as an 8px square marker plus text, not a pill */
.marker-label {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  white-space: nowrap;
}

.marker {
  width: 8px;
  height: 8px;
  flex: none;
  background: var(--c-faint);
}

.marker-increasing {
  background: var(--c-warning);
}

.marker-stable {
  background: var(--c-faint);
}

.marker-decreasing {
  background: var(--c-info);
}

/* Order action row */
.order-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--s-4);
  padding-top: var(--s-4);
}

.order-feedback p {
  margin: 0;
}

.confirmation {
  color: var(--c-success);
  font-size: var(--fs-sm);
}

.confirmation a {
  color: var(--c-blue);
  margin-left: var(--s-2);
}

.place-order {
  font-family: var(--font);
  font-size: var(--fs-sm);
  font-weight: 600;
  padding: var(--s-2) var(--s-5);
  color: var(--c-surface);
  background: var(--c-navy);
  border: 1px solid var(--c-navy);
  border-radius: var(--radius);
  cursor: pointer;
  white-space: nowrap;
}

.place-order:hover:not(:disabled) {
  background: var(--c-navy-deep);
}

.place-order:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.place-order:disabled {
  color: var(--c-faint);
  background: var(--c-surface-alt);
  border-color: var(--c-line);
  cursor: not-allowed;
}

@media (max-width: 900px) {
  .budget-panel {
    grid-template-columns: 1fr;
    gap: var(--s-4);
  }

  .summary-row {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .summary-cell:first-child {
    border-left: 0;
    padding-left: 0;
  }

  .summary-status {
    grid-column: 1 / -1;
    padding: var(--s-2) 0 0;
    border-left: 0;
  }
}
</style>
