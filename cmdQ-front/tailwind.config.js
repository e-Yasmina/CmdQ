/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                background: 'var(--color-background, #0D1117)',
                panel: 'var(--color-panel, #161B22)',
                border: 'var(--color-border, #30363D)',
                primary: 'var(--color-primary, #FB923C)',
                secondary: 'var(--color-secondary, #58A6FF)',
                textPrimary: 'var(--color-text-primary, #C9D1D9)',
                textSecondary: 'var(--color-text-secondary, #8B949E)',
            },
            fontFamily: {
                ui: ['Inter', 'Geist', 'sans-serif'],
                code: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
            },
        },
    },
    plugins: [],
}
