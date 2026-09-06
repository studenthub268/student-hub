#!/usr/bin/env node
/**
 * Seed a rich dev fixture set so the smoke tests exercise deeper filter
 * combinations: all 5 resource types spread across many subjects, several
 * professors and departments.
 *
 * Usage:
 *   node scripts/seed-fixtures.mjs            # no-op if fixtures exist
 *   node scripts/seed-fixtures.mjs --force    # delete + reseed
 *   node scripts/seed-fixtures.mjs --clean    # delete fixtures only
 *
 * All fixtures are tagged "[Smoke Fixture]" in the title prefix and belong to
 * a dedicated "Smoke Fixtures" uploader, so cleanup never touches real data.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

const UPLOADER_EMAIL = "smoke-fixtures@example.com";
const PREFIX = "[Smoke Fixture]";
const DEPARTMENTS = ["Electrical Engineering", "Computer Science", "Mechanical Engineering", "Business Administration"];
const TYPES = ["assignment", "quiz", "past-paper", "notes", "other"];

const SUBJECTS = [
  "Applied Physics", "Applied Physics Lab", "Artificial Intelligence", "Calculus",
  "Communication Skills", "Compiler Construction", "Data Structures and Algorithm",
  "Database Systems", "Design and Analysis of Algorithm", "Digital Logic Design",
  "Discrete Mathematics", "Entrepreneurship and Business Management",
  "Enterprise Application Development", "Functional English", "Graph Theory",
  "Introduction to Computing", "Islamiyat", "Leadership Strategies", "Linear Algebra",
  "Mathematics", "Object Oriented Programming", "Pak Studies",
  "Programming Fundamentals", "Psychology", "Statistics", "Theory of Automata",
  "Workshop Practice",
];

const PROFESSORS = ["Dr. Sarah Ahmed", "Prof. Bilal Khan", "Dr. Maya Iqbal", "Prof. Usman Tariq", "Dr. Ayesha Noor"];

/** Deterministic PRNG so seeds are stable across runs. */
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);

const FILE_KINDS = [
  { type: "application/pdf", ext: "pdf", size: [120_000, 8_400_000] },
  { type: "image/jpeg", ext: "jpg", size: [40_000, 900_000] },
  { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx", size: [30_000, 500_000] },
];

async function fixtureUploaderId() {
  const existing = await sql`select id from users where email = ${UPLOADER_EMAIL}`;
  if (existing.length > 0) return existing[0].id;
  const inserted = await sql`
    insert into users (email, name, email_verified, password_hash)
    values (${UPLOADER_EMAIL}, ${"Smoke Fixtures"}, now(), null)
    returning id`;
  return inserted[0].id;
}

async function countFixtures() {
  const r = await sql`select count(*)::int as n from resources where title like ${PREFIX + "%"}`;
  return r[0].n;
}

async function deleteFixtures() {
  const r = await sql`delete from resources where title like ${PREFIX + "%"} returning id`;
  await sql`delete from users where email = ${UPLOADER_EMAIL}`;
  return r.length;
}

async function seed() {
  const uploaderId = await fixtureUploaderId();
  const rows = [];
  // 2 resources per subject → 54 fixtures; types and professors spread round-robin.
  for (let i = 0; i < SUBJECTS.length; i++) {
    for (let copy = 0; copy < 2; copy++) {
      const subject = SUBJECTS[i];
      const kind = FILE_KINDS[Math.floor(rand() * FILE_KINDS.length)];
      const type = TYPES[(i + copy) % TYPES.length];
      const professor = PROFESSORS[(i + copy) % PROFESSORS.length];
      const department = DEPARTMENTS[i % DEPARTMENTS.length];
      const size = Math.round(kind.size[0] + rand() * (kind.size[1] - kind.size[0]));
      // Give some titles a word that also appears in a subject name, so
      // subject-search has title matches AND subject-only matches.
      const variant = copy === 0 ? "Midterm" : "Final";
      rows.push({
        title: `${PREFIX} ${subject} ${variant} ${type === "past-paper" ? "Past Paper" : type[0].toUpperCase() + type.slice(1)}`,
        description: `${variant} ${type} material for ${subject}. Smoke fixture for filter testing.`,
        type,
        subject,
        professor,
        department,
        file_url: `https://fixtures.invalid/${encodeURIComponent(subject)}-${copy}.${kind.ext}`,
        file_key: `fixtures/${encodeURIComponent(subject)}-${copy}.${kind.ext}`,
        file_type: kind.type,
        file_size: size,
        uploader_id: uploaderId,
        downloads: Math.floor(rand() * 200),
        likes: Math.floor(rand() * 90),
      });
    }
  }

  // Insert row-by-row in small batches via a transaction (neon http driver
  // has no multi-row values helper).
  for (let i = 0; i < rows.length; i += 10) {
    const chunk = rows.slice(i, i + 10);
    const statements = chunk.map(
      (r) => sql`insert into resources
        (title, description, type, subject, professor, department, file_url, file_key, file_type, file_size, uploader_id, downloads, likes)
        values (${r.title}, ${r.description}, ${r.type}, ${r.subject}, ${r.professor}, ${r.department}, ${r.file_url}, ${r.file_key}, ${r.file_type}, ${r.file_size}, ${r.uploader_id}, ${r.downloads}, ${r.likes})`
    );
    await sql.transaction([...statements]);
  }
  return rows.length;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
const mode = process.argv[2] || "";
const existing = await countFixtures();

if (mode === "--clean") {
  const n = await deleteFixtures();
  console.log(`Deleted ${n} fixture resources + uploader.`);
  process.exit(0);
}

if (existing > 0 && mode !== "--force") {
  console.log(`Fixtures already present (${existing} rows). Use --force to reseed, --clean to remove.`);
  process.exit(0);
}

if (mode === "--force") {
  const n = await deleteFixtures();
  console.log(`Cleared ${n} old fixtures.`);
}

const inserted = await seed();
const total = await sql`select count(*)::int as n from resources`;
console.log(`Seeded ${inserted} fixture resources across ${SUBJECTS.length} subjects, ${TYPES.length} types, ${PROFESSORS.length} professors. Total resources in DB: ${total[0].n}.`);
