// Vercel serverless entrypoint. Files under a repo-root /api directory
// become individual functions; this one file handles every /api/* request
// (see vercel.json's rewrite) and hands it to the same Express app used
// for local dev and Docker — createApp() has no server.ts-style app.listen()
// call, so it's already shaped correctly for a request/response handler
// rather than a long-running process.
//
// Left out deliberately, because they don't fit a serverless function:
// - The nightly node-cron sync (server.ts) never runs here — nothing stays
//   alive between invocations. Use the admin dashboard's manual "Sync now"
//   button instead.
// - The local-disk storage provider won't persist across invocations or
//   instances — configure S3-compatible storage (Supabase Storage's S3 API
//   works fine) in the setup wizard for attachments to survive.
import { createApp } from '../apps/api/src/app';

const app = createApp();

export default app;
