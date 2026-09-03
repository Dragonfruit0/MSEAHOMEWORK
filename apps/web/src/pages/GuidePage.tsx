import { useState, type ReactNode } from 'react';
import { Logo } from '../components/Logo';

/**
 * A public, no-login-required walkthrough of the whole project — for anyone
 * on the team who has the codebase and needs to get it running and
 * understand what happens when. Deliberately outside auth: the point of
 * this page is to get someone from zero to a working login, so it can't
 * require one itself.
 */

interface Step {
  title: string;
  summary: string;
  detail: ReactNode;
}

interface Section {
  label: string;
  color: string;
  steps: Step[];
}

function Code({ children }: { children: ReactNode }) {
  return (
    <pre className="bg-[#12111c] text-[#d8d6ec] rounded-xl px-4 py-3 text-xs font-mono leading-relaxed overflow-x-auto my-2">
      {children}
    </pre>
  );
}

function Click({ children }: { children: ReactNode }) {
  return <span className="inline-block bg-brand-indigo/10 text-brand-indigo font-semibold px-2 py-0.5 rounded-md text-[13px]">{children}</span>;
}

function Then({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm text-slate-500 flex gap-2 mt-1.5">
      <span className="text-brand-green-dark font-bold shrink-0">→</span>
      <span>{children}</span>
    </p>
  );
}

