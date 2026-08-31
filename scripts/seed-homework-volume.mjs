// Load-test fixture: inserts a realistic school-year volume of published
// homework directly into the portal's own tables (bypassing the API, purely
// for query-performance testing of the student feed / teacher dashboard at
// scale). Run scripts/seed-scale-fixture.mjs and a sync first so there are
// classes/teachers/subjects to attach these to.
//
// Usage:
//   PG_HOST=localhost PG_PORT=5432 PG_USER=postgres PG_PASSWORD=postgres \
//   PG_DATABASE=homework_portal NUM_HOMEWORK=3000 node scripts/seed-homework-volume.mjs
import pg from 'pg';
const client = new pg.Client({
  host: process.env.PG_HOST ?? 'localhost',
  port: Number(process.env.PG_PORT ?? 5432),
  user: process.env.PG_USER ?? 'postgres',
  password: process.env.PG_PASSWORD ?? 'postgres',
  database: process.env.PG_DATABASE ?? 'homework_portal',
});
await client.connect();

const teachers = (await client.query('select id from hp_teachers')).rows.map(r => r.id);
const subjects = (await client.query('select id, class_id from hp_subjects')).rows;
const classes = (await client.query('select id from hp_classes')).rows.map(r => r.id);

const NUM_HOMEWORK = Number(process.env.NUM_HOMEWORK ?? 3000);
console.log(`Inserting ${NUM_HOMEWORK} homework rows across ${classes.length} classes...`);

await client.query('BEGIN');
for (let batchStart = 0; batchStart < NUM_HOMEWORK; batchStart += 500) {
  const batchSize = Math.min(500, NUM_HOMEWORK - batchStart);
  const hwRows = [];
  for (let i = 0; i < batchSize; i++) {
    const n = batchStart + i;
    const teacherId = teachers[n % teachers.length];
    const subj = subjects[n % subjects.length];
    const daysAgo = n % 200;
    hwRows.push(`(${teacherId}, ${subj.id}, 'Homework #${n}', 'Auto-generated for scale testing.', CURRENT_DATE - INTERVAL '${daysAgo} days', CURRENT_DATE - INTERVAL '${daysAgo - 3} days', 'published', true)`);
  }
  const result = await client.query(
    `INSERT INTO hp_homework (teacher_id, subject_id, title, description, assigned_date, due_date, status, allow_submission)
     VALUES ${hwRows.join(',')} RETURNING id, subject_id`
  );
  const targetRows = result.rows.map((r) => {
    const subj = subjects.find((s) => s.id === r.subject_id);
    return `(${r.id}, ${subj.class_id}, NULL)`;
  });
  await client.query(`INSERT INTO hp_homework_targets (homework_id, class_id, section_id) VALUES ${targetRows.join(',')}`);
}
await client.query('COMMIT');

const count = await client.query('select count(*) from hp_homework');
console.log('TOTAL_HOMEWORK', count.rows[0].count);
await client.end();
