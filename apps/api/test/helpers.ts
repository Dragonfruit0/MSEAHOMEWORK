import { portalDb } from '../src/db/portal-connection';
import { hashPassword } from '../src/auth/password';

/**
 * Wipes every hp_* table except hp_setup_state (reset to its default row
 * rather than truncated, since exactly one row is expected to always exist)
 * and the knex migration bookkeeping tables. Run before each test so tests
 * don't depend on execution order or leak fixtures into each other.
 */
export async function resetDb(): Promise<void> {
  const db = portalDb();
  await db('hp_setup_state').update({ completed: false, completed_at: null, active_mapping_version: null });
  const tables = [
    'hp_audit_log',
    'hp_submission_attachments',
    'hp_homework_submissions',
    'hp_homework_attachments',
    'hp_homework_targets',
    'hp_homework',
    'hp_teacher_assignments',
    'hp_sync_runs',
    'hp_enrollments',
    'hp_students',
    'hp_teachers',
    'hp_subjects',
    'hp_sections',
    'hp_classes',
    'hp_branches',
    'hp_storage_config',
    'hp_entity_mappings',
    'hp_db_connections',
    'hp_refresh_tokens',
    'hp_users',
  ];
  await db.raw(`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
}

interface SeedUserInput {
  loginId: string;
  password: string;
  role: 'SUPER_ADMIN' | 'BRANCH_HEAD' | 'TEACHER' | 'STUDENT' | 'PARENT';
  linkedEntityType?: 'student' | 'teacher' | 'branch' | null;
  linkedEntityId?: number | null;
}

export async function seedUser(input: SeedUserInput): Promise<number> {
  const db = portalDb();
  const [row] = await db('hp_users')
    .insert({
      login_id: input.loginId,
      password_hash: await hashPassword(input.password),
      role: input.role,
      linked_entity_type: input.linkedEntityType ?? null,
      linked_entity_id: input.linkedEntityId ?? null,
      must_change_password: false,
    })
    .returning('id');
  return typeof row === 'object' ? row.id : row;
}

/** A minimal but complete two-branch fixture: enough to test cross-branch/cross-class authorization. */
export async function seedSchoolFixture() {
  const db = portalDb();

  async function insertReturningId(table: string, data: Record<string, unknown>): Promise<number> {
    const [row] = await db(table).insert(data).returning('id');
    return typeof row === 'object' ? row.id : row;
  }

  const branchA = await insertReturningId('hp_branches', { source_key: 'A', name: 'Branch A' });
  const branchB = await insertReturningId('hp_branches', { source_key: 'B', name: 'Branch B' });

  const classA = await insertReturningId('hp_classes', { source_key: 'CA', name: 'Class A', branch_id: branchA });
  const classB = await insertReturningId('hp_classes', { source_key: 'CB', name: 'Class B', branch_id: branchB });

  const sectionA = await insertReturningId('hp_sections', { source_key: 'SA', name: 'A', class_id: classA });
  const sectionB = await insertReturningId('hp_sections', { source_key: 'SB', name: 'A', class_id: classB });

  const subjectA = await insertReturningId('hp_subjects', { source_key: 'SUBA', name: 'Mathematics', class_id: classA });
  const subjectB = await insertReturningId('hp_subjects', { source_key: 'SUBB', name: 'Science', class_id: classB });

  const teacherA = await insertReturningId('hp_teachers', { source_key: 'TA', full_name: 'Teacher A', branch_id: branchA });
  const teacherB = await insertReturningId('hp_teachers', { source_key: 'TB', full_name: 'Teacher B', branch_id: branchB });

  const studentA = await insertReturningId('hp_students', {
    source_key: 'STA', full_name: 'Student A', class_id: classA, section_id: sectionA, branch_id: branchA,
  });
  const studentB = await insertReturningId('hp_students', {
    source_key: 'STB', full_name: 'Student B', class_id: classB, section_id: sectionB, branch_id: branchB,
  });

  return { branchA, branchB, classA, classB, sectionA, sectionB, subjectA, subjectB, teacherA, teacherB, studentA, studentB };
}

type RequestAgent = ReturnType<typeof import('supertest')>;

export async function loginToken(agent: RequestAgent, loginId: string, password: string): Promise<string> {
  const res = await agent.post('/api/auth/login').send({ loginId, password });
  if (res.status !== 200) {
    throw new Error(`login failed for ${loginId}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.accessToken;
}
