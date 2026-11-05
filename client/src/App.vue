<template>
  <div class="app">
    <!--
      Left vertical sidebar (operations-app layout). Brand on top, plain text
      nav in the middle, language + profile controls pinned to the bottom.
      Below 900px the same element turns into a horizontal top bar (see the
      media query in the global styles).
    -->
    <aside class="sidebar">
      <div class="sidebar-brand">
        <BrandLockup size="sm" class="brand-lockup-slot" />
        <span class="brand-name">{{ t('nav.companyName') }}</span>
        <span class="brand-subtitle">{{ t('nav.subtitle') }}</span>
      </div>
      <nav class="sidebar-nav" aria-label="Main">
        <router-link to="/" :class="{ active: $route.path === '/' }">
          <span class="nav-label">{{ t('nav.overview') }}</span>
        </router-link>
        <router-link to="/inventory" :class="{ active: $route.path === '/inventory' }">
          <span class="nav-label">{{ t('nav.inventory') }}</span>
        </router-link>
        <router-link to="/orders" :class="{ active: $route.path === '/orders' }">
          <span class="nav-label">{{ t('nav.orders') }}</span>
        </router-link>
        <router-link to="/spending" :class="{ active: $route.path === '/spending' }">
          <span class="nav-label">{{ t('nav.finance') }}</span>
        </router-link>
        <router-link to="/demand" :class="{ active: $route.path === '/demand' }">
          <span class="nav-label">{{ t('nav.demandForecast') }}</span>
        </router-link>
        <router-link to="/restocking" :class="{ active: $route.path === '/restocking' }">
          <span class="nav-label">{{ t('nav.restocking') }}</span>
        </router-link>
        <router-link to="/reports" :class="{ active: $route.path === '/reports' }">
          <span class="nav-label">{{ t('nav.reports') }}</span>
        </router-link>
      </nav>
      <div class="sidebar-footer">
        <LanguageSwitcher />
        <ProfileMenu
          @show-profile-details="showProfileDetails = true"
          @show-tasks="showTasks = true"
        />
      </div>
    </aside>

    <div class="main-area">
      <FilterBar />
      <main class="main-content">
        <router-view />
      </main>
    </div>

    <ProfileDetailsModal
      :is-open="showProfileDetails"
      @close="showProfileDetails = false"
    />

    <TasksModal
      :is-open="showTasks"
      :tasks="tasks"
      @close="showTasks = false"
      @add-task="addTask"
      @delete-task="deleteTask"
      @toggle-task="toggleTask"
    />
  </div>
</template>

<script>
import { ref, onMounted, computed } from 'vue'
import { api } from './api'
import { useAuth } from './composables/useAuth'
import { useI18n } from './composables/useI18n'
import FilterBar from './components/FilterBar.vue'
import ProfileMenu from './components/ProfileMenu.vue'
import ProfileDetailsModal from './components/ProfileDetailsModal.vue'
import TasksModal from './components/TasksModal.vue'
import LanguageSwitcher from './components/LanguageSwitcher.vue'
import BrandLockup from './components/BrandLockup.vue'

export default {
  name: 'App',
  components: {
    FilterBar,
    ProfileMenu,
    ProfileDetailsModal,
    TasksModal,
    LanguageSwitcher,
    BrandLockup
  },
  setup() {
    const { currentUser } = useAuth()
    const { t } = useI18n()
    const showProfileDetails = ref(false)
    const showTasks = ref(false)
    const apiTasks = ref([])

    // Merge mock tasks from currentUser with API tasks
    const tasks = computed(() => {
      return [...currentUser.value.tasks, ...apiTasks.value]
    })

    const loadTasks = async () => {
      try {
        apiTasks.value = await api.getTasks()
      } catch (err) {
        console.error('Failed to load tasks:', err)
      }
    }

    const addTask = async (taskData) => {
      try {
        const newTask = await api.createTask(taskData)
        // Add new task to the beginning of the array
        apiTasks.value.unshift(newTask)
      } catch (err) {
        console.error('Failed to add task:', err)
      }
    }

    const deleteTask = async (taskId) => {
      try {
        // Check if it's a mock task (from currentUser)
        const isMockTask = currentUser.value.tasks.some(t => t.id === taskId)

        if (isMockTask) {
          // Remove from mock tasks
          const index = currentUser.value.tasks.findIndex(t => t.id === taskId)
          if (index !== -1) {
            currentUser.value.tasks.splice(index, 1)
          }
        } else {
          // Remove from API tasks
          await api.deleteTask(taskId)
          apiTasks.value = apiTasks.value.filter(t => t.id !== taskId)
        }
      } catch (err) {
        console.error('Failed to delete task:', err)
      }
    }

    const toggleTask = async (taskId) => {
      try {
        // Check if it's a mock task (from currentUser)
        const mockTask = currentUser.value.tasks.find(t => t.id === taskId)

        if (mockTask) {
          // Toggle mock task status
          mockTask.status = mockTask.status === 'pending' ? 'completed' : 'pending'
        } else {
          // Toggle API task
          const updatedTask = await api.toggleTask(taskId)
          const index = apiTasks.value.findIndex(t => t.id === taskId)
          if (index !== -1) {
            apiTasks.value[index] = updatedTask
          }
        }
      } catch (err) {
        console.error('Failed to toggle task:', err)
      }
    }

    onMounted(loadTasks)

    return {
      t,
      showProfileDetails,
      showTasks,
      tasks,
      addTask,
      deleteTask,
      toggleTask
    }
  }
}
</script>

