import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { closePortalDb, portalDb } from '../src/db/portal-connection';
import { resetDb, seedSchoolFixture, seedUser, loginToken } from './helpers';

const app = createApp();

afterAll(async () => {
  await closePortalDb();
});

afterEach(async () => {
  await resetDb();
});

beforeEach(async () => {
  await resetDb();
});

describe('unauthenticated access', () => {
  it('rejects a protected route with no token', async () => {
    const res = await request(app).get('/api/branch/classes');
    expect(res.status).toBe(401);
  });

  it('rejects a protected route with a garbage token', async () => {
    const res = await request(app).get('/api/branch/classes').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });
});

describe('teacher authorization', () => {
  it('403s a teacher posting homework to a class they are not assigned to', async () => {
    const fixture = await seedSchoolFixture();
    await seedUser({ loginId: 'teacher-a', password: 'Password123', role: 'TEACHER', linkedEntityType: 'teacher', linkedEntityId: fixture.teacherA });
    // Deliberately no hp_teacher_assignments row for teacher A on class B.
    const token = await loginToken(request(app), 'teacher-a', 'Password123');

    const res = await request(app)
      .post('/api/teacher/homework')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Sneaky homework',
        assignedDate: '2026-01-01',
        allowSubmission: true,
        targets: [{ classId: fixture.classB, sectionId: null }],
      });

    expect(res.status).toBe(403);
  });

  it('allows a teacher to post homework to a class they ARE assigned to', async () => {
    const fixture = await seedSchoolFixture();
    const adminId = await seedUser({ loginId: 'admin-seed', password: 'Password123', role: 'SUPER_ADMIN' });
    await seedUser({ loginId: 'teacher-a', password: 'Password123', role: 'TEACHER', linkedEntityType: 'teacher', linkedEntityId: fixture.teacherA });
    await portalDb()('hp_teacher_assignments').insert({
      teacher_id: fixture.teacherA,
      class_id: fixture.classA,
      subject_id: fixture.subjectA,
      academic_year: '2026',
      assigned_by: adminId,
    });
    const token = await loginToken(request(app), 'teacher-a', 'Password123');

    const res = await request(app)
      .post('/api/teacher/homework')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Legitimate homework',
        assignedDate: '2026-01-01',
        allowSubmission: true,
        targets: [{ classId: fixture.classA, sectionId: null }],
      });

    expect(res.status).toBe(201);
  });

  it("404s a teacher trying to grade a submission on homework they don't own", async () => {
    const fixture = await seedSchoolFixture();
    await seedUser({ loginId: 'teacher-a', password: 'Password123', role: 'TEACHER', linkedEntityType: 'teacher', linkedEntityId: fixture.teacherA });
    await seedUser({ loginId: 'teacher-b', password: 'Password123', role: 'TEACHER', linkedEntityType: 'teacher', linkedEntityId: fixture.teacherB });

    const [hw] = await portalDb()('hp_homework')
      .insert({ teacher_id: fixture.teacherB, title: 'Teacher B homework', assigned_date: '2026-01-01', status: 'published' })
      .returning('id');
    const homeworkId = typeof hw === 'object' ? hw.id : hw;
    await portalDb()('hp_homework_targets').insert({ homework_id: homeworkId, class_id: fixture.classB, section_id: null });
    const [sub] = await portalDb()('hp_homework_submissions')
      .insert({ homework_id: homeworkId, student_id: fixture.studentB, status: 'submitted' })
      .returning('id');
    const submissionId = typeof sub === 'object' ? sub.id : sub;

    const tokenA = await loginToken(request(app), 'teacher-a', 'Password123');
    const res = await request(app)
      .post(`/api/teacher/submissions/${submissionId}/grade`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ grade: 100 });

    expect(res.status).toBe(403);
  });
});

