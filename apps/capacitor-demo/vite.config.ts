import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    // @legato/capacitor is consumed via local file dependency and currently exports src/.
    // Preserve symlink paths so Vite resolves peer imports from this app's node_modules.
    preserveSymlinks: true,
  },
});
