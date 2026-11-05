<template>
  <div
    ref="rootRef"
    class="profile-menu"
    @keydown="onKeydown"
    @focusout="onFocusout"
  >
    <button
      ref="triggerRef"
      type="button"
      class="profile-button"
      aria-haspopup="menu"
      :aria-expanded="isDropdownOpen ? 'true' : 'false'"
      aria-controls="profile-menu-list"
      @click="toggleDropdown"
    >
      <div class="avatar" aria-hidden="true">
        {{ getInitials(currentUser.name) }}
      </div>
      <span class="profile-name">{{ currentUser.name }}</span>
      <svg
        aria-hidden="true"
        class="chevron"
        :class="{ 'chevron-open': isDropdownOpen }"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
      >
        <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </button>

    <!-- mousedown.prevent keeps focus where it is while clicking an item, so
         focusout does not close the menu before the click lands (Safari). -->
    <div
      v-if="isDropdownOpen"
      id="profile-menu-list"
      ref="menuRef"
      class="dropdown-menu"
      role="menu"
      :aria-label="currentUser.name"
      @mousedown.prevent
    >
      <div class="dropdown-header" role="presentation">
        <div class="avatar-large" aria-hidden="true">
          {{ getInitials(currentUser.name) }}
        </div>
        <div class="user-info">
          <div class="user-name">{{ currentUser.name }}</div>
          <div class="user-email">{{ currentUser.email }}</div>
        </div>
      </div>

      <div class="dropdown-divider" role="separator"></div>

      <button
        class="dropdown-item"
        type="button"
        role="menuitem"
        data-menu-item
        @click="showProfileDetails"
      >
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M9 9C10.6569 9 12 7.65685 12 6C12 4.34315 10.6569 3 9 3C7.34315 3 6 4.34315 6 6C6 7.65685 7.34315 9 9 9Z" stroke="currentColor" stroke-width="1.5"/>
          <path d="M15 15C15 12.7909 12.3137 11 9 11C5.68629 11 3 12.7909 3 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        {{ t('profile.profileDetails') }}
      </button>

      <button
        class="dropdown-item"
        type="button"
        role="menuitem"
        data-menu-item
        @click="showTasks"
      >
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M15 3H3C2.44772 3 2 3.44772 2 4V14C2 14.5523 2.44772 15 3 15H15C15.5523 15 16 14.5523 16 14V4C16 3.44772 15.5523 3 15 3Z" stroke="currentColor" stroke-width="1.5"/>
          <path d="M6 7L8 9L12 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        {{ t('profile.myTasks') }}
        <span v-if="pendingTaskCount > 0" class="task-badge">{{ pendingTaskCount }}</span>
      </button>

      <div class="dropdown-divider" role="separator"></div>

      <button
        class="dropdown-item logout"
        type="button"
        role="menuitem"
        data-menu-item
        @click="handleLogout"
      >
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M7 15H4C3.44772 15 3 14.5523 3 14V4C3 3.44772 3.44772 3 4 3H7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M11 12L15 9M15 9L11 6M15 9H7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        {{ t('profile.logout') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAuth } from '../composables/useAuth'
import { useI18n } from '../composables/useI18n'
import { useDropdownMenu } from '../composables/useDropdownMenu'

const { currentUser, logout, getInitials } = useAuth()
const { t } = useI18n()

// Open state, focus handling and keyboard support live in the composable.
const {
  isOpen: isDropdownOpen,
  rootRef,
  triggerRef,
  menuRef,
  toggle: toggleDropdown,
  close,
  onKeydown,
  onFocusout
} = useDropdownMenu()
const emit = defineEmits(['show-profile-details', 'show-tasks'])

const pendingTaskCount = computed(() => {
  return currentUser.value.tasks.filter(task => task.status === 'pending').length
})

const showProfileDetails = () => {
  close()
  emit('show-profile-details')
}

const showTasks = () => {
  close()
  emit('show-tasks')
}

const handleLogout = () => {
  close()
  logout()
}
</script>

<style scoped>
/*
 * Light sidebar footer variant: flat row with a square navy initials block,
 * ink text.
 * The menu opens upward and extends to the right of the sidebar, since it is
 * wider (280px) than the sidebar itself; on narrow screens it opens downward.
 */
.profile-menu {
  position: relative;
}

.profile-button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-2) var(--s-3);
  background: transparent;
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
  font-family: inherit;
  color: var(--c-ink-2);
}

.profile-button:hover {
  color: var(--c-navy);
  background: var(--c-hover);
}

.avatar {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: var(--radius);
  background: var(--c-navy);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: var(--fs-xs);
}

.profile-name {
  flex: 1;
  min-width: 0;
  text-align: left;
  font-size: var(--fs-sm);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chevron {
  flex-shrink: 0;
  color: var(--c-muted);
  transition: transform 0.15s ease;
  transform: rotate(180deg);
}

.chevron-open {
  transform: rotate(0deg);
}

.dropdown-menu {
  position: absolute;
  bottom: calc(100% + var(--s-1));
  left: 0;
  min-width: 280px;
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: var(--radius);
  box-shadow: 0 4px 16px rgba(0, 31, 61, 0.12);
  z-index: 1000;
  overflow: hidden;
}

.dropdown-header {
  padding: var(--s-4);
  display: flex;
  gap: var(--s-3);
  align-items: center;
}

.avatar-large {
  width: 40px;
  height: 40px;
  border-radius: var(--radius);
  background: var(--c-navy);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: var(--fs-base);
  flex-shrink: 0;
}

.user-info {
  flex: 1;
  min-width: 0;
}

.user-name {
  font-weight: 700;
  color: var(--c-ink);
  font-size: var(--fs-base);
  margin-bottom: 2px;
}

.user-email {
  font-size: var(--fs-sm);
  color: var(--c-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdown-divider {
  height: 1px;
  background: var(--c-line);
  margin: var(--s-1) 0;
}

.dropdown-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: 10px var(--s-4);
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s ease;
  font-family: inherit;
  font-size: var(--fs-sm);
  font-weight: 500;
  color: var(--c-ink-2);
}

.dropdown-item:hover {
  background: var(--c-hover);
}

.dropdown-item svg {
  color: var(--c-muted);
  flex-shrink: 0;
}

.dropdown-item.logout,
.dropdown-item.logout svg {
  color: var(--c-danger);
}

.dropdown-item.logout:hover {
  background: var(--c-danger-bg);
}

/* Plain count, no pill. */
.task-badge {
  margin-left: auto;
  color: var(--c-blue);
  font-size: var(--fs-sm);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 900px) {
  .profile-button {
    width: auto;
  }

  .profile-name {
    display: none;
  }

  .chevron {
    transform: none;
  }

  .chevron-open {
    transform: rotate(180deg);
  }

  .dropdown-menu {
    bottom: auto;
    top: calc(100% + var(--s-1));
    left: auto;
    right: 0;
  }
}
</style>
