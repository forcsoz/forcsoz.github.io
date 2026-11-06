// 화면 도우미 — 알림, 대화 상자, 내려받기, 복사, 폼 읽기

import { esc } from './md.js';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

let toastTimer = 0;
export function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast ${kind}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, kind === 'error' ? 6000 : 2600);
}

// 대화 상자. html 안의 [data-close] 를 누르면 닫힌다. → 닫힐 때 돌아오는 값 (data-close 값)
export function modal(html, { wide = false, onOpen } = {}) {
  const d = $('#modal');
  const body = $('#modal-body');
  body.innerHTML = html;
  d.classList.toggle('wide', wide);
  return new Promise(ok => {
    const done = v => {
      d.removeEventListener('click', onClick);
      d.removeEventListener('cancel', onCancel);
      if (d.open) d.close();
      body.innerHTML = '';
      ok(v);
    };
    const onClick = e => {
      const c = e.target.closest('[data-close]');
      if (c) { e.preventDefault(); done(c.dataset.close); }
      else if (e.target === d) done('');
    };
    const onCancel = e => { e.preventDefault(); done(''); };
    d.addEventListener('click', onClick);
    d.addEventListener('cancel', onCancel);
    d.showModal();
    onOpen?.(body, done);
  });
}

export async function confirmBox(text, { ok = '확인', cancel = '취소', danger = false } = {}) {
  const r = await modal(`<div class="dlg"><p>${esc(text)}</p><div class="row end"><button class="btn" data-close="no">${esc(cancel)}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-close="yes">${esc(ok)}</button></div></div>`);
  return r === 'yes';
}

export function download(blob, name) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u;
  a.download = name || 'file';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 60000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.className = 'offscreen';
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('복사했어요');
}

// 폼 → 객체. name="a.b.0.c" 경로, name 이 [] 로 끝나면 체크된 값 목록, data-type: num | ver(→ 숫자) | bool | lines(줄마다) | csv
export function readForm(form, { parseVer } = {}) {
  const out = {};
  const set = (path, val) => {
    const keys = path.split('.');
    let o = out;
    keys.forEach((k, i) => {
      const last = i === keys.length - 1;
      const nextIsIdx = !last && /^\d+$/.test(keys[i + 1]);
      if (last) o[k] = val;
      else {
        if (o[k] == null) o[k] = nextIsIdx ? [] : {};
        o = o[k];
      }
    });
  };
  const lists = new Map();
  for (const el of form.elements) {
    const name = el.name;
    if (!name || el.disabled || el.type === 'file' || el.dataset.skip != null) continue;
    if (name.endsWith('[]')) {
      const p = name.slice(0, -2);
      if (!lists.has(p)) lists.set(p, []);
      if (el.checked) lists.get(p).push(el.value);
      continue;
    }
    const t = el.dataset.type;
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (t === 'num') v = el.value.trim() === '' ? null : Number(el.value);
    else if (t === 'ver') v = parseVer ? parseVer(el.value) : el.value;
    else if (t === 'lines') v = el.value.split('\n').map(s => s.trim()).filter(Boolean);
    else if (t === 'csv') v = el.value.split(',').map(s => s.trim()).filter(Boolean);
    else if (t === 'nullable') v = el.value.trim() || null;
    else v = el.value;
    set(name, v);
  }
  for (const [p, vals] of lists) set(p, vals);
  // 빈 칸이 생긴 배열 정리
  const clean = o => {
    if (Array.isArray(o)) return o.filter(x => x != null).map(clean);
    if (o && typeof o === 'object') { for (const k of Object.keys(o)) o[k] = clean(o[k]); }
    return o;
  };
  return clean(out);
}

export const fmtSize = n => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}MB` : n >= 1e3 ? `${Math.round(n / 1e3)}KB` : `${n || 0}B`);

export function fmtWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function ago(iso) {
  if (!iso) return '';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}일 전`;
  return fmtWhen(iso).slice(0, 10);
}

export const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