const SECTIONS: Section[] = [
  {
    label: 'Before you start',
    color: 'bg-slate-100 text-slate-600',
    steps: [
      {
        title: 'What you need installed',
        summary: 'Node.js 20+, npm, and a PostgreSQL database for the portal\'s own tables.',
        detail: (
          <div className="space-y-2 text-sm text-slate-600">
            <p>You need three things on your machine before touching this codebase:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><b>Node.js 20 or newer</b> — check with <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">node -v</code></li>
              <li><b>npm</b> (comes with Node)</li>
              <li>
                <b>A PostgreSQL database</b> for the portal's own tables — any Postgres works: a
                local install, a free <a className="text-brand-indigo underline" href="https://supabase.com" target="_blank" rel="noreferrer">Supabase</a> project, or Docker.
                This is separate from — and has nothing to do with — the school's actual student
                database, which is connected later through the app itself.
              </li>
            </ul>
          </div>
        ),
      },
      {
        title: 'What this project actually is',
        summary: 'A homework portal that plugs into whatever student database a school already runs, without hardcoding a single column name.',
        detail: (
          <div className="space-y-2 text-sm text-slate-600">
            <p>
              Four roles: <b>Super Admin</b> runs setup and manages accounts, <b>Branch Head</b>{' '}
              assigns teachers to classes, <b>Teacher</b> posts and grades homework, <b>Student</b>{' '}
              sees their feed and submits work.
            </p>
            <p>
              The one unusual piece: instead of assuming the school's database has particular
              table/column names, an admin maps the real columns onto logical fields in a
              setup wizard the first time the app runs. Everything downstream reads through that
              mapping. There's also a <b>testing mode</b> that skips all of that and seeds demo
              data instead — see the "Try it out" section below.
            </p>
          </div>
        ),
      },
    ],
  },
  {
    label: 'Get it running',
    color: 'bg-brand-indigo/10 text-brand-indigo',
    steps: [
      {
        title: 'Install dependencies',
        summary: 'One command installs every workspace in the monorepo at once.',
        detail: (
          <div>
            <p className="text-sm text-slate-600 mb-1">From the repository root:</p>
            <Code>npm install</Code>
            <Then>Every app and package's dependencies are installed in one pass — npm workspaces handles the monorepo.</Then>
          </div>
        ),
      },
      {
        title: 'Set up environment variables',
        summary: 'Copy the template, fill in two generated secrets and your Postgres connection.',
        detail: (
          <div>
            <Code>{'cp .env.example apps/api/.env'}</Code>
            <p className="text-sm text-slate-600 mt-2 mb-1">
              Open <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">apps/api/.env</code> and fill in your Postgres
              details (<code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">PORTAL_DB_HOST/PORT/NAME/USER/PASSWORD</code>),
              then generate two secrets:
            </p>
            <Code>{'openssl rand -hex 32   # → PORTAL_MASTER_KEY\nopenssl rand -hex 32   # → JWT_SECRET'}</Code>
            <Then>The app now knows where its own database lives and can encrypt secrets / sign login sessions.</Then>
          </div>
        ),
      },
      {
        title: 'Build the shared packages',
        summary: 'The two apps depend on three internal packages — these must build first.',
        detail: (
          <div>
            <Code>npm run build:packages</Code>
            <Then>
              <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">packages/shared</code>,{' '}
              <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">db-adapters</code>, and{' '}
              <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">mapping</code> compile to <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">dist/</code> — skipping
              this step causes a confusing "module not found" error when starting the API.
            </Then>
          </div>
        ),
      },
      {
        title: 'Create the portal\'s own tables',
        summary: 'Runs every migration against the Postgres database you configured above.',
        detail: (
          <div>
            <Code>npm run migrate</Code>
            <Then>All 20+ <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">hp_*</code> tables now exist — users, homework, submissions, everything the portal owns.</Then>
          </div>
        ),
      },
      {
        title: 'Start both apps',
        summary: 'Two terminals — one for the API, one for the web app.',
        detail: (
          <div>
            <Code>{'npm run dev:api   # http://localhost:4000\nnpm run dev:web   # http://localhost:5173'}</Code>
            <Then>Open <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">http://localhost:5173</code> in a browser — you'll land on the first-time setup wizard automatically, since no admin account exists yet.</Then>
          </div>
        ),
      },
    ],
  },
  {
    label: 'Try it out (no real database needed)',
    color: 'bg-brand-green/10 text-brand-green-dark',
    steps: [
      {
        title: 'Create the admin account',
        summary: 'The very first screen. Pick any login ID and an 8+ character password.',
        detail: (
          <div className="text-sm text-slate-600 space-y-1.5">
            <p>Type a login ID and password into the two fields, then click <Click>Create admin & continue</Click>.</p>
            <Then>An admin account is created and you move to the "Connect" step. Nothing else exists yet — no database connection, no data.</Then>
          </div>
        ),
      },
      {
        title: 'Click "Try it with demo data instead"',
        summary: 'Skips connecting to any real database entirely and seeds a full working demo.',
        detail: (
          <div className="text-sm text-slate-600 space-y-1.5">
            <p>
              Below the admin form there's a second button: <Click>Try it with demo data instead</Click>.
              Click it.
            </p>
            <Then>
              In a few seconds, one branch, two classes, three sections, three subjects, two
              teachers, five students, real teacher-class assignments, and several weeks of
              sample homework history (including one already-graded submission) are seeded
              directly — no database mapping involved at all.
            </Then>
            <Then>
              A results screen appears listing six ready-to-use accounts (branch head, two
              teachers, three students) with their login IDs and passwords. <b>Note these down</b> —
              they're shown only once.
            </Then>
          </div>
        ),
      },
      {
        title: 'Log in as a teacher and post homework',
        summary: 'Click "Go to login", sign in as teacher1, and post something.',
        detail: (
          <div className="text-sm text-slate-600 space-y-1.5">
            <p>Log in with <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">teacher1</code> and the password from the previous step's table.</p>
            <p>You land on <b>My Homework</b> — a mobile-style feed of pastel homework cards, matching the student app's look. Click <Click>+ Post</Click> to expand the composer.</p>
            <p>Fill in a title, tick a class under "Assign to", and click <Click>Publish homework</Click>.</p>
            <Then>The homework appears immediately at the top of your own list, and — the moment you log in as a student in that class — in their feed too.</Then>
          </div>
        ),
      },
      {
        title: 'Log in as a student and submit',
        summary: 'Sign in as student1, open the homework, attach a file, submit.',
        detail: (
          <div className="text-sm text-slate-600 space-y-1.5">
            <p>Log out, then log in as <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">student1</code>.</p>
            <p>Tap the homework card, add an optional note, choose a file, and click <Click>Submit homework</Click>.</p>
            <Then>The submission is recorded immediately — the teacher will see it (and who hasn't submitted yet) on their side.</Then>
          </div>
        ),
      },
      {
        title: 'Log in as the teacher again and grade it',
        summary: 'Click "Submissions" on the homework card, enter a grade, save.',
        detail: (
          <div className="text-sm text-slate-600 space-y-1.5">
            <p>Back in as <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">teacher1</code>, click <Click>Submissions</Click> on the card you posted.</p>
            <p>You'll see the full class roster — including students who haven't submitted yet, not just the one who has. Type a grade and feedback for the submitted one, click <Click>Save</Click>.</p>
            <Then>The student sees the grade and feedback the next time they open that homework.</Then>
          </div>
        ),
      },
      {
        title: 'Check the calendar',
        summary: 'The bottom-nav "Calendar" tab, for either role.',
        detail: (
          <div className="text-sm text-slate-600 space-y-1.5">
            <p>Tap <Click>Calendar</Click> in the bottom navigation (either as teacher or student).</p>
            <p>Days with homework show a small orange dot. Tap a day to see exactly what was assigned or due that day.</p>
            <Then>Use the ‹ › arrows to browse other months — this is the full history, not just recent items.</Then>
          </div>
        ),
      },
      {
        title: 'Explore the admin dashboard',
        summary: 'Log in as your admin account to see sync status, bulk provisioning, and users.',
        detail: (
          <div className="text-sm text-slate-600 space-y-1.5">
            <p>Log in with the admin account you created in step 1 of this section.</p>
            <p>
              Notice the amber banner: <i>"You're running on demo/testing data."</i> That's expected
              — it disappears automatically the moment a real database is connected and synced
              (next section).
            </p>
            <Then>Explore <b>Bulk account provisioning</b> (creates logins for synced students/teachers), <b>Users</b> (search/create/deactivate/reset password), and the <b>Audit log</b>.</Then>
          </div>
        ),
      },
    ],
  },
  {
    label: 'Go live with a real database',
    color: 'bg-brand-orange/10 text-brand-orange',
    steps: [
      {
        title: 'Click "Connect real database"',
        summary: 'From the admin dashboard\'s testing-mode banner, or "Re-map source data" any time after.',
        detail: (
          <div className="text-sm text-slate-600 space-y-1.5">
            <p>
              This drops you into the same wizard, but skips the admin-creation step since
              you're already logged in — straight to <b>Connect</b>.
            </p>
            <Then>Pick the school's real database engine (SQL Server, MySQL, PostgreSQL, or Oracle), enter connection details, and click <Click>Test connection</Click> before saving anything.</Then>
          </div>
        ),
      },
      {
        title: 'Browse, map, and validate',
        summary: 'Browse the real schema, map logical fields onto real columns, then check the data quality report.',
        detail: (
          <div className="text-sm text-slate-600 space-y-1.5">
            <p>
              The wizard lists the school's real tables and columns. For each entity (student,
              class, teacher...) pick its source table, then map each field — relationship
              fields ending in <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">_ref</code> often fill themselves in automatically from
              the database's own foreign keys.
            </p>
            <Then>The <b>Validate</b> step checks for missing required values, duplicate IDs, and orphaned references before anything is committed — fix the mapping if it flags a hard error.</Then>
          </div>
        ),
      },
      {
        title: 'Finish setup & sync',
        summary: 'The last screen — this runs migrations (if needed) and the first real sync.',
        detail: (
          <div className="text-sm text-slate-600 space-y-1.5">
            <p>Click <Click>Finish setup & sync</Click>.</p>
            <Then>The school's real students/classes/teachers are pulled into the portal's own tables, replacing the demo data. The admin dashboard's testing-mode banner disappears — you're live.</Then>
            <Then>Use <b>Bulk account provisioning</b> on the admin dashboard to create real logins for every synced student and teacher, then export the CSV of temporary passwords before leaving that page.</Then>
          </div>
        ),
      },
    ],
  },
];

export function GuidePage() {
  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <header className="bg-white border-b border-slate-100">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center gap-3">
          <Logo className="h-8" />
          <div>
            <p className="font-bold text-slate-900 leading-tight">Team Setup Guide</p>
            <p className="text-xs text-slate-400">Everything to check out and run this project — click any step to expand it</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {SECTIONS.map((section) => (
          <section key={section.label}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${section.color}`}>{section.label}</span>
            </div>
            <div className="space-y-2">
              {section.steps.map((step, i) => (
                <StepAccordion key={step.title} index={i + 1} step={step} />
              ))}
            </div>
          </section>
        ))}

        <p className="text-center text-xs text-slate-400 pt-4">
          Still stuck on something? Check <code className="bg-slate-100 px-1.5 py-0.5 rounded">docs/MSEA-Homework-Portal-Handbook.pdf</code> in the repo for the full technical reference.
        </p>
      </main>
    </div>
  );
}

function StepAccordion({ index, step }: { index: number; step: Step }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`bg-white rounded-2xl shadow-card overflow-hidden transition-shadow ${open ? 'ring-1 ring-brand-indigo/20' : ''}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left"
      >
        <span
          className={`shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
            open ? 'bg-brand-indigo text-white' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {index}
        </span>
        <span className="flex-1 min-w-0">
          <p className="font-semibold text-slate-900 text-sm">{step.title}</p>
          <p className="text-xs text-slate-400 truncate">{step.summary}</p>
        </span>
        <span className={`shrink-0 text-slate-300 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && <div className="px-5 pb-5 pl-[3.25rem] -mt-1">{step.detail}</div>}
    </div>
  );
}
