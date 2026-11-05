<template>
  <div
    ref="rootRef"
    class="language-switcher"
    @keydown="onKeydown"
    @focusout="onFocusout"
  >
    <button
      ref="triggerRef"
      type="button"
      class="language-button"
      aria-haspopup="menu"
      :aria-expanded="isDropdownOpen ? 'true' : 'false'"
      aria-controls="language-menu"
      @click="toggleDropdown"
    >
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        class="globe-icon"
      >
        <circle cx="10" cy="10" r="7.5" stroke="currentColor" stroke-width="1.5"/>
        <path d="M3 10H17" stroke="currentColor" stroke-width="1.5"/>
        <path d="M10 3C10 3 7.5 5.5 7.5 10C7.5 14.5 10 17 10 17" stroke="currentColor" stroke-width="1.5"/>
        <path d="M10 3C10 3 12.5 5.5 12.5 10C12.5 14.5 10 17 10 17" stroke="currentColor" stroke-width="1.5"/>
      </svg>
      <span class="language-label">{{ localeName }}</span>
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
      id="language-menu"
      ref="menuRef"
      class="dropdown-menu"
      role="menu"
      @mousedown.prevent
    >
      <button
        v-for="locale in availableLocales"
        :key="locale"
        type="button"
        class="dropdown-item"
        :class="{ active: currentLocale === locale }"
        role="menuitemradio"
        :aria-checked="currentLocale === locale ? 'true' : 'false'"
        :lang="locale"
        data-menu-item
        @click="selectLanguage(locale)"
      >
        <span class="language-name">{{ getLanguageName(locale) }}</span>
        <svg
          v-if="currentLocale === locale"
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          class="check-icon"
        >
          <path d="M4 9L7.5 12.5L14 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from '../composables/useI18n'
import { useDropdownMenu } from '../composables/useDropdownMenu'

const { currentLocale, setLocale, availableLocales, localeName } = useI18n()

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

const languageNames = {
  en: 'English',
  ja: '日本語'
}

const getLanguageName = (locale) => {
  return languageNames[locale] || locale
}

const selectLanguage = (locale) => {
  setLocale(locale)
  // Hand focus back to the trigger so keyboard users are not left on <body>.
  close(true)
}
</script>

<style scoped>
/*
 * Lives in the light sidebar footer: flat full-width row, ink text, no
 * border or pill. The menu opens upward because the trigger sits at the
 * bottom of the viewport; on narrow screens (top bar) it opens downward.
 */
.language-switcher {
  position: relative;
}

.language-button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-2) var(--s-3);
  background: transparent;
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
  font-family: inherit;
  font-size: var(--fs-sm);
  color: var(--c-ink-2);
}

.language-button:hover {
  color: var(--c-navy);
  background: var(--c-hover);
}

.globe-icon {
  flex-shrink: 0;
  color: var(--c-muted);
}

.language-label {
  flex: 1;
  text-align: left;
  font-weight: 500;
}

.chevron {
  transition: transform 0.15s ease;
  flex-shrink: 0;
  /* Points up at rest because the menu opens upward. */
  transform: rotate(180deg);
}

.chevron-open {
  transform: rotate(0deg);
}

.dropdown-menu {
  position: absolute;
  bottom: calc(100% + var(--s-1));
  left: 0;
  min-width: 180px;
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: var(--radius);
  box-shadow: 0 4px 16px rgba(0, 31, 61, 0.12);
  z-index: 1000;
  overflow: hidden;
}

.dropdown-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
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

.dropdown-item.active {
  color: var(--c-navy);
  font-weight: 700;
}

.language-name {
  flex: 1;
}

.check-icon {
  color: var(--c-blue);
  flex-shrink: 0;
}

@media (max-width: 900px) {
  .language-button {
    width: auto;
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
