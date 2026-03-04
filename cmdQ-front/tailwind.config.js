/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                background: '#0D1117',
                panel: '#161B22',
                border: '#30363D',
                primary: '#00FF41',
                secondary: '#58A6FF',
                textPrimary: '#C9D1D9',
            },
            fontFamily: {
                ui: ['Inter', 'Geist', 'sans-serif'],
                code: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
            },
        },
    },
    plugins: [],
}
