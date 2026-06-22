import { defineConfig } from 'vitest/config';

// happy-dom gives the core the browser globals it expects (DOMParser for GPX/WPT
// parsing, Web Crypto for the HMAC QR signing) without a real browser.
export default defineConfig({
    test: {
        environment: 'happy-dom',
        include: ['tests/**/*.test.js'],
    },
});
