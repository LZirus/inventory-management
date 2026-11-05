<template>
  <span
    class="brand-lockup"
    :class="`brand-lockup--${size}`"
    role="img"
    aria-label="TRUSTEQ × Anthropic"
  >
    <img class="brand-lockup__trusteq" :src="trusteqUrl" alt="" aria-hidden="true" />
    <svg
      class="brand-lockup__x"
      viewBox="0 0 10 10"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M1 1 9 9M9 1 1 9" />
    </svg>
    <img class="brand-lockup__anthropic" :src="anthropicUrl" alt="" aria-hidden="true" />
  </span>
</template>

<script>
import trusteqUrl from '../assets/brand/trusteq.svg'
import anthropicUrl from '../assets/brand/anthropic.svg'

export default {
  name: 'BrandLockup',
  props: {
    // 'sm' ≈ 18px mark height (sidebar header), 'md' ≈ 28px
    size: {
      type: String,
      default: 'sm',
      validator: (v) => ['sm', 'md'].includes(v)
    }
  },
  setup() {
    return { trusteqUrl, anthropicUrl }
  }
}
</script>

<style scoped>
/*
 * Optical balance: both marks share one cap height (--mark-h).
 * trusteq.svg is cropped to its glyph bounds; the TRUST caps fill 78.3%
 * of that box and the Q tail hangs below, so the image is taller than
 * --mark-h and top-aligned. The tail overflows the row like a descender.
 */
.brand-lockup {
  --mark-h: 18px;
  --gap: 10px;
  --x-size: 8px;
  display: inline-flex;
  align-items: center;
  gap: var(--gap);
  height: var(--mark-h);
  line-height: 0;
  vertical-align: middle;
}

.brand-lockup--md {
  --mark-h: 28px;
  --gap: 12px;
  --x-size: 11px;
}

.brand-lockup__trusteq {
  display: block;
  height: calc(var(--mark-h) / 0.783);
  width: auto;
  align-self: flex-start;
}

.brand-lockup__anthropic {
  display: block;
  height: var(--mark-h);
  width: auto;
}

.brand-lockup__x {
  display: block;
  width: var(--x-size);
  height: var(--x-size);
  flex: none;
  fill: none;
  stroke: #888b96;
  stroke-width: 1.25px;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

.brand-lockup__x path {
  vector-effect: non-scaling-stroke;
}
</style>
