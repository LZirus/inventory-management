<template>
  <!--
    Slim page toolbar: active filters as removable tags plus one "Filters"
    button that opens a right-side drawer. Hidden on pages that ignore the
    global filters (see pagesWithoutFilters).
  -->
  <div v-if="showToolbar" class="page-toolbar">
    <ul v-if="activeFilters.length" class="filter-tags" :aria-label="t('filters.activeFilters')">
      <li v-for="filter in activeFilters" :key="filter.key" class="filter-tag">
        <span class="filter-tag-text">{{ filter.label }}</span>
        <button
          type="button"
          class="filter-tag-remove"
          :aria-label="t('filters.removeFilter', { name: filter.label })"
          @click="filter.clear"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" stroke-width="1.5" />
          </svg>
        </button>
      </li>
    </ul>

    <button
      v-if="activeFilters.length"
      type="button"
      class="text-btn"
      @click="resetFilters"
    >
      {{ t('filters.clearAll') }}
    </button>

    <button
      ref="triggerRef"
      type="button"
      class="filters-trigger"
      aria-haspopup="dialog"
      :aria-expanded="isOpen ? 'true' : 'false'"
      @click="openDrawer"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2 4h12M4.5 8h7M7 12h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" />
      </svg>
      <span>{{ t('filters.filters') }}</span>
      <span v-if="activeFilters.length" class="filters-count">{{ activeFilters.length }}</span>
    </button>
  </div>

  <Teleport to="body">
    <Transition name="drawer-fade">
      <div v-if="isOpen" class="drawer-overlay" @click="closeDrawer" />
    </Transition>

    <Transition name="drawer-slide" @after-enter="focusFirstField">
      <aside
        v-if="isOpen"
        ref="drawerRef"
        class="filter-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-drawer-title"
        tabindex="-1"
        @keydown="onDrawerKeydown"
      >
        <header class="drawer-header">
          <h2 id="filter-drawer-title" class="drawer-title">{{ t('filters.filters') }}</h2>
          <button
            type="button"
            class="drawer-close"
            :aria-label="t('filters.close')"
            @click="closeDrawer"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.5" />
            </svg>
          </button>
        </header>

        <div class="drawer-body">
          <div v-for="field in fields" :key="field.key" class="drawer-field">
            <label :for="'filter-' + field.key" class="drawer-label">{{ field.label }}</label>
            <select
              :id="'filter-' + field.key"
              v-model="field.model.value"
              class="drawer-select"
            >
              <option v-for="option in field.options" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </div>
        </div>

        <footer class="drawer-footer">
          <button
            type="button"
            class="btn-secondary"
            :disabled="!hasActiveFilters"
            @click="resetFilters"
          >
            {{ t('filters.reset') }}
          </button>
          <button type="button" class="btn-primary" @click="closeDrawer">
            {{ t('filters.done') }}
          </button>
        </footer>
      </aside>
    </Transition>
  </Teleport>
</template>

<script>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { useFilters } from '../composables/useFilters'
import { useI18n } from '../composables/useI18n'

// Routes whose views ignore the global filters; the toolbar is hidden there.
const pagesWithoutFilters = ['/restocking']

// Month values sent to the API, paired with their locale key.
const MONTHS = [
  ['2025-01', 'january'], ['2025-02', 'february'], ['2025-03', 'march'],
  ['2025-04', 'april'], ['2025-05', 'may'], ['2025-06', 'june'],
  ['2025-07', 'july'], ['2025-08', 'august'], ['2025-09', 'september'],
  ['2025-10', 'october'], ['2025-11', 'november'], ['2025-12', 'december']
]

const FOCUSABLE = 'button:not([disabled]), select, [href], input, [tabindex]:not([tabindex="-1"])'

