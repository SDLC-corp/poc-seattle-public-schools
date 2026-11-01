// Applies the brand colours from Settings to the CSS custom properties the whole app uses.
// The sidebar/topbar navies and hover/light tints are derived from the primary colour.

const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const toHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
const mix = (hex, withHex, amount) => {
  const a = toRgb(hex)
  const b = toRgb(withHex)
  return toHex(a.map((v, i) => v + (b[i] - v) * amount))
}

const HEX = /^#[0-9a-f]{6}$/i

export function applyBrandColors({ primaryColor, secondaryColor } = {}) {
  const root = document.documentElement.style
  if (HEX.test(primaryColor ?? '')) {
    root.setProperty('--primary', primaryColor)
    root.setProperty('--primary-hover', mix(primaryColor, '#000000', 0.18))
    root.setProperty('--primary-light', mix(primaryColor, '#ffffff', 0.89))
    root.setProperty('--primary-700', mix(primaryColor, '#000000', 0.3))
    root.setProperty('--primary-800', mix(primaryColor, '#000000', 0.45))
    root.setProperty('--primary-900', mix(primaryColor, '#000000', 0.6))
  }
  if (HEX.test(secondaryColor ?? '')) {
    root.setProperty('--secondary', secondaryColor)
    root.setProperty('--secondary-hover', mix(secondaryColor, '#000000', 0.12))
    root.setProperty('--secondary-light', mix(secondaryColor, '#ffffff', 0.85))
  }
}
