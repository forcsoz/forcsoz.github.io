// PDF·PPTX 에서 검색용 글자 뽑기 + pdf.js 불러오기 (모두 이 사이트 안의 파일, 바깥 스크립트 없음)

let pdfjsP = null;
export function pdfjs() {
  if (!pdfjsP) {
    pdfjsP = import('./vendor/pdfjs/pdf.min.mjs').then(lib => {
      lib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
      return lib;
    });
  }
  return pdfjsP;
}

export const pdfOpts = () => ({
  cMapUrl: new URL('./vendor/pdfjs/cmaps/', import.meta.url).href,
  cMapPacked: true,
  standardFontDataUrl: new URL('./vendor/pdfjs/standard_fonts/', import.meta.url).href,
  isEvalSupported: false,
  enableXfa: false,
});

export async function openPdf(bytes) {
  const lib = await pdfjs();
  return lib.getDocument({ data: bytes, ...pdfOpts() }).promise;
}

// → { text, pages }
export async function pdfText(bytes, { maxChars = 60000 } = {}) {
  const doc = await openPdf(bytes.slice());
  let text = '';
  for (let i = 1; i <= doc.numPages && text.length < maxChars; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    text += `\n[${i}쪽]\n` + tc.items.map(x => (x.str || '') + (x.hasEOL ? '\n' : '')).join('');
  }
  const pages = doc.numPages;
  await doc.destroy();
  return { text: text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, maxChars), pages };
}

let zipP = null;
function jszip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  if (!zipP) {
    zipP = new Promise((ok, bad) => {
      const s = document.createElement('script');
      s.src = new URL('./vendor/jszip.min.js', import.meta.url).href;
      s.onload = () => ok(window.JSZip);
      s.onerror = () => bad(new Error('압축 도구를 불러오지 못했어요.'));
      document.head.append(s);
    });
  }
  return zipP;
}
export { jszip };

// PPTX 의 슬라이드 글자 → { text, pages(슬라이드 수) }
export async function pptxText(bytes, { maxChars = 60000 } = {}) {
  const JSZip = await jszip();
  const zip = await JSZip.loadAsync(bytes);
  const slides = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  let text = '';
  for (const [i, n] of slides.entries()) {
    const xml = await zip.file(n).async('string');
    const paras = xml.split(/<\/a:p>/).map(p => [...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => m[1]).join('')).filter(Boolean);
    text += `\n[슬라이드 ${i + 1}]\n` + paras.map(decodeXml).join('\n');
    if (text.length > maxChars) break;
  }
  return { text: text.trim().slice(0, maxChars), pages: slides.length };
}

const decodeXml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export async function extractText(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    if (/pdf/i.test(file.type) || /\.pdf$/i.test(file.name)) return await pdfText(bytes);
    if (/presentationml/i.test(file.type) || /\.pptx$/i.test(file.name)) return await pptxText(bytes);
  } catch (e) {
    console.warn('글자를 뽑지 못했어요', file.name, e);
  }
  return { text: '', pages: 0 };
}
