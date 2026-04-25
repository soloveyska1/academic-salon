/** Pricing rows for the Genres section on the homepage.
 *  Explicit   (NBSP) and   (narrow no-break space) escapes
 *  are intentional — they prevent line breaks in short Russian phrases
 *  like "от 14 000 ₽" or "Презентация и речь к защите". Don't normalize. */

export interface GenreRow {
  no: string;
  /** Used by the Formula calculator state machine — keep stable. */
  code: string;
  latin: string;
  name: string;
  desc: string;
  priceFrom: number;
  href: string;
}

export const genres: GenreRow[] = [
  { no: 'I',    code: 'ess',      latin: 'Exercitium',   name: 'Самостоятельная',    desc: 'Короткий ответ по\u00a0вопросу или\u00a0теме.',            priceFrom: 2500,  href: '/order?topic=' + encodeURIComponent('Самостоятельная работа') },
  { no: 'II',   code: 'ref',      latin: 'Epitome',      name: 'Реферат',            desc: 'Обзор источников по\u00a0ГОСТ.',                           priceFrom: 3500,  href: '/order?type=ref' },
  { no: 'III',  code: 'article',  latin: 'Articulus',    name: 'Научная статья',     desc: 'ВАК, РИНЦ, студенческие сборники.',                        priceFrom: 6000,  href: '/order?topic=' + encodeURIComponent('Научная статья') },
  { no: 'IV',   code: 'pres',     latin: 'Oratio',       name: 'Презентация и\u00a0речь', desc: '15\u00a0слайдов и\u00a07–10\u00a0минут речи к\u00a0защите.', priceFrom: 7500, href: '/order?topic=' + encodeURIComponent('Презентация и речь к защите') },
  { no: 'V',    code: 'practice', latin: 'Relatio',      name: 'Отчёт по\u00a0практике', desc: 'Дневник, характеристика, приложения.',                 priceFrom: 8000,  href: '/order?type=practice' },
  { no: 'VI',   code: 'kurs',     latin: 'Commentarium', name: 'Курсовая',           desc: 'Теория\u00a0— от\u00a014\u202F000\u00a0₽. С\u00a0эмпирикой и\u00a0сопровождением к\u00a0защите\u00a0— от\u00a020\u202F000\u00a0₽.', priceFrom: 14000, href: '/order?type=kurs_t' },
  { no: 'VII',  code: 'diplom',   latin: 'Opus magnum',  name: 'ВКР · дипломная',    desc: 'Эмпирика под\u00a0защиту, сопровождение до\u00a0оценки.',  priceFrom: 40000, href: '/order?type=diplom' },
  { no: 'VIII', code: 'magist',   latin: 'Dissertatio',  name: 'Магистерская',       desc: 'С\u00a0апробацией, публикациями, эмпирикой.',              priceFrom: 60000, href: '/order?type=magist' },
];
