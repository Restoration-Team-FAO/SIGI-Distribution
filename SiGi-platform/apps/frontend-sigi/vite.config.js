import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

// Versión del producto (SemVer) inyectada en el build; fuente: SiGi-platform/VERSION vía package.json.
const sigiVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
export default defineConfig({
    plugins: [react()],
    define: {
        __SIGI_VERSION__: JSON.stringify(sigiVersion),
        __SIGI_GIT_SHA__: JSON.stringify(process.env.SIGI_GIT_SHA ?? ''),
    },
    server: {
        port: 5174,
    },
});
