import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'yorkie-js-schema',
      fileName: (format) =>
        format === 'umd'
          ? 'yorkie-js-schema.js'
          : `yorkie-js-schema.${format}.js`,
    },
  },
  plugins: [
    dts({
      rollupTypes: true,
    }),
    nodePolyfills(),
  ],
});
