<template>
  <div class="orders">
    <div class="page-header">
      <h2>{{ t('orders.title') }}</h2>
      <p>{{ t('orders.description') }}</p>
    </div>

    <div v-if="loading" class="loading">{{ t('common.loading') }}</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else>
      <div class="stats-grid">
        <div class="stat-card success">
          <div class="stat-label">{{ t('status.delivered') }}</div>
          <div class="stat-value">{{ getOrdersByStatus('Delivered').length }}</div>
        </div>
        <div class="stat-card info">
          <div class="stat-label">{{ t('status.shipped') }}</div>
          <div class="stat-value">{{ getOrdersByStatus('Shipped').length }}</div>
        </div>
        <div class="stat-card warning">
          <div class="stat-label">{{ t('status.processing') }}</div>
          <div class="stat-value">{{ getOrdersByStatus('Processing').length }}</div>
        </div>
        <div class="stat-card danger">
          <div class="stat-label">{{ t('status.backordered') }}</div>
          <div class="stat-value">{{ getOrdersByStatus('Backordered').length }}</div>
        </div>
      </div>

      <!-- Restocking orders are loaded separately and ignore the global filters
           (they have no warehouse/category/month dimension). -->
      <div class="card submitted-orders">
        <div class="card-header">
          <h3 class="card-title">{{ t('orders.submitted.title') }} ({{ restockingOrders.length }})</h3>
        </div>
        <div v-if="restockingLoading" class="loading">{{ t('common.loading') }}</div>
        <p v-else-if="restockingError" class="submitted-error">{{ restockingError }}</p>
        <p v-else-if="restockingOrders.length === 0" class="submitted-empty">
          {{ t('orders.submitted.empty') }}
          <router-link to="/restocking">{{ t('orders.submitted.emptyLink') }}</router-link>
        </p>
        <div v-else class="table-container">
          <table class="submitted-table">
            <thead>
              <tr>
                <th>{{ t('orders.submitted.table.orderNumber') }}</th>
                <th>{{ t('orders.submitted.table.submittedAt') }}</th>
                <th>{{ t('orders.submitted.table.items') }}</th>
                <th>{{ t('orders.submitted.table.status') }}</th>
                <th class="num">{{ t('orders.submitted.table.totalCost') }}</th>
                <th class="num">{{ t('orders.submitted.table.leadTime') }}</th>
                <th>{{ t('orders.submitted.table.expectedDelivery') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="order in restockingOrders" :key="order.id">
                <td><strong>{{ order.order_number }}</strong></td>
                <td>{{ formatDate(order.created_at) }}</td>
                <td>
                  <details class="items-details">
                    <summary class="items-summary">
                      {{ t('orders.itemsCount', { count: order.items.length }) }}
                    </summary>
                    <div class="items-dropdown">
                      <div v-for="line in order.items" :key="line.sku" class="item-entry">
                        <span class="item-name">{{ translateProductName(line.name) }}</span>
                        <span class="item-meta num-inline">
                          {{ line.sku }} &middot; {{ t('orders.submitted.lineMeta', { quantity: line.quantity, price: formatMoney(line.unit_cost) }) }}
                        </span>
                      </div>
                    </div>
                  </details>
                </td>
                <td>
                  <span class="marker-label">
                    <span class="marker" aria-hidden="true"></span>
                    {{ t('orders.submitted.status') }}
                  </span>
                </td>
                <td class="num"><strong>{{ formatMoney(order.total_cost) }}</strong></td>
                <td class="num">{{ t('orders.submitted.leadTimeDays', { days: order.lead_time_days }) }}</td>
                <td>{{ formatDate(order.expected_delivery) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">{{ t('orders.allOrders') }} ({{ orders.length }})</h3>
        </div>
        <div class="table-container">
          <table class="orders-table">
            <thead>
              <tr>
                <th class="col-order-number">{{ t('orders.table.orderNumber') }}</th>
                <th class="col-customer">{{ t('orders.table.customer') }}</th>
                <th class="col-items">{{ t('orders.table.items') }}</th>
                <th class="col-status">{{ t('orders.table.status') }}</th>
                <th class="col-date">{{ t('orders.table.orderDate') }}</th>
                <th class="col-date">{{ t('orders.table.expectedDelivery') }}</th>
                <th class="col-value">{{ t('orders.table.totalValue') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="order in orders" :key="order.id">
                <td class="col-order-number"><strong>{{ order.order_number }}</strong></td>
                <td class="col-customer">{{ translateCustomerName(order.customer) }}</td>
                <td class="col-items">
                  <details class="items-details">
                    <summary class="items-summary">
                      {{ t('orders.itemsCount', { count: order.items.length }) }}
                    </summary>
                    <div class="items-dropdown">
                      <div v-for="(item, idx) in order.items" :key="idx" class="item-entry">
                        <span class="item-name">{{ translateProductName(item.name) }}</span>
                        <span class="item-meta">{{ t('orders.quantity') }}: {{ item.quantity }} @ {{ currencySymbol }}{{ item.unit_price }}</span>
                      </div>
                    </div>
                  </details>
                </td>
                <td class="col-status">
                  <span :class="['badge', getOrderStatusClass(order.status)]">
                    {{ t(`status.${order.status.toLowerCase()}`) }}
                  </span>
                </td>
                <td class="col-date">{{ formatDate(order.order_date) }}</td>
                <td class="col-date">{{ formatDate(order.expected_delivery) }}</td>
                <td class="col-value"><strong>{{ currencySymbol }}{{ order.total_value.toLocaleString() }}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, watch, computed } from 'vue'
import { api } from '../api'
import { useFilters } from '../composables/useFilters'
import { useI18n } from '../composables/useI18n'

export default {
  name: 'Orders',
  setup() {
    const { t, currentCurrency, currentLocale, translateProductName, translateCustomerName } = useI18n()

    const currencySymbol = computed(() => {
      return currentCurrency.value === 'JPY' ? '¥' : '$'
    })
    const loading = ref(true)
    const error = ref(null)
    const orders = ref([])

    // Restocking orders have their own loading/error state so a failure there
    // never hides the main orders table.
    const restockingOrders = ref([])
    const restockingLoading = ref(true)
    const restockingError = ref(null)

    // Use shared filters
    const {
      selectedPeriod,
      selectedLocation,
      selectedCategory,
      selectedStatus,
      getCurrentFilters
    } = useFilters()

    const loadOrders = async () => {
      try {
        loading.value = true
        const filters = getCurrentFilters()
        const fetchedOrders = await api.getOrders(filters)

        // Sort orders by order_date (earliest first)
        orders.value = fetchedOrders.sort((a, b) => {
          const dateA = new Date(a.order_date)
          const dateB = new Date(b.order_date)
          return dateA - dateB
        })
      } catch (err) {
        error.value = 'Failed to load orders: ' + err.message
      } finally {
        loading.value = false
      }
    }

    const loadRestockingOrders = async () => {
      try {
        restockingLoading.value = true
        restockingError.value = null
        // Server already returns newest first
        restockingOrders.value = await api.getRestockingOrders()
      } catch (err) {
        restockingError.value = t('orders.submitted.loadError')
        console.error('Failed to load restocking orders:', err)
      } finally {
        restockingLoading.value = false
      }
    }

    const formatMoney = (value) => {
      const n = Number(value) || 0
      return currencySymbol.value + n.toLocaleString(currentLocale.value === 'ja' ? 'ja-JP' : 'en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    }

    // Watch for filter changes and reload data
    watch([selectedPeriod, selectedLocation, selectedCategory, selectedStatus], () => {
      loadOrders()
    })

    const getOrdersByStatus = (status) => {
      return orders.value.filter(order => order.status === status)
    }

    const getOrderStatusClass = (status) => {
      const statusMap = {
        'Delivered': 'success',
        'Shipped': 'info',
        'Processing': 'warning',
        'Backordered': 'danger'
      }
      return statusMap[status] || 'info'
    }

    const formatDate = (dateString) => {
      const locale = currentLocale.value === 'ja' ? 'ja-JP' : 'en-US'
      const date = new Date(dateString)
      if (isNaN(date.getTime())) return dateString || ''
      return date.toLocaleDateString(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    }

    onMounted(() => {
      loadOrders()
      loadRestockingOrders()
    })

    return {
      t,
      loading,
      error,
      orders,
      restockingOrders,
      restockingLoading,
      restockingError,
      formatMoney,
      getOrdersByStatus,
      getOrderStatusClass,
      formatDate,
      currencySymbol,
      translateProductName,
      translateCustomerName
    }
  }
}
</script>

<style scoped>
/* Fixed table layout to prevent column shifting */
.orders-table {
  table-layout: fixed;
  width: 100%;
}

/* Column widths */
.col-order-number {
  width: 130px;
}

.col-customer {
  width: 180px;
}

.col-items {
  width: 200px;
}

.col-status {
  width: 130px;
}

.col-date {
  width: 140px;
}

.col-value {
  width: 120px;
}

/* Items details styling */
.items-details {
  position: relative;
}

.items-summary {
  cursor: pointer;
  color: var(--c-blue);
  font-weight: 500;
  list-style: none;
  user-select: none;
  display: inline-block;
}

.items-summary::-webkit-details-marker {
  display: none;
}

.items-summary::before {
  content: '▶';
  display: inline-block;
  margin-right: 0.375rem;
  font-size: 0.75rem;
  transition: transform 0.2s;
}

.items-details[open] .items-summary::before {
  transform: rotate(90deg);
}

.items-summary:hover {
  color: var(--c-blue-hover);
  text-decoration: underline;
}

/* Dropdown container */
.items-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 0.5rem;
  background: var(--c-surface);
  border: 1px solid var(--c-line-strong);
  border-radius: var(--radius);
  padding: var(--s-2);
  z-index: 10;
  min-width: 300px;
  max-width: 400px;
}

.item-entry {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem;
  border-bottom: 1px solid var(--c-line);
}

.item-entry:last-child {
  border-bottom: none;
}

.item-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--c-ink);
}

.item-meta {
  font-size: 0.813rem;
  color: var(--c-muted);
}

/* Submitted restocking orders */
.submitted-orders {
  margin-bottom: var(--s-5);
}

.submitted-table {
  width: 100%;
  border-collapse: collapse;
}

.submitted-table .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.submitted-empty,
.submitted-error {
  margin: 0;
  padding: var(--s-3) 0;
  font-size: var(--fs-sm);
  color: var(--c-muted);
}

.submitted-error {
  color: var(--c-danger);
}

.submitted-empty a {
  color: var(--c-blue);
}

.num-inline {
  font-variant-numeric: tabular-nums;
}

/* Status as an 8px square marker plus text, not a pill */
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
  background: var(--c-info);
}
</style>
