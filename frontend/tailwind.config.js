/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'equorum-orange': '#FF6B35',
        'equorum-dark': '#0A1628',
        'equorum-accent': '#FF8C61',
        primary: '#FF6B35',
        secondary: '#0A1628',
        muted: '#6b7280',
        card: '#f9fafb',
      },
    },
  },
}