<style>
/*
 * Global styles. All colours, type and spacing come from styles/tokens.css.
 * Design intent: calm operations app, flat surfaces, 2px corners, no shadows,
 * sentence-case labels. The lime accent is reserved for the marker swipe on
 * the active nav item so it stays the one memorable highlight.
 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: var(--font);
  font-size: var(--fs-base);
  background: var(--c-bg);
  color: var(--c-ink);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

button,
input,
select,
textarea {
  font-family: inherit;
}

/* One consistent keyboard focus indicator across the app. */
:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.app {
  min-height: 100vh;
}

/* ---------- Sidebar ---------- */

/*
 * Light sidebar: a hair off the canvas, separated by one hairline. TRUSTEQ is
 * an orientation, not a costume, so navy only appears as text colour here.
 */
.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: var(--sidebar-w);
  background: var(--c-sidebar);
  border-right: 1px solid var(--c-line);
  color: var(--c-ink);
  display: flex;
  flex-direction: column;
  z-index: 100;
}

.sidebar-brand {
  padding: var(--s-5) var(--s-5) var(--s-4);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

/* 10px + the 2px flex gap = ~12px between lockup and company name. */
.brand-lockup-slot {
  margin-bottom: 10px;
}

.brand-name {
  font-size: var(--fs-md);
  font-weight: 700;
  color: var(--c-navy);
  line-height: 1.25;
}

.brand-subtitle {
  font-size: var(--fs-xs);
  color: var(--c-muted);
}

/* Only the nav list scrolls; the footer must not clip its upward dropdowns. */
.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: var(--s-3) var(--s-3);
  gap: 1px;
}

.sidebar-nav a {
  display: block;
  padding: 8px var(--s-3);
  color: var(--c-ink-2);
  text-decoration: none;
  font-size: var(--fs-base);
  font-weight: 500;
  border-radius: var(--radius);
  transition: color 0.15s ease, background-color 0.15s ease;
}

.sidebar-nav a:hover {
  color: var(--c-navy);
  background: var(--c-hover);
}

.sidebar-nav a.active {
  color: var(--c-navy);
  font-weight: 600;
}

/* The active row itself gets no fill; the marker on the label carries it. */
.sidebar-nav a.active:hover {
  background: transparent;
}

/*
 * Signature: a lime highlighter swipe behind the label text only.
 * The hard-stop gradient leaves the top ~38% and bottom ~8% of the line box
 * transparent, so the band sits low on the x-height like a marker stroke
 * rather than filling a box. Square ends, small horizontal overhang via
 * padding/negative margin so the text does not shift between states.
 * box-decoration-break keeps the swipe per-line if a label ever wraps.
 * This (and the FilterBar count) is the only place lime is used.
 */
.nav-label {
  padding: 0 3px;
  margin: 0 -3px;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}

.sidebar-nav a.active .nav-label {
  background: linear-gradient(
    transparent 38%,
    var(--c-lime) 38%,
    var(--c-lime) 92%,
    transparent 92%
  );
}

.sidebar-nav a:focus-visible,
.sidebar-footer :focus-visible {
  box-shadow: var(--focus-ring);
}

.sidebar-footer {
  border-top: 1px solid var(--c-line);
  padding: var(--s-2) var(--s-3) var(--s-3);
  display: flex;
  flex-direction: column;
}

/* Hairline between the language row and the profile row. */
.sidebar-footer > * + * {
  border-top: 1px solid var(--c-line);
}

/* ---------- Main area ---------- */

.main-area {
  margin-left: var(--sidebar-w);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.main-content {
  flex: 1;
  max-width: 1600px;
  width: 100%;
  padding: var(--s-5) var(--s-6) var(--s-7);
}

.page-header {
  margin-bottom: var(--s-5);
}

.page-header h2 {
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--c-navy);
  line-height: 1.15;
  margin-bottom: var(--s-2);
}

