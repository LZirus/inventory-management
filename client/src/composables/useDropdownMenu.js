import { ref, nextTick, watch, onBeforeUnmount } from 'vue'

// Shared open/close and keyboard behaviour for the small sidebar menus
// (LanguageSwitcher, ProfileMenu). WCAG 2.1.1: everything that works with the
// mouse must work with the keyboard, so:
// - the trigger is a real <button> toggled with click (Enter/Space included);
// - every item is a <button> reachable with Tab; Arrow keys/Home/End also move;
// - Esc closes and returns focus to the trigger;
// - the menu closes as soon as focus leaves the component (Tab past the last
//   item, Shift+Tab before the trigger, or a click elsewhere).
export function useDropdownMenu() {
  const isOpen = ref(false)
  const rootRef = ref(null)
  const triggerRef = ref(null)
  const menuRef = ref(null)

  const getItems = () => {
    if (!menuRef.value) return []
    return Array.from(menuRef.value.querySelectorAll('[data-menu-item]'))
  }

  const focusItem = (index) => {
    const items = getItems()
    if (!items.length) return
    // Wrap around at both ends.
    const next = (index + items.length) % items.length
    items[next].focus()
  }

  const open = async (focusFirst = false) => {
    isOpen.value = true
    if (focusFirst) {
      await nextTick()
      focusItem(0)
    }
  }

  const close = (returnFocus = false) => {
    isOpen.value = false
    if (returnFocus && triggerRef.value) triggerRef.value.focus()
  }

  // A click fired by Enter/Space has event.detail === 0. In that case move
  // focus into the menu so keyboard users land on the first item; mouse users
  // keep focus on the trigger as before.
  const toggle = (event) => {
    if (isOpen.value) {
      close()
    } else {
      open(event && event.detail === 0)
    }
  }

  const onKeydown = (event) => {
    if (!isOpen.value) {
      // Opening with ArrowUp/ArrowDown from the trigger is a common menu habit.
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && event.target === triggerRef.value) {
        event.preventDefault()
        open(true)
      }
      return
    }
    const items = getItems()
    const current = items.indexOf(document.activeElement)
    switch (event.key) {
      case 'Escape':
        event.preventDefault()
        close(true)
        break
      case 'ArrowDown':
        event.preventDefault()
        focusItem(current + 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        focusItem(current === -1 ? items.length - 1 : current - 1)
        break
      case 'Home':
        event.preventDefault()
        focusItem(0)
        break
      case 'End':
        event.preventDefault()
        focusItem(items.length - 1)
        break
    }
  }

  // focusout bubbles (unlike blur). relatedTarget is where focus goes next;
  // if that is still inside the component the menu stays open. When it is null
  // (click on non-focusable page area) the menu closes as well.
  const onFocusout = (event) => {
    if (!isOpen.value) return
    const next = event.relatedTarget
    if (next && rootRef.value && rootRef.value.contains(next)) return
    close()
  }

  // Safari does not focus buttons on mouse click, so a click outside may never
  // produce a focusout. Close on any pointer press outside the component too.
  const onDocumentPointerdown = (event) => {
    if (rootRef.value && !rootRef.value.contains(event.target)) close()
  }
  watch(isOpen, (value) => {
    if (value) document.addEventListener('pointerdown', onDocumentPointerdown)
    else document.removeEventListener('pointerdown', onDocumentPointerdown)
  })
  onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerdown))

  return { isOpen, rootRef, triggerRef, menuRef, toggle, close, onKeydown, onFocusout }
}
