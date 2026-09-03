import { portalDb } from '../db/portal-connection';
import { hashPassword } from '../auth/password';

/**
 * Seeds a self-contained demo dataset directly into the portal's mirror
 * tables, so a team can exercise every role/flow (assign teacher -> post
 * homework -> submit -> grade -> calendar history) without a real school
 * database to connect to yet. Idempotent-ish: re-running clears and
 * re-seeds rather than duplicating, so a demo can be reset by calling this
 * again.
 */
export async function seedTestingMode(adminUserId: number): Promise<{ accounts: { loginId: string; password: string; role: string }[] }> {
  const db = portalDb();

  return db.transaction(async (trx) => {
    // Clear anything a previous testing-mode run (or a partial real sync)
    // left behind, so this is safe to call more than once.
    await trx.raw(`TRUNCATE TABLE
      hp_audit_log, hp_submission_attachments, hp_homework_submissions, hp_homework_attachments,
      hp_homework_targets, hp_homework, hp_teacher_assignments, hp_enrollments,
      hp_students, hp_teachers, hp_subjects, hp_sections, hp_classes, hp_branches
      RESTART IDENTITY CASCADE`);
    await trx('hp_users').whereIn('login_id', ['branchhead', 'teacher1', 'teacher2', 'student1', 'student2', 'student3']).del();

    async function insertReturningId(table: string, data: Record<string, unknown>): Promise<number> {
      const [row] = await trx(table).insert(data).returning('id');
      return typeof row === 'object' ? row.id : row;
    }

    const branchId = await insertReturningId('hp_branches', { source_key: 'demo-branch-1', name: 'Demo Branch', code: 'DEMO' });

    const grade6 = await insertReturningId('hp_classes', { source_key: 'demo-class-6', name: 'Grade 6', grade_level: '6', branch_id: branchId, academic_year: '2026' });
    const grade7 = await insertReturningId('hp_classes', { source_key: 'demo-class-7', name: 'Grade 7', grade_level: '7', branch_id: branchId, academic_year: '2026' });

    const sec6A = await insertReturningId('hp_sections', { source_key: 'demo-sec-6a', name: 'A', class_id: grade6, branch_id: branchId });
    const sec6B = await insertReturningId('hp_sections', { source_key: 'demo-sec-6b', name: 'B', class_id: grade6, branch_id: branchId });
    const sec7A = await insertReturningId('hp_sections', { source_key: 'demo-sec-7a', name: 'A', class_id: grade7, branch_id: branchId });

    const mathSub = await insertReturningId('hp_subjects', { source_key: 'demo-sub-math6', name: 'Mathematics', class_id: grade6 });
    const sciSub = await insertReturningId('hp_subjects', { source_key: 'demo-sub-sci6', name: 'Science', class_id: grade6 });
    const engSub = await insertReturningId('hp_subjects', { source_key: 'demo-sub-eng7', name: 'English', class_id: grade7 });

    const teacher1 = await insertReturningId('hp_teachers', { source_key: 'demo-tchr-1', full_name: 'Priya Sharma', email: 'priya.sharma@demo.msea.in', branch_id: branchId });
    const teacher2 = await insertReturningId('hp_teachers', { source_key: 'demo-tchr-2', full_name: 'Arjun Verma', email: 'arjun.verma@demo.msea.in', branch_id: branchId });

    const students = await Promise.all([
      insertReturningId('hp_students', { source_key: 'demo-stu-1', full_name: 'Aditi Rao', roll_no: '6A-01', class_id: grade6, section_id: sec6A, branch_id: branchId, email: 'aditi.rao@demo.msea.in' }),
      insertReturningId('hp_students', { source_key: 'demo-stu-2', full_name: 'Kabir Singh', roll_no: '6A-02', class_id: grade6, section_id: sec6A, branch_id: branchId, email: 'kabir.singh@demo.msea.in' }),
      insertReturningId('hp_students', { source_key: 'demo-stu-3', full_name: 'Meera Nair', roll_no: '6B-01', class_id: grade6, section_id: sec6B, branch_id: branchId, email: 'meera.nair@demo.msea.in' }),
      insertReturningId('hp_students', { source_key: 'demo-stu-4', full_name: 'Rohan Gupta', roll_no: '7A-01', class_id: grade7, section_id: sec7A, branch_id: branchId, email: 'rohan.gupta@demo.msea.in' }),
      insertReturningId('hp_students', { source_key: 'demo-stu-5', full_name: 'Sara Khan', roll_no: '7A-02', class_id: grade7, section_id: sec7A, branch_id: branchId, email: 'sara.khan@demo.msea.in' }),
    ]);

    await trx('hp_teacher_assignments').insert([
      { teacher_id: teacher1, class_id: grade6, subject_id: mathSub, academic_year: '2026', assigned_by: adminUserId },
      { teacher_id: teacher1, class_id: grade6, subject_id: sciSub, academic_year: '2026', assigned_by: adminUserId },
      { teacher_id: teacher2, class_id: grade7, subject_id: engSub, academic_year: '2026', assigned_by: adminUserId },
    ]);

    // A few weeks of homework history, spread across statuses, so the
    // calendar view has something real to show immediately.
    const now = new Date();
    function daysAgo(n: number): string {
      const d = new Date(now);
      d.setDate(d.getDate() - n);
      return d.toISOString().slice(0, 10);
    }
    const demoHomework = [
      { teacher: teacher1, subject: mathSub, classId: grade6, title: 'Fractions worksheet', desc: 'Complete questions 1-10.', assignedDaysAgo: 21, dueDaysAgo: 18 },
      { teacher: teacher1, subject: sciSub, classId: grade6, title: 'Plant cell diagram', desc: 'Label and color the diagram.', assignedDaysAgo: 14, dueDaysAgo: 10 },
      { teacher: teacher1, subject: mathSub, classId: grade6, title: 'Decimals practice set', desc: 'Exercises 1-12, show your working.', assignedDaysAgo: 7, dueDaysAgo: 2 },
      { teacher: teacher2, subject: engSub, classId: grade7, title: 'Essay: My Summer Vacation', desc: '250 words, handwritten.', assignedDaysAgo: 10, dueDaysAgo: 5 },
      { teacher: teacher2, subject: engSub, classId: grade7, title: 'Grammar worksheet — tenses', desc: 'Complete all sections.', assignedDaysAgo: 3, dueDaysAgo: -2 },
    ];
    for (const hw of demoHomework) {
      const [row] = await trx('hp_homework')
        .insert({
          teacher_id: hw.teacher,
          subject_id: hw.subject,
          title: hw.title,
          description: hw.desc,
          assigned_date: daysAgo(hw.assignedDaysAgo),
          due_date: daysAgo(hw.dueDaysAgo),
          status: 'published',
          allow_submission: true,
        })
        .returning('id');
      const homeworkId = typeof row === 'object' ? row.id : row;
      await trx('hp_homework_targets').insert({ homework_id: homeworkId, class_id: hw.classId, section_id: null });
    }

    // One graded and one pending submission from Aditi, so grading/feedback
    // screens have real content on first login too.
    const oldestHomework = await trx('hp_homework').where({ teacher_id: teacher1 }).orderBy('assigned_date', 'asc').first();
    if (oldestHomework) {
      await trx('hp_homework_submissions').insert({
        homework_id: oldestHomework.id,
        student_id: students[0],
        submitted_at: trx.fn.now(),
        note: 'Completed all questions.',
        status: 'graded',
        grade: 88,
        feedback: 'Good work — double check question 7.',
        graded_by: adminUserId,
        graded_at: trx.fn.now(),
      });
    }

    const accounts = [
      { loginId: 'branchhead', password: 'BranchHead123', role: 'BRANCH_HEAD', linkedEntityType: 'branch', linkedEntityId: branchId },
      { loginId: 'teacher1', password: 'Teacher123', role: 'TEACHER', linkedEntityType: 'teacher', linkedEntityId: teacher1 },
      { loginId: 'teacher2', password: 'Teacher123', role: 'TEACHER', linkedEntityType: 'teacher', linkedEntityId: teacher2 },
      { loginId: 'student1', password: 'Student123', role: 'STUDENT', linkedEntityType: 'student', linkedEntityId: students[0] },
      { loginId: 'student2', password: 'Student123', role: 'STUDENT', linkedEntityType: 'student', linkedEntityId: students[1] },
      { loginId: 'student3', password: 'Student123', role: 'STUDENT', linkedEntityType: 'student', linkedEntityId: students[3] },
    ];
    for (const acc of accounts) {
      await trx('hp_users').insert({
        login_id: acc.loginId,
        password_hash: await hashPassword(acc.password),
        role: acc.role,
        linked_entity_type: acc.linkedEntityType,
        linked_entity_id: acc.linkedEntityId,
        must_change_password: false,
      });
    }

    await trx('hp_setup_state').update({
      completed: true,
      completed_at: trx.fn.now(),
      testing_mode: true,
      active_mapping_version: null,
    });

    return { accounts: accounts.map(({ loginId, password, role }) => ({ loginId, password, role })) };
  });
}
