import { POLICY_VERSION } from "./generated/deploy-version";

// The terms/privacy version IS the app version (see
// scripts/write-deploy-version.mjs): it is displayed on the terms page and
// recorded alongside the consent timestamp at signup and first OAuth sign-in.
// A release is one `npm version` bump — no separate number to maintain.
export { POLICY_VERSION };

// Owner/creator accounts that are PERMANENT admins: the server refuses to
// remove them from the admin list or delete the account, and the admin panel
// hides the remove/demote buttons. Override via env if the site ever changes
// hands.
const OWNER_EMAIL = process.env.OWNER_ADMIN_EMAIL || "abubakartanveer826@gmail.com";
export const PERMANENT_ADMIN_EMAILS: readonly string[] = [OWNER_EMAIL.toLowerCase()];

export function isPermanentAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return PERMANENT_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

export const DEPARTMENTS = [
  "Computer Science",
  "Software Engineering",
  "Information Technology",
  "Data Science",
  "Electrical Engineering",
  "Mechanical Engineering",
  "Business Administration",
  "Commerce",
  "Economics",
  "English Literature",
  "Psychology",
  "Mathematics",
  "Physics",
  "Chemistry",
  "Other",
];

export const SUBJECTS = [
  "Applied Physics",
  "Applied Physics Lab",
  "Artificial Intelligence",
  "Calculus",
  "Circuit Analysis and Design",
  "Communication Skills",
  "Compiler Construction",
  "Data Structures and Algorithm",
  "Database Systems",
  "Design and Analysis of Algorithm",
  "Digital Logic Design",
  "Discrete Mathematics",
  "Electricity and Magnetism",
  "Entrepreneurship and Business Management",
  "Enterprise Application Development",
  "Functional English",
  "Graph Theory",
  "Introduction to Computing",
  "Islamiyat",
  "Leadership Strategies",
  "Linear Algebra",
  "Mathematics",
  "Object Oriented Programming",
  "Pak Studies",
  "Programming Fundamentals",
  "Psychology",
  "Statistics",
  "Theory of Automata",
  "Workshop Practice",
];

export const RESOURCE_TYPES = [
  { value: "assignment", label: "Assignment", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  { value: "quiz", label: "Quiz", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  { value: "past-paper", label: "Past Paper", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  { value: "notes", label: "Notes", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
  { value: "other", label: "Other", color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300" },
];

export function getTypeConfig(type: string) {
  return RESOURCE_TYPES.find((t) => t.value === type) || RESOURCE_TYPES[4];
}
