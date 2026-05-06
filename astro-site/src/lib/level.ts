/**
 * Difficulty / education-level badges.
 *
 * `doc.course` is sparsely populated (~28% of catalog) and free-form:
 * "1 курс", "2 курс", "3 курс", "Магистратура", and the occasional
 * misclassified subject. We map only well-formed values to a short
 * badge label; everything else returns null (no badge rendered).
 */

export interface LevelBadge {
  /** Compact label for chips. */
  label: string;
  /** Full descriptor for tooltips / aria-label. */
  full: string;
  /** Visual key for CSS hooks (e.g. data-level="bachelor-1"). */
  key: 'bachelor-1' | 'bachelor-2' | 'bachelor-3' | 'bachelor-4' | 'master' | 'phd';
}

const COURSE_PATTERNS: Array<{ re: RegExp; out: LevelBadge }> = [
  { re: /^\s*1[\s_-]*к(урс)?/i,  out: { label: '1 курс', full: 'Бакалавриат · 1 курс', key: 'bachelor-1' } },
  { re: /^\s*2[\s_-]*к(урс)?/i,  out: { label: '2 курс', full: 'Бакалавриат · 2 курс', key: 'bachelor-2' } },
  { re: /^\s*3[\s_-]*к(урс)?/i,  out: { label: '3 курс', full: 'Бакалавриат · 3 курс', key: 'bachelor-3' } },
  { re: /^\s*4[\s_-]*к(урс)?/i,  out: { label: '4 курс', full: 'Бакалавриат · 4 курс', key: 'bachelor-4' } },
  { re: /магистр/i,              out: { label: 'Магистратура', full: 'Магистратура', key: 'master' } },
  { re: /аспирант/i,             out: { label: 'Аспирантура', full: 'Аспирантура', key: 'phd' } },
];

export function getLevelBadge(doc: { course?: string; docType?: string }): LevelBadge | null {
  const course = (doc.course || '').trim();
  if (course) {
    for (const { re, out } of COURSE_PATTERNS) {
      if (re.test(course)) return out;
    }
  }
  // Fallback: ВКР implies bachelor's senior year.
  const dtype = (doc.docType || '').toLowerCase();
  if (dtype.includes('выпускная квалификационная')) {
    return { label: 'ВКР', full: 'Выпускная квалификационная работа', key: 'bachelor-4' };
  }
  return null;
}
