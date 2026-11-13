// Mapping of the design system colors onto Nuxt UI. The actual values (light/dark) are in assets/css/main.css.
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'petrol',
      neutral: 'ice',
      success: 'green',
      warning: 'amber',
      error: 'red',
      info: 'blue',
    },
    icons: {
      arrowLeft: 'i-tm-chevron-left',
      arrowRight: 'i-tm-chevron-right',
      arrowUp: 'i-tm-arrow-up',
      arrowDown: 'i-tm-arrow-down',
      check: 'i-tm-check',
      chevronDown: 'i-tm-chevron-down',
      chevronLeft: 'i-tm-chevron-left',
      chevronRight: 'i-tm-chevron-right',
      chevronUp: 'i-tm-chevron-up',
      close: 'i-tm-x',
      ellipsis: 'i-tm-more',
      external: 'i-tm-external',
      eye: 'i-tm-eye',
      eyeOff: 'i-tm-eye-off',
      info: 'i-tm-info',
      loading: 'i-tm-loader',
      minus: 'i-tm-minus',
      plus: 'i-tm-plus',
      search: 'i-tm-search',
      success: 'i-tm-check-circle',
      warning: 'i-tm-warning',
      error: 'i-tm-error',
      upload: 'i-tm-upload',
      moon: 'i-tm-moon',
      sun: 'i-tm-sun',
      system: 'i-tm-monitor',
    },
    button: {
      slots: { base: 'font-semibold min-h-11 px-4' },
    },
    // The close button is absolute: the header leaves it room, so a long title wraps instead of running under it.
    modal: {
      slots: { header: 'pe-14 sm:pe-14', title: 'break-words' },
    },
  },
})
