/**
 * Deterministic pastel color + icon per subject name, so "Mathematics" always
 * renders the same card color for a given student without a subjects table
 * round-trip. Palette chosen to sit comfortably alongside the brand indigo/
 * green/orange without competing with them.
 */
const PALETTE = [
  { bg: 'bg-[#E7EBFB]', icon: 'bg-white text-brand-indigo', emoji: '📐' }, // math-ish
  { bg: 'bg-[#E1F7EE]', icon: 'bg-white text-brand-green', emoji: '📗' }, // language/reading
  { bg: 'bg-[#FBF0DA]', icon: 'bg-white text-brand-orange', emoji: '🧪' }, // science
  { bg: 'bg-[#F3E8FB]', icon: 'bg-white text-purple-600', emoji: '🌍' }, // social/history
  { bg: 'bg-[#FDE8EC]', icon: 'bg-white text-rose-500', emoji: '🎨' }, // arts
  { bg: 'bg-[#E3F3FB]', icon: 'bg-white text-sky-600', emoji: '💻' }, // computer
];

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function subjectStyle(subjectName: string | null | undefined) {
  const key = subjectName ?? 'General';
  return PALETTE[hashString(key) % PALETTE.length]!;
}
