// Load-test fixture: seeds a legacy-shaped "school ERP" schema
// (TBL_STU_MST etc — matching packages the setup wizard was verified against)
// with a configurable number of students, for exercising sync/query
// performance at real school scale before going live with an actual school
// database. Point it at a scratch Postgres database, NEVER at production.
//
// Usage:
//   PG_HOST=localhost PG_PORT=5432 PG_USER=postgres PG_PASSWORD=postgres \
//   PG_DATABASE=school_erp TARGET_STUDENTS=40000 node scripts/seed-scale-fixture.mjs
//
// All generated rows use IDs starting at 5000+ (branches), 6000+ (classes),
// 100000+ (sections), 200000+ (subjects), 300000+ (teachers), and 1000000+
// (students) — see the id counters below — so they can be cleanly identified
// and removed afterward without touching hand-seeded demo data below those
// ranges (see scripts/cleanup-scale-fixture.mjs).
import pg from 'pg';

const client = new pg.Client({
  host: process.env.PG_HOST ?? 'localhost',
  port: Number(process.env.PG_PORT ?? 5432),
  user: process.env.PG_USER ?? 'postgres',
  password: process.env.PG_PASSWORD ?? 'postgres',
  database: process.env.PG_DATABASE ?? 'school_erp',
});
await client.connect();

const NUM_BRANCHES = Number(process.env.NUM_BRANCHES ?? 5);
const CLASSES_PER_BRANCH = Number(process.env.CLASSES_PER_BRANCH ?? 8);
const SECTIONS_PER_CLASS = Number(process.env.SECTIONS_PER_CLASS ?? 5);
const TARGET_STUDENTS = Number(process.env.TARGET_STUDENTS ?? 40000);
const STUDENTS_PER_SECTION = Math.ceil(TARGET_STUDENTS / (NUM_BRANCHES * CLASSES_PER_BRANCH * SECTIONS_PER_CLASS));
const TEACHERS_PER_BRANCH = 30;

console.log(
  `Plan: ${NUM_BRANCHES} branches x ${CLASSES_PER_BRANCH} classes x ${SECTIONS_PER_CLASS} sections x ${STUDENTS_PER_SECTION} students/section = ` +
    NUM_BRANCHES * CLASSES_PER_BRANCH * SECTIONS_PER_CLASS * STUDENTS_PER_SECTION +
    ' students'
);

const FIRST_NAMES = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan', 'Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Kiara', 'Myra', 'Sara', 'Riya', 'Aarohi', 'Anika'];
const LAST_NAMES = ['Sharma', 'Verma', 'Gupta', 'Kumar', 'Singh', 'Patel', 'Rao', 'Nair', 'Iyer', 'Mehta', 'Joshi', 'Khan', 'Shah', 'Reddy'];
const SUBJECT_NAMES = ['Mathematics', 'Science', 'English', 'Social Studies', 'Computer Science'];
const SECTION_LETTERS = ['A', 'B', 'C', 'D', 'E'];

async function insertInChunks(sql, rows, chunkSize = 3000) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    await client.query(sql(rows.slice(i, i + chunkSize)));
  }
}

let branchId = 5000;
let classId = 6000;
let sectionId = 100000;
let subjectId = 200000;
let teacherId = 300000;
let studentId = 1000000;

await client.query('BEGIN');

const branchRows = [];
const branchIds = [];
for (let b = 0; b < NUM_BRANCHES; b++) {
  const id = branchId++;
  branchIds.push(id);
  branchRows.push(`(${id}, 'Branch ${b + 1} Campus', 'BR${b + 1}')`);
}
await client.query(`INSERT INTO TBL_BRANCH_MST (BRN_ID, BRN_NAME, BRN_CODE) VALUES ${branchRows.join(',')}`);