describe('student authorization', () => {
  it("404s a student trying to view another class's homework", async () => {
    const fixture = await seedSchoolFixture();
    await seedUser({ loginId: 'student-a', password: 'Password123', role: 'STUDENT', linkedEntityType: 'student', linkedEntityId: fixture.studentA });

    const [hw] = await portalDb()('hp_homework')
      .insert({ teacher_id: fixture.teacherB, title: "Class B's homework", assigned_date: '2026-01-01', status: 'published' })
      .returning('id');
    const homeworkId = typeof hw === 'object' ? hw.id : hw;
    await portalDb()('hp_homework_targets').insert({ homework_id: homeworkId, class_id: fixture.classB, section_id: null });

    const token = await loginToken(request(app), 'student-a', 'Password123');
    const res = await request(app).get(`/api/student/homework/${homeworkId}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it("cannot download another class's homework attachment", async () => {
    const fixture = await seedSchoolFixture();
    const teacherBUserId = await seedUser({ loginId: 'teacher-b', password: 'Password123', role: 'TEACHER', linkedEntityType: 'teacher', linkedEntityId: fixture.teacherB });
    await seedUser({ loginId: 'student-a', password: 'Password123', role: 'STUDENT', linkedEntityType: 'student', linkedEntityId: fixture.studentA });

    const [hw] = await portalDb()('hp_homework')
      .insert({ teacher_id: fixture.teacherB, title: "Class B's homework", assigned_date: '2026-01-01', status: 'published' })
      .returning('id');
    const homeworkId = typeof hw === 'object' ? hw.id : hw;
    await portalDb()('hp_homework_targets').insert({ homework_id: homeworkId, class_id: fixture.classB, section_id: null });
    const [att] = await portalDb()('hp_homework_attachments')
      .insert({ homework_id: homeworkId, file_name: 'secret.pdf', stored_path: 'x', mime_type: 'application/pdf', size_bytes: 1, uploaded_by: teacherBUserId })
      .returning('id');
    const attachmentId = typeof att === 'object' ? att.id : att;

    const token = await loginToken(request(app), 'student-a', 'Password123');
    const res = await request(app).get(`/api/attachments/${attachmentId}/download`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

describe('branch head authorization', () => {
  it('403s a branch head assigning a teacher to a class outside their branch', async () => {
    const fixture = await seedSchoolFixture();
    await seedUser({ loginId: 'bh-a', password: 'Password123', role: 'BRANCH_HEAD', linkedEntityType: 'branch', linkedEntityId: fixture.branchA });

    const token = await loginToken(request(app), 'bh-a', 'Password123');
    const res = await request(app)
      .post('/api/branch/assignments')
      .set('Authorization', `Bearer ${token}`)
      .send({ teacherId: fixture.teacherB, classId: fixture.classB, subjectId: fixture.subjectB, academicYear: '2026' });

    expect(res.status).toBe(403);
  });

  it('allows a branch head to assign a teacher within their own branch', async () => {
    const fixture = await seedSchoolFixture();
    await seedUser({ loginId: 'bh-a', password: 'Password123', role: 'BRANCH_HEAD', linkedEntityType: 'branch', linkedEntityId: fixture.branchA });

    const token = await loginToken(request(app), 'bh-a', 'Password123');
    const res = await request(app)
      .post('/api/branch/assignments')
      .set('Authorization', `Bearer ${token}`)
      .send({ teacherId: fixture.teacherA, classId: fixture.classA, subjectId: fixture.subjectA, academicYear: '2026' });

    expect(res.status).toBe(201);
  });

  it("only sees their own branch's classes, not another branch's", async () => {
    const fixture = await seedSchoolFixture();
    await seedUser({ loginId: 'bh-a', password: 'Password123', role: 'BRANCH_HEAD', linkedEntityType: 'branch', linkedEntityId: fixture.branchA });

    const token = await loginToken(request(app), 'bh-a', 'Password123');
    const res = await request(app).get('/api/branch/classes').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const classIds = res.body.map((c: { id: number }) => c.id);
    expect(classIds).toContain(fixture.classA);
    expect(classIds).not.toContain(fixture.classB);
  });
});

describe('setup lockdown after go-live', () => {
  it('blocks a non-admin from touching /setup/* once setup is complete', async () => {
    await portalDb()('hp_setup_state').update({ completed: true });
    await seedUser({ loginId: 'student-a', password: 'Password123', role: 'STUDENT' });
    const token = await loginToken(request(app), 'student-a', 'Password123');

    const res = await request(app).get('/api/setup/state').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('blocks an unauthenticated caller from /setup/* once setup is complete', async () => {
    await portalDb()('hp_setup_state').update({ completed: true });
    const res = await request(app).get('/api/setup/state');
    expect(res.status).toBe(401);
  });

  it('allows an unauthenticated caller to check /setup/state before setup completes', async () => {
    const res = await request(app).get('/api/setup/state');
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(false);
  });
});
