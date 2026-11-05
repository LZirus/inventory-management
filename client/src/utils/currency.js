// Currency conversion utility.
//
// Every monetary value delivered by the API is in USD. The UI shows either USD
// or JPY depending on the locale, so ALL money displays must go through this
// module: it converts the USD amount first and only then adds the symbol.
// Prefixing '¥' to a raw USD number shows an amount ~150x too small (audit P0-1).

// USD to JPY exchange rate (approximate, fixed for the demo)
const USD_TO_JPY = 150

const toNumber = (amount) => {
  const n = Number(amount)
  return Number.isFinite(n) ? n : 0
}

export function convertAmount(amount, currency = 'USD') {
  if (currency === 'JPY') {
    return Math.round(toNumber(amount) * USD_TO_JPY)
  }
  return toNumber(amount)
}

export function formatCurrency(amount, currency = 'USD') {
  return formatCurrencyWithDecimals(amount, currency, 0)
}

// `decimals` only applies to USD: yen has no minor unit, so JPY is always whole yen.
export function formatCurrencyWithDecimals(amount, currency = 'USD', decimals = 0) {
  if (currency === 'JPY') {
    return `¥${convertAmount(amount, 'JPY').toLocaleString('ja-JP')}`
  }
  return `$${toNumber(amount).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })}`
}

const symbolFor = (currency) => (currency === 'JPY' ? '¥' : '$')

// Compact text for an amount that is ALREADY in the display currency.
const compactDisplay = (value, symbol) => {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  const units = [
    { limit: 1e9, suffix: 'B' },
    { limit: 1e6, suffix: 'M' },
    { limit: 1e3, suffix: 'K' }
  ]
  for (const { limit, suffix } of units) {
    if (abs >= limit) {
      const scaled = abs / limit
      // At most one decimal (1.5M, 22.5M); a trailing ".0" is dropped.
      const text = Number(scaled.toFixed(1)).toString()
      return `${sign}${symbol}${text}${suffix}`
    }
  }
  return `${sign}${symbol}${Math.round(abs)}`
}

// Short form for chart axes and tight labels, e.g. "$1.5M", "$250K", "¥225M".
// Converts first, so the suffix reflects the displayed currency's magnitude.
export function formatCurrencyCompact(amount, currency = 'USD') {
  return compactDisplay(convertAmount(amount, currency), symbolFor(currency))
}

// Rounds a value up to a "nice" number (1, 1.5, 2, 2.5, 3, 4, 5, 7.5 or 10 times a
// power of ten). The finer steps keep the tallest bar close to the top of the chart.
export function niceCeil(value) {
  const n = toNumber(value)
  if (n <= 0) return 1
  const magnitude = Math.pow(10, Math.floor(Math.log10(n)))
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]
  const step = steps.find(s => s * magnitude >= n)
  return step * magnitude
}

// Builds a value axis for a bar chart from the data maximum (in USD).
// The tick step is chosen in the DISPLAY currency so labels are round numbers
// there too (e.g. ¥100M steps rather than ¥75M from a $500K USD step).
// Returns `max` in USD (use it to scale bar heights) and the tick labels from
// top to bottom, `intervals + 1` of them, ending at 0.
export function buildCurrencyAxis(maxUsd, currency = 'USD', intervals = 4) {
  const rate = currency === 'JPY' ? USD_TO_JPY : 1
  const displayMax = toNumber(maxUsd) * rate
  const step = niceCeil(displayMax / intervals)
  const top = step * intervals
  const labels = []
  for (let i = intervals; i >= 0; i--) {
    labels.push(compactDisplay(step * i, symbolFor(currency)))
  }
  return { max: top / rate, labels }
}