const classMeta = [];
const classRows = [];
for (const bId of branchIds) {
  for (let c = 0; c < CLASSES_PER_BRANCH; c++) {
    const id = classId++;
    classMeta.push({ id, branchId: bId });
    classRows.push(`(${id}, 'Grade ${c + 1}', '${c + 1}', ${bId}, '2026')`);
  }
}
await insertInChunks((rows) => `INSERT INTO TBL_CLASS_MST (CLS_ID, CLS_NAME, GRADE_LVL, BRN_ID, ACAD_YR) VALUES ${rows.join(',')}`, classRows);

const sectionMeta = [];
const sectionRows = [];
for (const cls of classMeta) {
  for (let s = 0; s < SECTIONS_PER_CLASS; s++) {
    const id = sectionId++;
    sectionMeta.push({ id, classId: cls.id, branchId: cls.branchId });
    sectionRows.push(`(${id}, '${SECTION_LETTERS[s]}', ${cls.id})`);
  }
}
await insertInChunks((rows) => `INSERT INTO TBL_SECTION_MST (SEC_ID, SEC_NAME, CLS_ID) VALUES ${rows.join(',')}`, sectionRows);

const subjectRows = [];
for (const cls of classMeta) {
  for (const name of SUBJECT_NAMES) {
    subjectRows.push(`(${subjectId++}, '${name}', ${cls.id})`);
  }
}
await insertInChunks((rows) => `INSERT INTO TBL_SUBJECT_MST (SUB_ID, SUB_NAME, CLS_ID) VALUES ${rows.join(',')}`, subjectRows);

const teacherRows = [];
for (const bId of branchIds) {
  for (let t = 0; t < TEACHERS_PER_BRANCH; t++) {
    const id = teacherId++;
    const fn = FIRST_NAMES[t % FIRST_NAMES.length];
    const ln = LAST_NAMES[t % LAST_NAMES.length];
    teacherRows.push(`(${id}, '${fn}', '${ln}', '${fn.toLowerCase()}.${ln.toLowerCase()}${id}@msea.in', ${bId}, 'Y')`);
  }
}
await insertInChunks((rows) => `INSERT INTO TBL_TEACHER_MST (TCHR_ID, TCHR_FNAME, TCHR_LNAME, TCHR_EMAIL, BRN_ID, ACTIVE_FLG) VALUES ${rows.join(',')}`, teacherRows);

let n = 0;
const studentRows = [];
for (const sec of sectionMeta) {
  for (let s = 0; s < STUDENTS_PER_SECTION; s++) {
    if (n >= TARGET_STUDENTS) break;
    const id = studentId++;
    const fn = FIRST_NAMES[n % FIRST_NAMES.length];
    const ln = LAST_NAMES[(n * 7) % LAST_NAMES.length];
    const rollNo = `${sec.classId}-${sec.id}-${String(s + 1).padStart(3, '0')}`;
    studentRows.push(
      `(${id}, '${fn}', '${ln}', '${rollNo}', ${sec.classId}, ${sec.id}, ${sec.branchId}, '${fn.toLowerCase()}.${ln.toLowerCase()}${id}@student.msea.in', '9${String(id).padStart(9, '0')}', 'Y')`
    );
    n++;
  }
  if (n >= TARGET_STUDENTS) break;
}
console.log('Generated', n, 'student rows, inserting...');
await insertInChunks(
  (rows) =>
    `INSERT INTO TBL_STU_MST (STU_ID, STU_FNAME, STU_LNAME, ROLL_NO, CLS_ID, SEC_ID, BRN_ID, STU_EMAIL, PARENT_PHONE, ACTIVE_FLG) VALUES ${rows.join(',')}`,
  studentRows
);

await client.query('COMMIT');

const counts = await client.query(`
  select 'branches' t, count(*) c from TBL_BRANCH_MST
  union all select 'classes', count(*) from TBL_CLASS_MST
  union all select 'sections', count(*) from TBL_SECTION_MST
  union all select 'subjects', count(*) from TBL_SUBJECT_MST
  union all select 'teachers', count(*) from TBL_TEACHER_MST
  union all select 'students', count(*) from TBL_STU_MST
`);
console.log('FINAL_COUNTS', JSON.stringify(counts.rows));
await client.end();