export default {
  name: 'FilterBar',
  setup() {
    const {
      selectedPeriod,
      selectedLocation,
      selectedCategory,
      selectedStatus,
      hasActiveFilters,
      resetFilters
    } = useFilters()

    const { t } = useI18n()
    const route = useRoute()

    const isOpen = ref(false)
    const triggerRef = ref(null)
    const drawerRef = ref(null)

    const showToolbar = computed(() => !pagesWithoutFilters.includes(route.path))

    /*
     * Single description of the four filters. Drives both the drawer selects
     * and the tag labels, so option values and display names stay in sync.
     * Computed so labels follow the active locale.
     */
    const fields = computed(() => [
      {
        key: 'period',
        label: t('filters.timePeriod'),
        model: selectedPeriod,
        options: [
          { value: 'all', label: t('filters.allMonths') },
          ...MONTHS.map(([value, name]) => ({ value, label: t('months.' + name) }))
        ]
      },
      {
        key: 'location',
        label: t('filters.location'),
        model: selectedLocation,
        options: [
          { value: 'all', label: t('filters.all') },
          { value: 'San Francisco', label: t('warehouses.sanFrancisco') },
          { value: 'London', label: t('warehouses.london') },
          { value: 'Tokyo', label: t('warehouses.tokyo') }
        ]
      },
      {
        key: 'category',
        label: t('filters.category'),
        model: selectedCategory,
        options: [
          { value: 'all', label: t('filters.all') },
          { value: 'circuit boards', label: t('categories.circuitBoards') },
          { value: 'sensors', label: t('categories.sensors') },
          { value: 'actuators', label: t('categories.actuators') },
          { value: 'controllers', label: t('categories.controllers') },
          { value: 'power supplies', label: t('categories.powerSupplies') }
        ]
      },
      {
        key: 'status',
        label: t('filters.orderStatus'),
        model: selectedStatus,
        options: [
          { value: 'all', label: t('filters.all') },
          { value: 'delivered', label: t('status.delivered') },
          { value: 'shipped', label: t('status.shipped') },
          { value: 'processing', label: t('status.processing') },
          { value: 'backordered', label: t('status.backordered') }
        ]
      }
    ])

    // One tag per filter that is not on "all"; clearing resets only that ref.
    const activeFilters = computed(() =>
      fields.value
        .filter(field => field.model.value !== 'all')
        .map(field => {
          const option = field.options.find(o => o.value === field.model.value)
          return {
            key: field.key,
            label: option ? option.label : field.model.value,
            clear: () => { field.model.value = 'all' }
          }
        })
    )

    const openDrawer = () => {
      isOpen.value = true
    }

    const closeDrawer = () => {
      isOpen.value = false
    }

    // Focus lands on the first select once the slide-in has finished.
    const focusFirstField = () => {
      const first = drawerRef.value && drawerRef.value.querySelector('select')
      if (first) first.focus()
    }

    // Esc closes; Tab cycles within the drawer because it is modal.
    const onDrawerKeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeDrawer()
        return
      }
      if (event.key !== 'Tab' || !drawerRef.value) return
      const items = Array.from(drawerRef.value.querySelectorAll(FOCUSABLE))
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    // Lock page scroll while open and hand focus back to the trigger on close.
    watch(isOpen, async (open) => {
      document.body.style.overflow = open ? 'hidden' : ''
      if (!open) {
        await nextTick()
        if (triggerRef.value) triggerRef.value.focus()
      }
    })

    // Navigating to a page without filters must not leave the drawer open.
    watch(showToolbar, (visible) => {
      if (!visible) isOpen.value = false
    })

    onBeforeUnmount(() => {
      document.body.style.overflow = ''
    })

    return {
      t,
      isOpen,
      triggerRef,
      drawerRef,
      showToolbar,
      fields,
      activeFilters,
      hasActiveFilters,
      resetFilters,
      openDrawer,
      closeDrawer,
      focusFirstField,
      onDrawerKeydown
    }
  }
}
</script>

<style scoped>
/* ---------- Toolbar ---------- */

.page-toolbar {
  max-width: 1600px;
  min-height: 56px;
  padding: var(--s-3) var(--s-6) 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--s-3);
}

.filter-tags {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--s-2);
  min-width: 0;
}

/* Quiet removable tag: hairline box, 2px corners, no fill colour. */
.filter-tag {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding-left: var(--s-2);
  border: 1px solid var(--c-line);
  border-radius: var(--radius);
  background: var(--c-surface);
  font-size: var(--fs-sm);
  color: var(--c-ink-2);
  white-space: nowrap;
}

.filter-tag-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  background: none;
  color: var(--c-faint);
  cursor: pointer;
  border-radius: var(--radius);
}

.filter-tag-remove:hover {
  color: var(--c-ink);
}

