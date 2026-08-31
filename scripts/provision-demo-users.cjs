// One-off demo provisioning: creates a BRANCH_HEAD, TEACHER, and STUDENT
// portal account linked to rows the setup wizard already synced from the
// (fake) school database. This stands in for the bulk-provisioning admin UI
// that isn't built yet — see the plan's "Admin surface" gap.
const argon2 = require('argon2');
const knex = require('knex');

const db = knex({
  client: 'pg',
  connection: {
    host: 'localhost',
    port: 55432,
    user: 'postgres',
    password: 'postgres',
    database: 'homework_portal',
  },
});

async function upsertUser({ loginId, password, role, linkedEntityType, linkedEntityId }) {
  const existing = await db('hp_users').where({ login_id: loginId }).first();
  const password_hash = await argon2.hash(password, { type: argon2.argon2id });
  if (existing) {
    await db('hp_users').where({ id: existing.id }).update({ password_hash, role, linked_entity_type: linkedEntityType, linked_entity_id: linkedEntityId, must_change_password: false });
    console.log(`updated ${loginId} (${role})`);
  } else {
    await db('hp_users').insert({ login_id: loginId, password_hash, role, linked_entity_type: linkedEntityType, linked_entity_id: linkedEntityId, must_change_password: false });
    console.log(`created ${loginId} (${role})`);
  }
}

(async () => {
  const branch = await db('hp_branches').first();
  const teacher = await db('hp_teachers').orderBy('id').first();
  const student = await db('hp_students').orderBy('id').first();

  if (!branch || !teacher || !student) {
    throw new Error('Mirror tables are empty — run the setup wizard sync first.');
  }

  await upsertUser({ loginId: 'branchhead', password: 'BranchHead123', role: 'BRANCH_HEAD', linkedEntityType: 'branch', linkedEntityId: branch.id });
  await upsertUser({ loginId: 'teacher1', password: 'Teacher123', role: 'TEACHER', linkedEntityType: 'teacher', linkedEntityId: teacher.id });
  await upsertUser({ loginId: 'student1', password: 'Student123', role: 'STUDENT', linkedEntityType: 'student', linkedEntityId: student.id });

  console.log('Linked:', { branch: branch.name, teacher: teacher.full_name, student: student.full_name });
  await db.destroy();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
