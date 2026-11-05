<template>
  <div class="reports">
    <div class="page-header">
      <h2>{{ t('reports.title') }}</h2>
      <p>{{ t('reports.description') }}</p>
    </div>

    <div v-if="loading" class="loading">{{ t('reports.loading') }}</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else>
      <!-- Quarterly Performance -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">{{ t('reports.quarterly.title') }}</h3>
        </div>
        <div v-if="quarterlyData.length === 0" class="loading">{{ t('common.noData') }}</div>
        <div v-else class="table-container">
          <table class="reports-table">
            <thead>
              <tr>
                <th>{{ t('reports.quarterly.quarter') }}</th>
                <th>{{ t('reports.quarterly.totalOrders') }}</th>
                <th>{{ t('reports.quarterly.totalRevenue') }}</th>
                <th>{{ t('reports.quarterly.avgOrderValue') }}</th>
                <th>{{ t('reports.quarterly.fulfillmentRate') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="q in quarterlyData" :key="q.quarter">
                <td><strong>{{ q.quarter }}</strong></td>
                <td>{{ q.total_orders }}</td>
                <td>{{ formatMoney(q.total_revenue) }}</td>
                <td>{{ formatMoney(q.avg_order_value) }}</td>
                <td>
                  <span :class="getFulfillmentClass(q.fulfillment_rate)">
                    {{ formatPercent(q.fulfillment_rate) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Monthly Trends Chart -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">{{ t('reports.monthly.chartTitle') }}</h3>
        </div>
        <div v-if="monthlyRows.length === 0" class="loading">{{ t('common.noData') }}</div>
        <div v-else class="chart-container">
          <div class="bar-chart">
            <div v-for="row in monthlyRows" :key="row.month" class="bar-wrapper">
              <div class="bar-container">
                <div
                  class="bar"
                  :style="{ height: row.barHeight + 'px' }"
                  :title="formatMoney(row.revenue)"
                ></div>
              </div>
              <div class="bar-label">{{ row.label }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Month-over-Month Comparison -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">{{ t('reports.monthly.tableTitle') }}</h3>
        </div>
        <div v-if="monthlyRows.length === 0" class="loading">{{ t('common.noData') }}</div>
        <div v-else class="table-container">
          <table class="reports-table">
            <thead>
              <tr>
                <th>{{ t('reports.monthly.month') }}</th>
                <th>{{ t('reports.monthly.orders') }}</th>
                <th>{{ t('reports.monthly.revenue') }}</th>
                <th>{{ t('reports.monthly.change') }}</th>
                <th>{{ t('reports.monthly.growthRate') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in monthlyRows" :key="row.month">
                <td><strong>{{ row.label }}</strong></td>
                <td>{{ row.order_count }}</td>
                <td>{{ formatMoney(row.revenue) }}</td>
                <td>
                  <span v-if="row.change !== null" :class="row.changeClass">
                    {{ formatChange(row.change) }}
                  </span>
                  <span v-else>-</span>
                </td>
                <td>
                  <span v-if="row.change !== null" :class="row.changeClass">
                    {{ formatGrowth(row.growth) }}
                  </span>
                  <span v-else>-</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Summary Stats -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">{{ t('reports.stats.totalRevenue') }}</div>
          <div class="stat-value">{{ formatMoney(totalRevenue) }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">{{ t('reports.stats.avgMonthlyRevenue') }}</div>
          <div class="stat-value">{{ formatMoney(avgMonthlyRevenue) }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">{{ t('reports.stats.totalOrders') }}</div>
          <div class="stat-value">{{ totalOrders.toLocaleString(numberLocale) }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">{{ t('reports.stats.bestQuarter') }}</div>
          <div class="stat-value">{{ bestQuarter || '-' }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, watch, onMounted } from 'vue'
import { api } from '../api'
import { useFilters } from '../composables/useFilters'
import { useI18n } from '../composables/useI18n'
import { formatCurrencyWithDecimals } from '../utils/currency'

// Max bar height in px; must match .bar-container height in the styles below.
const MAX_BAR_HEIGHT = 200

export default {
  name: 'Reports',
  setup() {
    const { t, currentCurrency, currentLocale } = useI18n()

    const loading = ref(true)
    const error = ref(null)
    const quarterlyData = ref([])
    const monthlyData = ref([])

    // Use shared filters
    const {
      selectedPeriod,
      selectedLocation,
      selectedCategory,
      selectedStatus,
      getCurrentFilters
    } = useFilters()

    const numberLocale = computed(() => (currentLocale.value === 'ja' ? 'ja-JP' : 'en-US'))

    // Filters can change while a request is in flight; only the latest
    // request may write results, so a slow stale reply cannot win.
    let requestSeq = 0

    const loadData = async () => {
      const seq = ++requestSeq
      try {
        loading.value = true
        // Reset so a previous failure does not stick after the filters change
        error.value = null
        const filters = getCurrentFilters()
        const [quarterly, monthly] = await Promise.all([
          api.getQuarterlyReports(filters),
          api.getMonthlyTrends(filters)
        ])
        if (seq !== requestSeq) return
        quarterlyData.value = Array.isArray(quarterly) ? quarterly : []
        monthlyData.value = Array.isArray(monthly) ? monthly : []
      } catch (err) {
        if (seq !== requestSeq) return
        error.value = t('reports.loadError', { message: err.message })
        console.error('Failed to load reports:', err)
      } finally {
        if (seq === requestSeq) loading.value = false
      }
    }

    // API amounts are USD; the shared utility converts them to JPY for the
    // Japanese locale (not just a symbol swap). It also guards null/undefined.
    const formatMoney = (value) => formatCurrencyWithDecimals(value, currentCurrency.value, 2)

    const formatChange = (change) => {
      if (change > 0) return '+' + formatMoney(change)
      if (change < 0) return '-' + formatMoney(Math.abs(change))
      return formatMoney(0)
    }

    const formatGrowth = (growth) => {
      // growth is null when the previous month had zero revenue (division by zero)
      if (growth === null) return t('reports.notAvailable')
      const sign = growth > 0 ? '+' : ''
      return sign + growth.toFixed(1) + '%'
    }

    const formatPercent = (value) => {
      // Number(null) is 0, so null/undefined must be caught before converting
      if (value == null) return t('reports.notAvailable')
      const n = Number(value)
      return Number.isFinite(n) ? `${n}%` : t('reports.notAvailable')
    }

    // "YYYY-MM" -> localized short month + year (e.g. "Jan 2025" / "2025年1月").
    // Falls back to the raw string for anything that does not parse.
    const formatMonth = (monthStr) => {
      const match = /^(\d{4})-(\d{2})$/.exec(monthStr || '')
      if (!match) return monthStr || ''
      const date = new Date(Number(match[1]), Number(match[2]) - 1, 1)
      if (isNaN(date.getTime())) return monthStr
      return date.toLocaleDateString(numberLocale.value, { year: 'numeric', month: 'short' })
    }

    const getFulfillmentClass = (rate) => {
      if (rate >= 90) return 'badge success'
      if (rate >= 75) return 'badge warning'
      return 'badge danger'
    }

    // Computed once per data change instead of per bar
    const maxRevenue = computed(() => {
      return monthlyData.value.reduce((max, m) => Math.max(max, Number(m.revenue) || 0), 0)
    })

    // Precompute label, bar height and month-over-month change/growth per row.
    // Change compares with the previous row (API returns months sorted ascending).
    const monthlyRows = computed(() => {
      return monthlyData.value.map((m, index) => {
        const revenue = Number(m.revenue) || 0
        const prev = index > 0 ? Number(monthlyData.value[index - 1].revenue) || 0 : null
        const change = prev === null ? null : revenue - prev
        let changeClass = ''
        if (change > 0) changeClass = 'positive-change'
        else if (change < 0) changeClass = 'negative-change'
        return {
          ...m,
          revenue,
          label: formatMonth(m.month),
          barHeight: maxRevenue.value > 0 ? (revenue / maxRevenue.value) * MAX_BAR_HEIGHT : 0,
          change,
          changeClass,
          growth: prev ? (change / prev) * 100 : null
        }
      })
    })

    const totalRevenue = computed(() => {
      return monthlyData.value.reduce((sum, m) => sum + (Number(m.revenue) || 0), 0)
    })

    const avgMonthlyRevenue = computed(() => {
      return monthlyData.value.length > 0 ? totalRevenue.value / monthlyData.value.length : 0
    })

    const totalOrders = computed(() => {
      return monthlyData.value.reduce((sum, m) => sum + (Number(m.order_count) || 0), 0)
    })

    const bestQuarter = computed(() => {
      let best = null
      for (const q of quarterlyData.value) {
        const revenue = Number(q.total_revenue) || 0
        if (revenue > 0 && (!best || revenue > best.revenue)) {
          best = { quarter: q.quarter, revenue }
        }
      }
      return best ? best.quarter : ''
    })

    // Watch for filter changes and reload data
    watch([selectedPeriod, selectedLocation, selectedCategory, selectedStatus], () => {
      loadData()
    })

    onMounted(loadData)

    return {
      t,
      loading,
      error,
      quarterlyData,
      monthlyRows,
      numberLocale,
      totalRevenue,
      avgMonthlyRevenue,
      totalOrders,
      bestQuarter,
      formatMoney,
      formatChange,
      formatGrowth,
      formatPercent,
      getFulfillmentClass
    }
  }
}
</script>

<style scoped>
.reports {
  padding: 0;
}

.card {
  background: white;
  border-radius: var(--radius);
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.card-header {
  margin-bottom: 1.5rem;
}

.card-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--c-ink);
  margin: 0;
}

.reports-table {
  width: 100%;
  border-collapse: collapse;
}

.reports-table th {
  background: var(--c-surface-alt);
  padding: 0.75rem;
  text-align: left;
  font-weight: 600;
  color: var(--c-muted);
  border-bottom: 2px solid var(--c-line);
}

.reports-table td {
  padding: 0.75rem;
  border-bottom: 1px solid var(--c-line);
}

.reports-table tr:hover {
  background: var(--c-surface-alt);
}

.chart-container {
  padding: 2rem 1rem;
  min-height: 300px;
}

.bar-chart {
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
  height: 250px;
  gap: 0.5rem;
}

.bar-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  max-width: 80px;
}

.bar-container {
  height: 200px;
  display: flex;
  align-items: flex-end;
  width: 100%;
}

.bar {
  width: 100%;
  background: var(--c-blue);
  border-radius: var(--radius) var(--radius) 0 0;
  transition: all 0.3s;
  cursor: pointer;
}

.bar:hover {
  background: var(--c-navy);
}

.bar-label {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--c-muted);
  text-align: center;
  transform: rotate(-45deg);
  white-space: nowrap;
  margin-top: 1.5rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
  margin-top: 1.5rem;
}

.stat-card {
  background: white;
  border-radius: var(--radius);
  padding: 1.5rem;
  border-left: 4px solid var(--c-blue);
}

.stat-label {
  font-size: 0.875rem;
  color: var(--c-muted);
  margin-bottom: 0.5rem;
}

.stat-value {
  font-size: 1.875rem;
  font-weight: 700;
  color: var(--c-ink);
}

.badge {
  padding: 0.25rem 0.75rem;
  border-radius: var(--radius);
  font-size: 0.875rem;
  font-weight: 500;
}

.badge.success {
  background: #dcfce7;
  color: #166534;
}

.badge.warning {
  background: #fef3c7;
  color: #92400e;
}

.badge.danger {
  background: #fee2e2;
  color: #991b1b;
}

.positive-change {
  color: #16a34a;
  font-weight: 600;
}

.negative-change {
  color: #dc2626;
  font-weight: 600;
}

.loading {
  text-align: center;
  padding: 3rem;
  color: var(--c-muted);
}

.error {
  background: #fee2e2;
  color: #991b1b;
  padding: 1rem;
  border-radius: var(--radius);
  margin: 1rem 0;
}
</style>
