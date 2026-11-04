/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Geist", "system-ui", "sans-serif"],
      },
      colors: {
        bg: "#0b1020",
        surface: "#141a2e",
        border: "#232a45",
        accent: "#f97316",
      },
    },
  },
  plugins: [],
};
