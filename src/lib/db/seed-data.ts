export interface LaunchSubjectSeed {
  slug: string;
  displayNameHe: string;
  displayNameEn: string;
  category: "core" | "science" | "preparatory" | "business";
  sortOrder: number;
}

export const launchSubjects: LaunchSubjectSeed[] = [
  {
    slug: "mathematics",
    displayNameHe: "מתמטיקה",
    displayNameEn: "Mathematics",
    category: "core",
    sortOrder: 10,
  },
  {
    slug: "english",
    displayNameHe: "אנגלית",
    displayNameEn: "English",
    category: "core",
    sortOrder: 20,
  },
  {
    slug: "hebrew-lashon",
    displayNameHe: "עברית ולשון",
    displayNameEn: "Hebrew and grammar",
    category: "core",
    sortOrder: 30,
  },
  {
    slug: "psychometric",
    displayNameHe: "פסיכומטרי",
    displayNameEn: "Psychometric exam",
    category: "preparatory",
    sortOrder: 40,
  },
  {
    slug: "statistics",
    displayNameHe: "סטטיסטיקה",
    displayNameEn: "Statistics",
    category: "business",
    sortOrder: 50,
  },
  {
    slug: "accounting",
    displayNameHe: "חשבונאות",
    displayNameEn: "Accounting",
    category: "business",
    sortOrder: 60,
  },
  {
    slug: "economics",
    displayNameHe: "כלכלה",
    displayNameEn: "Economics",
    category: "business",
    sortOrder: 70,
  },
  {
    slug: "computer-science",
    displayNameHe: "מדעי המחשב",
    displayNameEn: "Computer science",
    category: "science",
    sortOrder: 80,
  },
  {
    slug: "physics",
    displayNameHe: "פיזיקה",
    displayNameEn: "Physics",
    category: "science",
    sortOrder: 90,
  },
  {
    slug: "chemistry",
    displayNameHe: "כימיה",
    displayNameEn: "Chemistry",
    category: "science",
    sortOrder: 100,
  },
  {
    slug: "biology",
    displayNameHe: "ביולוגיה",
    displayNameEn: "Biology",
    category: "science",
    sortOrder: 110,
  },
];
