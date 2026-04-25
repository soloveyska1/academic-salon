/**
 * Format a Russian-rouble integer with U+202F narrow-no-break-space
 * thousand separators. The narrow space prevents the digits from being
 * pulled apart on a line break (`14 000 ₽` should never wrap inside).
 */
export const fmtRub = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, '\u202F');
