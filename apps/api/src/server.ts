import 'dotenv/config';
import cron from 'node-cron';
import { createApp } from './app';
import { runInitialSync } from './sync/sync-service';

const PORT = Number(process.env.PORT ?? 4000);

const app = createApp();
app.listen(PORT, () => {
  console.log(`homework-portal api listening on :${PORT}`);
});

// Nightly mirror sync, default 02:00 server time — keeps the student feed
// current without ever hitting the school's source DB during the school day.
const SYNC_CRON = process.env.SYNC_CRON ?? '0 2 * * *';
cron.schedule(SYNC_CRON, async () => {
  try {
    await runInitialSync();
  } catch (err) {
    console.error('Scheduled sync failed:', err);
  }
});
