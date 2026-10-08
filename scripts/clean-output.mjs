import { rm } from 'node:fs/promises';
// Remove only generated static output, so the offline manifest excludes stale chunks.
await rm(new URL('../out/', import.meta.url), { recursive: true, force: true });
