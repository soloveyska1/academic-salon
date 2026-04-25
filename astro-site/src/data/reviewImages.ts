/** Review screenshots used in the auto-scrolling wall on the homepage.
 *  Each entry carries explicit width/height so the browser can reserve
 *  layout space immediately (no CLS while images stream in). The `row`
 *  field controls which of the two scroll lanes the image appears in. */

export interface ReviewImage {
  file: string;
  w: number;
  h: number;
  alt: string;
  row: 1 | 2;
}

export const reviewImages: ReviewImage[] = [
  { file: '4.webp',  w: 591, h: 816,  alt: 'Отзыв: Автомат, 5 — спасибо огромное',       row: 1 },
  { file: '2.webp',  w: 590, h: 536,  alt: 'Отзыв: У меня 5, работа очень хорошая',       row: 1 },
  { file: '8.webp',  w: 600, h: 602,  alt: 'Отзыв: Всё отлично, спасибо',                 row: 1 },
  { file: '5.webp',  w: 590, h: 1014, alt: 'Отзыв: Сдали с первого раза',                 row: 1 },
  { file: '3.webp',  w: 590, h: 439,  alt: 'Отзыв: Четвёрка твёрдая, отлично всё',        row: 1 },
  { file: '6.webp',  w: 600, h: 1167, alt: 'Отзыв: Сдала на 4, сказали хорошая работа',   row: 2 },
  { file: '1.webp',  w: 590, h: 307,  alt: 'Отзыв: Спасибо за работу',                    row: 2 },
  { file: '7.webp',  w: 600, h: 391,  alt: 'Отзыв: Кайф, благодарю за быструю работу',    row: 2 },
  { file: '10.webp', w: 600, h: 248,  alt: 'Отзыв: Работа принята без замечаний',         row: 2 },
  { file: '9.webp',  w: 458, h: 214,  alt: 'Отзыв: Преподаватель поставил отлично',       row: 2 },
];
