// PDF 를 이 화면 안에서 보기 (pdf.js, 이 사이트 안의 파일). 못 그리면 내려받기로.

import { openPdf } from './textract.js';
import { esc } from './md.js';
import { download } from './ui.js';

let current = null;

export async function openViewer(blob, name) {
  closeViewer();
  const el = document.createElement('div');
  el.className = 'viewer';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', name);
  el.innerHTML = `
    <div class="viewer-bar">
      <b class="viewer-name" title="${esc(name)}">${esc(name)}</b>
      <span class="viewer-page" aria-live="polite"></span>
      <span class="grow"></span>
      <button class="btn sm" data-v="out" title="작게" aria-label="작게">−</button>
      <button class="btn sm" data-v="fit" title="폭 맞춤">맞춤</button>
      <button class="btn sm" data-v="in" title="크게" aria-label="크게">+</button>
      <button class="btn sm" data-v="dl">내려받기</button>
      <button class="btn sm primary" data-v="close">닫기</button>
    </div>
    <div class="viewer-body"><p class="muted center">PDF 를 여는 중…</p></div>`;
  document.body.append(el);
  document.body.classList.add('no-scroll');
  const body = el.querySelector('.viewer-body');
  const pageLabel = el.querySelector('.viewer-page');
  const st = { el, doc: null, scale: 0, fit: true, io: null, rendering: new Map(), destroyed: false };
  current = st;

  const onKey = e => { if (e.key === 'Escape') closeViewer(); };
  document.addEventListener('keydown', onKey);
  st.cleanup = () => document.removeEventListener('keydown', onKey);

  el.addEventListener('click', e => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    const v = b.dataset.v;
    if (v === 'close') closeViewer();
    else if (v === 'dl') download(blob, name);
    else if (v === 'in') { st.fit = false; st.scale = Math.min(4, st.scale * 1.25); layout(); }
    else if (v === 'out') { st.fit = false; st.scale = Math.max(0.3, st.scale / 1.25); layout(); }
    else if (v === 'fit') { st.fit = true; layout(); }
  });

  try {
    st.doc = await openPdf(new Uint8Array(await blob.arrayBuffer()));
  } catch (e) {
    console.warn(e);
    body.innerHTML = `<div class="empty"><p>이 화면에서 PDF 를 그리지 못했어요.</p><button class="btn primary" data-v="dl">내려받아 열기</button></div>`;
    return;
  }
  if (st.destroyed) return;
  const first = await st.doc.getPage(1);
  const base = first.getViewport({ scale: 1 });
  st.baseW = base.width;
  st.baseH = base.height;

  function fitScale() {
    const w = body.clientWidth - 24;
    return Math.max(0.3, Math.min(2.5, w / st.baseW));
  }

  function layout() {
    if (st.fit || !st.scale) st.scale = fitScale();
    body.innerHTML = '';
    st.io?.disconnect();
    st.rendering.clear();
    st.io = new IntersectionObserver(entries => {
      for (const en of entries) {
        if (en.isIntersecting) render(Number(en.target.dataset.page));
        if (en.intersectionRatio > 0.3) pageLabel.textContent = `${en.target.dataset.page} / ${st.doc.numPages}`;
      }
    }, { root: body, rootMargin: '600px 0px', threshold: [0, 0.3] });
    for (let i = 1; i <= st.doc.numPages; i++) {
      const box = document.createElement('div');
      box.className = 'pdf-page';
      box.dataset.page = String(i);
      box.style.width = `${Math.round(st.baseW * st.scale)}px`;
      box.style.height = `${Math.round(st.baseH * st.scale)}px`;
      body.append(box);
      st.io.observe(box);
    }
    pageLabel.textContent = `1 / ${st.doc.numPages}`;
  }

  async function render(n) {
    if (st.rendering.has(n) || st.destroyed) return;
    st.rendering.set(n, true);
    const box = body.querySelector(`[data-page="${n}"]`);
    if (!box) return;
    const page = await st.doc.getPage(n);
    const vp = page.getViewport({ scale: st.scale });
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const c = document.createElement('canvas');
    c.width = Math.floor(vp.width * dpr);
    c.height = Math.floor(vp.height * dpr);
    c.style.width = `${Math.floor(vp.width)}px`;
    c.style.height = `${Math.floor(vp.height)}px`;
    box.style.height = `${Math.floor(vp.height)}px`;
    box.style.width = `${Math.floor(vp.width)}px`;
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null }).promise;
    if (!st.destroyed) box.replaceChildren(c);
  }

  let rt = 0;
  st.onResize = () => { clearTimeout(rt); rt = setTimeout(() => { if (st.fit) layout(); }, 200); };
  window.addEventListener('resize', st.onResize);
  layout();
}

export function closeViewer() {
  if (!current) return;
  const st = current;
  current = null;
  st.destroyed = true;
  st.io?.disconnect();
  st.cleanup?.();
  window.removeEventListener('resize', st.onResize);
  st.doc?.destroy();
  st.el.remove();
  document.body.classList.remove('no-scroll');
}
