/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
    theme: {
        extend: {
            colors: {
                brand: {
                    50: '#eff4ff', 100: '#dbe6ff', 200: '#bfd3ff', 300: '#93b4ff', 400: '#5b9bff',
                    500: '#3b72ff', 600: '#2b57e0', 700: '#2145b8', 800: '#1d3a8d', 900: '#142a6e',
                },
                dark: {
                    950: '#050818', 900: '#070c20', 850: '#0a1230', 800: '#0c1536', 700: '#16224a', 600: '#1a2a5a',
                },
            },
        },
    },
    plugins: [],
};
