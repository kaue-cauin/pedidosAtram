import { rm } from 'node:fs/promises';
// Remove only generated build/output directories, so exports and offline manifests exclude stale routes and chunks.
await Promise.all(['../out/', '../.next/'].map(path => rm(new URL(path, import.meta.url), { recursive: true, force: true })));