.page-header p {
  color: var(--c-muted);
  font-size: var(--fs-base);
  max-width: 64ch;
  line-height: 1.5;
}

/* ---------- Stats ---------- */

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--s-4) var(--s-6);
  margin-bottom: var(--s-6);
}

/*
 * KPIs are figures on the canvas, not tiles: no box, just a hairline above
 * each one. Status colour lives on the value only.
 */
.stat-card {
  padding: var(--s-3) 0 var(--s-2);
  border-top: 1px solid var(--c-line);
}

.stat-label {
  color: var(--c-muted);
  font-size: var(--fs-sm);
  font-weight: 500;
  margin-bottom: var(--s-1);
}

.stat-value {
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--c-ink);
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}

.stat-card.warning .stat-value { color: var(--c-warning); }
.stat-card.success .stat-value { color: var(--c-success); }
.stat-card.danger .stat-value { color: var(--c-danger); }
.stat-card.info .stat-value { color: var(--c-info); }

/* ---------- Cards ---------- */

.card {
  background: var(--c-surface);
  border-radius: var(--radius);
  padding: var(--s-5);
  border: 1px solid var(--c-line);
  margin-bottom: var(--s-5);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  /* Spacing instead of a rule: one fewer line inside every card. */
  margin-bottom: var(--s-4);
}

.card-title {
  font-family: var(--font);
  font-size: var(--fs-md);
  font-weight: 700;
  color: var(--c-navy);
}

/* ---------- Tables ---------- */

.table-container {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}

thead {
  background: var(--c-surface-alt);
  border-top: 1px solid var(--c-line);
  border-bottom: 1px solid var(--c-line);
}

th {
  text-align: left;
  padding: var(--s-2) var(--s-3);
  font-weight: 600;
  color: var(--c-muted);
  font-size: var(--fs-sm);
}

td {
  padding: var(--s-2) var(--s-3);
  border-top: 1px solid var(--c-line);
  color: var(--c-ink-2);
  font-size: var(--fs-sm);
}

tbody tr {
  transition: background-color 0.15s ease;
}

tbody tr:hover {
  background: var(--c-hover);
}

/* ---------- Badges ---------- */

/*
 * Status "badges" are plain text with a small square marker, not pills.
 * The marker takes currentColor, so each modifier only sets the text colour.
 */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-sm);
  font-weight: 400;
  color: var(--c-ink-2);
  white-space: nowrap;
}

.badge::before {
  content: '';
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  background: currentColor;
}

.badge.success,
.badge.increasing { color: var(--c-success); }

.badge.warning,
.badge.medium { color: var(--c-warning); }

.badge.danger,
.badge.decreasing,
.badge.high { color: var(--c-danger); }

.badge.info,
.badge.low { color: var(--c-info); }

.badge.stable { color: var(--c-muted); }

/* ---------- States ---------- */

.loading {
  text-align: center;
  padding: var(--s-7);
  color: var(--c-muted);
  font-size: var(--fs-base);
}

.error {
  background: var(--c-danger-bg);
  border: 1px solid var(--c-danger);
  border-left-width: 2px;
  color: var(--c-danger);
  padding: var(--s-4);
  border-radius: var(--radius);
  margin: var(--s-4) 0;
  font-size: var(--fs-base);
}

/* ---------- Narrow screens: sidebar becomes a top bar ---------- */

@media (max-width: 900px) {
  /* Brand + lockup left, footer controls right, nav scrolls underneath. */
  .sidebar {
    position: sticky;
    bottom: auto;
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--c-line);
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'brand footer'
      'nav nav';
  }

  .sidebar-brand {
    grid-area: brand;
    flex-direction: row;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-3) var(--s-4);
    min-width: 0;
  }

  .brand-lockup-slot {
    margin-bottom: 0;
    flex: none;
  }

  .brand-name {
    font-size: var(--fs-base);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .brand-subtitle {
    display: none;
  }

  .sidebar-nav {
    grid-area: nav;
    flex-direction: row;
    overflow-x: auto;
    overflow-y: hidden;
    padding: var(--s-1) var(--s-2);
    gap: 0;
    border-top: 1px solid var(--c-line);
  }

  .sidebar-nav a {
    white-space: nowrap;
    padding: 8px var(--s-3);
  }

  .sidebar-footer {
    grid-area: footer;
    flex-direction: row;
    align-items: center;
    border-top: none;
    padding: var(--s-2) var(--s-3);
  }

  .sidebar-footer > * + * {
    border-top: none;
    border-left: 1px solid var(--c-line);
  }

  .main-area {
    margin-left: 0;
  }

  .main-content {
    padding: var(--s-4);
  }

  .page-header h2 {
    font-size: 26px;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
</style>
