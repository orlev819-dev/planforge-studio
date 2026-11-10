# apps/api — NOT STARTED

Planned: Fastify + PostgreSQL (Prisma) server for accounts, workspaces, owner/editor/viewer permissions,
project sync (revision-based optimistic concurrency), snapshots, comments and audit log.
Server-side authorization is mandatory; the web app currently runs fully offline (IndexedDB) and makes no network calls.
PostgreSQL 16 is available in the dev sandbox but no schema or API code exists yet.
