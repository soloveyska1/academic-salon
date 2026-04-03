/**
 * Document preview — renders PDF and DOCX files inline in the modal
 */
import { gExt } from './utils.js';

let pdfjsLib = null;
let docxPreview = null;

/** Lazy-load PDF.js */
async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).href;
  return pdfjsLib;
}

/** Lazy-load docx-preview */
async function loadDocxPreview() {
  if (docxPreview) return docxPreview;
  docxPreview = await import('docx-preview');
  return docxPreview;
}

/**
 * Render preview for a document file
 * @param {string} fileUrl - URL to the file (e.g. /files/doc.pdf)
 * @param {string} filename - Original filename for extension detection
 * @param {HTMLElement} container - DOM element to render into
 */
export async function renderPreview(fileUrl, filename, container) {
  const ext = gExt(filename);
  container.innerHTML = '';
  container.classList.add('preview-loading');

  // Loading skeleton
  const skeleton = document.createElement('div');
  skeleton.className = 'preview-skeleton';
  skeleton.innerHTML = `
    <div class="preview-skeleton-page"></div>
    <div class="preview-skeleton-text">Загружаем предпросмотр...</div>
  `;
  container.appendChild(skeleton);

  try {
    if (ext === 'pdf') {
      await renderPdfPreview(fileUrl, container);
    } else if (ext === 'docx' || ext === 'doc') {
      await renderDocxPreview(fileUrl, container);
    } else {
      container.innerHTML = '<div class="preview-unsupported">Предпросмотр недоступен для этого формата</div>';
    }
  } catch (err) {
    console.warn('Preview failed:', err);
    container.innerHTML = `
      <div class="preview-error">
        <div class="preview-error-ico">&#128196;</div>
        <div class="preview-error-text">Не удалось загрузить предпросмотр</div>
        <div class="preview-error-hint">Скачайте файл, чтобы просмотреть его на вашем устройстве</div>
      </div>
    `;
  } finally {
    container.classList.remove('preview-loading');
  }
}

/** Render PDF pages as canvas elements */
async function renderPdfPreview(url, container) {
  const lib = await loadPdfJs();
  const response = await fetch(url);
  if (!response.ok) throw new Error('Fetch failed: ' + response.status);
  const data = await response.arrayBuffer();
  const pdf = await lib.getDocument({ data }).promise;

  container.innerHTML = '';
  const totalPages = pdf.numPages;
  const maxPages = Math.min(totalPages, 5); // Preview first 5 pages

  // Controls bar
  const controls = document.createElement('div');
  controls.className = 'preview-controls';
  controls.innerHTML = `
    <span class="preview-pages">${totalPages} ${totalPages === 1 ? 'страница' : totalPages < 5 ? 'страницы' : 'страниц'}</span>
    <span class="preview-hint">${maxPages < totalPages ? 'Показаны первые ' + maxPages : 'Все страницы'}</span>
  `;
  container.appendChild(controls);

  // Pages container
  const pagesWrap = document.createElement('div');
  pagesWrap.className = 'preview-pages-wrap';
  container.appendChild(pagesWrap);

  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });

    // Scale to fit container width (max 560px)
    const containerWidth = Math.min(container.clientWidth - 32, 560);
    const scale = containerWidth / viewport.width;
    const scaledViewport = page.getViewport({ scale });

    const pageDiv = document.createElement('div');
    pageDiv.className = 'preview-page';

    const pageNum = document.createElement('div');
    pageNum.className = 'preview-page-num';
    pageNum.textContent = i + ' / ' + totalPages;

    const canvas = document.createElement('canvas');
    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;
    canvas.className = 'preview-canvas';

    pageDiv.appendChild(canvas);
    pageDiv.appendChild(pageNum);
    pagesWrap.appendChild(pageDiv);

    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
  }

  if (maxPages < totalPages) {
    const more = document.createElement('div');
    more.className = 'preview-more';
    more.innerHTML = `Ещё ${totalPages - maxPages} ${totalPages - maxPages === 1 ? 'страница' : 'страниц'} — скачайте файл для полного просмотра`;
    pagesWrap.appendChild(more);
  }
}

/** Render DOCX via docx-preview */
async function renderDocxPreview(url, container) {
  const lib = await loadDocxPreview();
  const response = await fetch(url);
  if (!response.ok) throw new Error('Fetch failed: ' + response.status);
  const blob = await response.blob();

  container.innerHTML = '';

  // Controls bar
  const controls = document.createElement('div');
  controls.className = 'preview-controls';
  controls.innerHTML = '<span class="preview-hint">Предпросмотр документа</span>';
  container.appendChild(controls);

  const docxContainer = document.createElement('div');
  docxContainer.className = 'preview-docx-wrap';
  container.appendChild(docxContainer);

  await lib.renderAsync(blob, docxContainer, null, {
    className: 'preview-docx',
    inWrapper: true,
    ignoreWidth: false,
    ignoreHeight: true,
    ignoreFonts: false,
    breakPages: true,
    ignoreLastRenderedPageBreak: true,
    experimental: false,
    trimXmlDeclaration: true,
    useBase64URL: true,
  });
}