.text-btn {
  border: none;
  background: none;
  padding: var(--s-1) var(--s-1);
  font-size: var(--fs-sm);
  font-weight: 500;
  color: var(--c-blue);
  cursor: pointer;
  white-space: nowrap;
  border-radius: var(--radius);
}

.text-btn:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.filters-trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  height: 32px;
  padding: 0 var(--s-3);
  border: 1px solid var(--c-line-strong);
  border-radius: var(--radius);
  background: var(--c-surface);
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--c-navy);
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.15s ease;
}

.filters-trigger:hover {
  border-color: var(--c-navy);
}

/* Count sits on the same lime as the nav marker: the one allowed reuse. */
.filters-count {
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--c-lime);
  color: var(--c-navy);
  font-size: var(--fs-xs);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  border-radius: var(--radius);
}

/* ---------- Drawer ---------- */

.drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 31, 61, 0.18);
  z-index: 900;
}

.filter-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 360px;
  max-width: 100%;
  background: var(--c-surface);
  border-left: 1px solid var(--c-line);
  /* Soft edge so the white panel separates from a white page. */
  box-shadow: -8px 0 24px rgba(0, 31, 61, 0.06);
  z-index: 901;
  display: flex;
  flex-direction: column;
  outline: none;
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--s-5) var(--s-5) var(--s-4);
}

.drawer-title {
  font-family: var(--font-display);
  font-size: var(--fs-lg);
  font-weight: 600;
  letter-spacing: -0.015em;
  color: var(--c-navy);
}

.drawer-close {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  color: var(--c-muted);
  cursor: pointer;
  border-radius: var(--radius);
}

.drawer-close:hover {
  color: var(--c-ink);
  background: var(--c-hover);
}

.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--s-2) var(--s-5) var(--s-5);
  display: flex;
  flex-direction: column;
  gap: var(--s-5);
}

.drawer-field {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}

.drawer-label {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--c-ink);
}

/* Every select is the same 40px box; native arrow replaced for consistency. */
.drawer-select {
  width: 100%;
  height: 40px;
  padding: 0 36px 0 var(--s-3);
  border: 1px solid var(--c-line-strong);
  border-radius: var(--radius);
  background-color: var(--c-surface);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 4.5L6 8l3.5-3.5' fill='none' stroke='%23565963' stroke-width='1.5'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  appearance: none;
  -webkit-appearance: none;
  font-size: var(--fs-base);
  color: var(--c-ink);
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.drawer-select:hover {
  border-color: var(--c-muted);
}

.drawer-select:focus-visible {
  border-color: var(--c-blue);
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--s-3);
  padding: var(--s-4) var(--s-5);
  border-top: 1px solid var(--c-line);
}

.btn-secondary,
.btn-primary {
  height: 40px;
  padding: 0 var(--s-5);
  border-radius: var(--radius);
  font-size: var(--fs-base);
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.btn-secondary {
  background: var(--c-surface);
  border: 1px solid var(--c-line-strong);
  color: var(--c-navy);
}

.btn-secondary:hover:not(:disabled) {
  border-color: var(--c-navy);
}

.btn-secondary:disabled {
  color: var(--c-faint);
  cursor: not-allowed;
}

.btn-primary {
  background: var(--c-blue);
  border: 1px solid var(--c-blue);
  color: #fff;
}

.btn-primary:hover {
  background: var(--c-blue-hover);
  border-color: var(--c-blue-hover);
}

/* ---------- Transitions ---------- */

.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: transform 180ms ease-out;
}

.drawer-slide-enter-from,
.drawer-slide-leave-to {
  transform: translateX(100%);
}

.drawer-fade-enter-active,
.drawer-fade-leave-active {
  transition: opacity 180ms ease-out;
}

.drawer-fade-enter-from,
.drawer-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .drawer-slide-enter-active,
  .drawer-slide-leave-active,
  .drawer-fade-enter-active,
  .drawer-fade-leave-active {
    transition: none;
  }
}

/* ---------- Narrow screens ---------- */

@media (max-width: 900px) {
  .page-toolbar {
    padding: var(--s-3) var(--s-4) 0;
    min-height: 48px;
  }
}

@media (max-width: 600px) {
  .page-toolbar {
    flex-wrap: wrap;
  }

  .filter-tags {
    order: 2;
    width: 100%;
    justify-content: flex-start;
  }

  .filter-drawer {
    width: 100%;
    border-left: none;
  }
}
</style>
