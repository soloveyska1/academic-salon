/**
 * Subject hub helpers.
 *
 * Subjects in catalog data are stored as Russian strings ("Психология",
 * "Социальная работа", …). We map them to URL-friendly latin slugs so
 * shareable URLs stay clean (and SEO-friendly).
 *
 * "Общее" — bucket for unclassified pieces; intentionally NOT exposed as
 * a hub (would dilute focused subject SEO).
 */

import { D } from '../data/catalog.js';

export interface SubjectMeta {
  slug: string;
  name: string;
  /** Genitive case for natural Russian copy ("каталог по психологии"). */
  ofCase: string;
  /** Short editorial intro for the hub page. */
  intro: string;
  /** Optional latin label for eyebrow / Roman-style overlines. */
  latin?: string;
}

const SUBJECTS: SubjectMeta[] = [
  {
    slug: 'psychology',
    name: 'Психология',
    ofCase: 'психологии',
    latin: 'Psychologia',
    intro: 'Курсовые, ВКР и самостоятельные по общей, возрастной, клинической и социальной психологии. Вся теория, практика и диагностика, которую студенты передают следующим поколениям.',
  },
  {
    slug: 'social-work',
    name: 'Социальная работа',
    ofCase: 'социальной работе',
    latin: 'Opera Socialis',
    intro: 'Документы по социальной работе: реабилитация, защита прав, работа с уязвимыми группами, методические материалы. Архив, собранный преимущественно бакалаврами и магистрантами профильных кафедр.',
  },
  {
    slug: 'conflict-studies',
    name: 'Конфликтология',
    ofCase: 'конфликтологии',
    latin: 'Conflictologia',
    intro: 'Тексты о природе конфликта: теории, методы анализа, переговоры и медиация. Полезно при подготовке курсовых на стыке психологии, социологии и менеджмента.',
  },
  {
    slug: 'sociology',
    name: 'Социология',
    ofCase: 'социологии',
    latin: 'Sociologia',
    intro: 'Работы по теоретической и прикладной социологии: методы исследования, статистика, эмпирика. Подспорье для курсовых и эссе по гуманитарным дисциплинам.',
  },
  {
    slug: 'philosophy',
    name: 'Философия',
    ofCase: 'философии',
    latin: 'Philosophia',
    intro: 'Тексты по истории и проблематике философии: этика, эпистемология, философия науки, антропология. Базовый набор для гуманитарного бакалавриата.',
  },
  {
    slug: 'history',
    name: 'История',
    ofCase: 'истории',
    latin: 'Historia',
    intro: 'Эссе и реферативные работы по всеобщей и отечественной истории — от античности до новейшего времени. Подходит как материал к семинарам и зачётам.',
  },
  {
    slug: 'economics',
    name: 'Экономика',
    ofCase: 'экономике',
    latin: 'Oeconomia',
    intro: 'Базовые тексты по экономической теории и прикладной экономике в социальной сфере: микро, макро, рынки, политика занятости.',
  },
  {
    slug: 'english',
    name: 'Английский язык',
    ofCase: 'английскому языку',
    latin: 'Lingua Anglica',
    intro: 'Учебные материалы и практические задания по английскому: грамматика, лексика, переводы и эссе для гуманитарных направлений.',
  },
  {
    slug: 'russian',
    name: 'Русский язык',
    ofCase: 'русскому языку',
    latin: 'Lingua Russica',
    intro: 'Работы по русскому языку и стилистике: культура речи, академическое письмо, лингвистический анализ. Полезно при подготовке к курсовым и устным зачётам.',
  },
  {
    slug: 'math-statistics',
    name: 'Математика и статистика',
    ofCase: 'математике и статистике',
    latin: 'Mathematica',
    intro: 'Задачи и пояснения по высшей математике, теории вероятностей и статистическим методам — включая обработку данных в SPSS и Excel.',
  },
  {
    slug: 'anthropology',
    name: 'Антропология',
    ofCase: 'антропологии',
    latin: 'Anthropologia',
    intro: 'Работы по социальной и культурной антропологии: ритуалы, идентичности, полевые исследования. Сопутствующий курс для социологов и психологов.',
  },
  {
    slug: 'physiology',
    name: 'Физиология и анатомия',
    ofCase: 'физиологии и анатомии',
    latin: 'Physiologia',
    intro: 'Конспекты и контрольные по анатомии человека и физиологии нервной системы — то, без чего не обходится психология и медико-социальная работа.',
  },
  {
    slug: 'law',
    name: 'Правоведение',
    ofCase: 'правоведению',
    latin: 'Iurisprudentia',
    intro: 'Базовые тексты по правоведению, основам конституционного и трудового права — необходимая подложка для социальных и гуманитарных направлений.',
  },
  {
    slug: 'pedagogy',
    name: 'Педагогика',
    ofCase: 'педагогике',
    latin: 'Paedagogia',
    intro: 'Работы по дидактике, теории воспитания и методике преподавания. Важная дисциплина для будущих психологов, социальных работников и преподавателей.',
  },
  {
    slug: 'culturology',
    name: 'Культурология',
    ofCase: 'культурологии',
    latin: 'Culturologia',
    intro: 'Эссе по теории и истории культуры: эпохи, художественные стили, культурные практики и идентичности.',
  },
  {
    slug: 'ethics',
    name: 'Этика',
    ofCase: 'этике',
    latin: 'Ethica',
    intro: 'Тексты по нормативной и прикладной этике — включая профессиональную этику психолога и социального работника.',
  },
  {
    slug: 'logic',
    name: 'Логика',
    ofCase: 'логике',
    latin: 'Logica',
    intro: 'Конспекты и контрольные по формальной логике: суждения, умозаключения, аргументация. Базовый курс для гуманитариев первых лет обучения.',
  },
];

const BY_SLUG = new Map<string, SubjectMeta>(SUBJECTS.map((s) => [s.slug, s]));
const BY_NAME = new Map<string, SubjectMeta>(SUBJECTS.map((s) => [s.name, s]));

export function getAllSubjects(): SubjectMeta[] {
  return SUBJECTS;
}

export function getSubjectBySlug(slug: string): SubjectMeta | undefined {
  return BY_SLUG.get(slug);
}

export function getSlugBySubject(name: string): string | undefined {
  return BY_NAME.get(name)?.slug;
}

/** Docs that belong to a given subject (by Russian display name). */
export function getDocsBySubject(name: string): any[] {
  return (D as any[]).filter((d) => d.subject === name);
}

/** Subject slugs paired with current doc counts — used by hub index. */
export function getSubjectsWithCounts(): Array<SubjectMeta & { count: number }> {
  return SUBJECTS.map((s) => ({
    ...s,
    count: getDocsBySubject(s.name).length,
  })).filter((s) => s.count > 0);
}
