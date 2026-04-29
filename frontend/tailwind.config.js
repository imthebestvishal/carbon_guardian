export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"],
      },
      colors: {
        'green-dark': '#0f2f24',
        'green-brand': '#088a4b',
        'green-light': '#e8f5e9',
        'green-success': '#14b8a6',
        'orange-brand': '#f59e0b',
        'red-brand': '#ef4444',
        'red-light': '#fef2f2',
        'blue-brand': '#3b82f6',
        'blue-light': '#eff6ff',
        'bg-app': '#f3f4f6',
        'bg-card': '#ffffff',
        'text-main': '#111827',
        'text-muted': '#6b7280',
      },
      boxShadow: {
        soft: "0 4px 20px rgba(0, 0, 0, 0.05)",
        card: "0 2px 8px rgba(0, 0, 0, 0.04)",
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      }
    },
  },
  plugins: [],
};
