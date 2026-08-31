// Removes everything scripts/seed-scale-fixture.mjs and
// scripts/seed-homework-volume.mjs generated, from both the source school-ERP
// fixture and the portal's synced mirror, leaving hand-seeded demo data
// intact. Run this after a load test to return to a clean, presentable state.
//
// Usage:
//   PG_HOST=localhost PG_PORT=5432 PG_USER=postgres PG_PASSWORD=postgres \
//   PG_SOURCE_DATABASE=school_erp PG_PORTAL_DATABASE=homework_portal \
//   node scripts/cleanup-scale-fixture.mjs
import pg from 'pg';

const base = {
  host: process.env.PG_HOST ?? 'localhost',
  port: Number(process.env.PG_PORT ?? 5432),
  user: process.env.PG_USER ?? 'postgres',
  password: process.env.PG_PASSWORD ?? 'postgres',
};

const source = new pg.Client({ ...base, database: process.env.PG_SOURCE_DATABASE ?? 'school_erp' });
await source.connect();
await source.query(`DELETE FROM TBL_STU_MST WHERE STU_ID >= 1000000`);
await source.query(`DELETE FROM TBL_TEACHER_MST WHERE TCHR_ID >= 300000`);
await source.query(`DELETE FROM TBL_SUBJECT_MST WHERE SUB_ID >= 200000`);
await source.query(`DELETE FROM TBL_SECTION_MST WHERE SEC_ID >= 100000`);
await source.query(`DELETE FROM TBL_CLASS_MST WHERE CLS_ID >= 6000`);
await source.query(`DELETE FROM TBL_BRANCH_MST WHERE BRN_ID >= 5000`);
console.log('Source fixture bulk rows removed.');
await source.end();

const portal = new pg.Client({ ...base, database: process.env.PG_PORTAL_DATABASE ?? 'homework_portal' });
await portal.connect();
await portal.query(`DELETE FROM hp_homework_submissions WHERE homework_id IN (SELECT id FROM hp_homework WHERE title LIKE 'Homework #%')`);
await portal.query(`DELETE FROM hp_homework_targets WHERE homework_id IN (SELECT id FROM hp_homework WHERE title LIKE 'Homework #%')`);
await portal.query(`DELETE FROM hp_homework WHERE title LIKE 'Homework #%'`);
await portal.query(`DELETE FROM hp_students WHERE source_key::bigint >= 1000000`);
await portal.query(`DELETE FROM hp_teachers WHERE source_key::bigint >= 300000`);
await portal.query(`DELETE FROM hp_subjects WHERE source_key::bigint >= 200000`);
await portal.query(`DELETE FROM hp_sections WHERE source_key::bigint >= 100000`);
await portal.query(`DELETE FROM hp_classes WHERE source_key::bigint >= 6000`);
await portal.query(`DELETE FROM hp_branches WHERE source_key::bigint >= 5000`);
console.log('Portal mirror bulk rows removed.');

const counts = await portal.query(`
  select 'branches' t, count(*) c from hp_branches
  union all select 'classes', count(*) from hp_classes
  union all select 'sections', count(*) from hp_sections
  union all select 'subjects', count(*) from hp_subjects
  union all select 'teachers', count(*) from hp_teachers
  union all select 'students', count(*) from hp_students
  union all select 'homework', count(*) from hp_homework
`);
console.log('Remaining counts:', JSON.stringify(counts.rows));
await portal.end();
