// 팀원 화면들 (관리자도 같은 화면을 본다. 관리자에게만 편집 단추가 더 보인다)

import { A, can, viewRole } from './state.js';
import { roleLabel } from './tiers.js';
import { esc, md, inline, safeUrl } from './md.js';
import { check, parseVersion, parseBuild, fmtVer, fmtRule, fmtRange, answerText, encodeRows, STATUS, pickGuides, pickDownloads, inRange } from './rules.js';
import { allLinks, linkKind, search } from './model.js';
import { fmtSize, fmtWhen, ago, store } from './ui.js';

const M = () => A.model;
const isAdmin = () => A.mode === 'admin' && !A.preview;

// ---------- 작은 조각 ----------
export const prodName = id => M().productById.get(id)?.name || id;

export function chip(id, { link = true } = {}) {
  const p = M().productById.get(id);
  const cls = `chip g-${groupKey(p?.group)}`;
  return link ? `<a class="${cls}" href="#/product/${esc(id)}">${esc(p?.name || id)}</a>` : `<span class="${cls}">${esc(p?.name || id)}</span>`;
}
const groupKey = g => ({ 서버: 'server', 뷰어: 'viewer', 설치형: 'agent' }[g] || 'etc');

export function healthOf(url) {
  const k = linkKind(url);
  const mark = M().links?.[url];
  const local = A.health[url];
  if (mark && mark.ok === false) return { cls: 'bad', text: `깨짐 표시 (${mark.by || '관리자'}, ${ago(mark.at)})` };
  if (local && local.ok === false) return { cls: 'bad', text: `이 기기에서 열리지 않음 (${ago(local.at)})` };
  if (mark?.ok) return { cls: 'ok', text: `확인됨 (${mark.by || '관리자'}, ${ago(mark.at)})` };
  if (local?.ok) return { cls: 'ok', text: `이 기기에서 응답함 (${ago(local.at)})` };
  if (k.kind === 'internal') return { cls: 'internal', text: '사내망에서만 열림' };
  if (k.kind === 'http') return { cls: 'warn', text: 'http (보안 연결 아님)' };
  return { cls: 'unknown', text: '아직 점검 안 함' };
}

export function extLink(l, { cls = '' } = {}) {
  const u = safeUrl(l?.url);
  if (!u) return esc(l?.label || '');
  const h = healthOf(u);
  const label = l.icon ? `🔗 ${linkKind(u).kind === 'oztn' ? 'oztn 안내' : new URL(u).hostname}` : l.label || u;
  const host = linkKind(u);
  return `<a class="ext ${cls}" href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(u)} — ${esc(h.text)}"><i class="dot ${h.cls}" aria-hidden="true"></i>${esc(label)}${l.note ? ` <small>${esc(l.note)}</small>` : ''}${host.kind === 'internal' ? ' <small class="tag">사내</small>' : ''}</a>`;
}

const fileIcon = f => (/pdf/i.test(f?.type || f?.t || '') ? 'PDF' : /presentation|pptx/i.test((f?.type || '') + (f?.name || '')) ? 'PPTX' : 'FILE');

export function fileRow(id, label = '') {
  const f = M().files[id];
  if (!f) return `<div class="file missing">${esc(label || id)} <small>(파일 없음)</small></div>`;
  const kind = fileIcon(f);
  return `<div class="file">
    <span class="ftype ${kind.toLowerCase()}">${kind}</span>
    <div class="fmeta">${label ? `<div class="flabel">${esc(label)}</div>` : ''}<a class="fname" href="#/file/${esc(id)}">${esc(f.name)}</a><small class="muted">${fmtSize(f.size)}${f.pages ? ` · ${f.pages}${kind === 'PPTX' ? '장' : '쪽'}` : ''}</small></div>
    <div class="factions">${kind === 'PDF' ? `<button class="btn sm" data-act="view-file" data-id="${esc(id)}">보기</button>` : ''}<button class="btn sm" data-act="dl-file" data-id="${esc(id)}">받기</button></div>
  </div>`;
}

export function statusBadge(s) {
  return `<span class="st st-${s}">${STATUS[s].label}</span>`;
}

const verBadge = (r, kind = 'oz') => (r ? `<span class="vb">${esc(fmtRange(r, kind))}</span>` : '');

function changesFor(target) {
  return M().changes.filter(c => c.target === target);
}

function newCount() {
  return M().changes.filter(c => c.at > (A.lastSeen || '')).length;
}
export { newCount };

function patchKind(p) {
  const kinds = new Set((p.products || []).map(id => M().productById.get(id)?.versionKind || 'oz'));
  return kinds.size === 1 ? [...kinds][0] : 'oz';
}

function patchesByDate() {
  return [...M().patches].sort((a, b) => (b.noticeDate || '').localeCompare(a.noticeDate || '') || (b.order ?? 0) - (a.order ?? 0));
}

const productOptions = (sel = '', { blank = '제품 고르기' } = {}) => {
  const groups = new Map();
  for (const p of M().products) {
    const g = p.group || '기타';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(p);
  }
  return `${blank ? `<option value="">${esc(blank)}</option>` : ''}${[...groups].map(([g, ps]) => `<optgroup label="${esc(g)}">${ps.map(p => `<option value="${esc(p.id)}"${p.id === sel ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</optgroup>`).join('')}`;
};
export { productOptions };

// ---------- 홈 ----------
export function viewHome() {
  const m = M();
  const latest = m.home?.latest;
  const faq = m.refs.find(r => r.kind === 'faq');
  const sign = m.refs.find(r => r.kind === 'signing');
  const nNew = newCount();
  const recent = m.changes.slice(0, 6);
  const counts = m.products.map(p => ({ p, n: m.patches.filter(x => x.products?.includes(p.id)).length }));
  const maxN = Math.max(1, ...counts.map(c => c.n));
  const recentChecks = store.get('fz-recent-checks', []).slice(0, 4);
  const role = viewRole();
  return `
  ${role === 'public' ? `<section class="login-cta"><div><b>OZ 보안 패치 기술공지</b><span class="muted">누구나 볼 수 있는 공지예요. 유지보수 고객은 인증번호로, 컨설팅팀은 이메일과 코드로 로그인하면 다운로드 링크와 가이드 문서가 열려요.</span></div><a class="btn primary" href="#/login">로그인</a></section>` : ''}
  <section class="hero">
    <div class="hero-text">
      <p class="eyebrow">패치 확인</p>
      <h1>버전을 넣으면<br>필요한 보안 패치가 바로 나와요</h1>
      <p class="muted">제품 · 버전 · 빌드만 넣으세요. ${can('customer') ? '다운로드 링크와 가이드 문서, 메일에 붙여 넣을 답까지 만들어 드려요.' : '어떤 패치가 필요한지 바로 알려 드려요.'}</p>
    </div>
    <form class="quick" data-form="quick-check" autocomplete="off">
      <label class="fld"><span>제품</span><select name="product" required>${productOptions('')}</select></label>
      <label class="fld"><span>버전</span><input name="ver" placeholder="8.0" inputmode="decimal" required></label>
      <label class="fld"><span>빌드</span><input name="build" placeholder="2026.0315" inputmode="decimal"></label>
      <button class="btn primary big">확인</button>
      <p class="hint">버전과 빌드를 붙여 써도 돼요: <code>80.2026.0315.100</code> · 여러 제품은 <a href="#/check">패치 확인</a>에서</p>
    </form>
  </section>

  <section class="quick-actions">
    ${latest?.items?.length ? `<div class="qa"><span class="qa-k">${esc(latest.title || '최신 패치 파일')}</span><div class="qa-v">${latest.items.map(i => extLink(i, { cls: 'btn sm' })).join('')}${latest.hub ? extLink(latest.hub, { cls: 'btn sm ghost' }) : ''}</div>${latest.note ? `<small class="muted">${esc(latest.note)}</small>` : ''}</div>` : ''}
    ${faq ? `<div class="qa"><span class="qa-k">${esc(faq.title)}</span><div class="qa-v">${(faq.files || []).map(f => `<button class="btn sm" data-act="view-file" data-id="${esc(f)}">FAQ 보기</button>`).join('')}</div></div>` : ''}
    ${sign ? `<div class="qa"><span class="qa-k">${esc(sign.title)}</span><div class="qa-v">${(sign.files || []).map(f => `<button class="btn sm" data-act="view-file" data-id="${esc(f)}">가이드</button>`).join('')}${(sign.links || []).map(l => extLink({ ...l, label: 'ozsign' }, { cls: 'btn sm ghost' })).join('')}</div></div>` : ''}
    <div class="qa"><span class="qa-k">한눈에</span><div class="qa-v"><a class="btn sm" href="#/matrix">매트릭스</a><a class="btn sm" href="#/products">제품별</a>${can('team') ? '<a class="btn sm" href="#/links">링크 점검</a>' : ''}</div></div>
  </section>

  <div class="cols">
    <section class="card">
      <header class="card-h"><h2>기술공지 · 최신 보안 패치</h2><a href="#/patches" class="more">전체 ${m.patches.length}개</a></header>
      <ul class="plist">${patchesByDate().map(p => `
        <li><a href="#/patch/${esc(p.id)}" class="prow">
          <span class="pcode">${esc(p.code)}</span>
          <span class="ptitle">${esc(p.title)}</span>
          <span class="pmeta">${esc(p.ruleText || '')}${p.noticeDate ? ` · 공지 ${esc(p.noticeDate)}${p.noticeDateGuess ? '<sup title="oztn 공지 번호에서 추정">*</sup>' : ''}` : ''}</span>
          <span class="pchips">${(p.products || []).map(id => chip(id, { link: false })).join('')}</span>
        </a></li>`).join('')}</ul>
    </section>
    <div class="stack">
      ${can('team') ? `<section class="card">
        <header class="card-h"><h2>최근 변경 ${nNew ? `<span class="badge">새 ${nNew}</span>` : ''}</h2><a href="#/changes" class="more">모두</a></header>
        ${recent.length ? `<ul class="clist">${recent.map(changeItem).join('')}</ul>` : '<p class="muted">아직 변경 기록이 없어요.</p>'}
      </section>` : ''}
      ${recentChecks.length ? `<section class="card"><header class="card-h"><h2>이 기기에서 최근 확인</h2></header><ul class="rlist">${recentChecks.map(r => `<li><a href="#/check?${esc(r.q)}">${esc(r.label)}</a><small class="muted">${esc(r.customer || '')} ${ago(r.at)}</small></li>`).join('')}</ul></section>` : ''}
      <section class="card">
        <header class="card-h"><h2>제품별 보안 패치 수</h2></header>
        <ul class="bars">${counts.map(({ p, n }) => `<li><a href="#/product/${esc(p.id)}"><span class="bl">${esc(p.name)}</span><span class="bt"><i class="bf g-${groupKey(p.group)}" data-w="${Math.round((n / maxN) * 100)}"></i></span><b>${n}</b></a></li>`).join('')}</ul>
      </section>
    </div>
  </div>`;
}

export function changeItem(c) {
  const isNew = c.at > (A.lastSeen || '');
  const route = routeFor(c);
  return `<li class="${isNew ? 'new' : ''}">${isNew ? '<span class="badge sm">새</span>' : ''}<a href="${route}">${esc(c.title || c.target)}</a> <span class="muted">— ${esc(c.summary || '')}</span><small class="muted when">${esc(c.by || '')} · ${ago(c.at)}</small></li>`;
}

function routeFor(c) {
  if (c.col === 'patches' || /^\d{4}_\d{3}$/.test(c.target || '')) return `#/patch/${esc(c.target)}`;
  if (c.col === 'products') return `#/product/${esc(c.target)}`;
  if (c.col === 'notes') return `#/note/${esc(c.target)}`;
  if (c.col === 'docs') return `#/file/${esc(c.target)}`;
  if (c.col === 'links') return '#/links';
  return '#/docs';
}

// ---------- 패치 확인 ----------
function checkRows() {
  return A.check.rows.map(r => ({ product: r.product, ver: parseVersion(r.ver), build: parseBuild(r.build) })).filter(r => r.product);
}

export function viewCheck() {
  const c = A.check;
  const anyAgent = c.rows.some(r => M().productById.get(r.product)?.versionKind === 'agent');
  return `
  <header class="page-h"><div><p class="eyebrow">패치 확인</p><h1>고객 상황으로 필요한 패치 찾기</h1>
  <p class="muted">고객이 쓰는 제품마다 한 줄씩 넣으세요. 결과와 붙여 넣을 답이 바로 바뀌어요. 고객 이름은 이 기기에만 남아요.</p></div></header>
  <form class="card check-form" data-form="check" autocomplete="off">
    <div class="check-top">
      <label class="fld"><span>고객 (선택)</span><input data-bind="customer" value="${esc(c.customer)}" placeholder="예: ○○은행"></label>
      <label class="fld"><span>고객 OZ 버전 ${anyAgent ? '<b class="req">WebLauncher·WebAgent 가이드 고르기</b>' : '(선택)'}</span><input data-bind="oz" value="${esc(c.oz)}" placeholder="8.0" inputmode="decimal"></label>
    </div>
    <div class="check-rows">
      <div class="crow head"><span>제품</span><span>버전</span><span>빌드</span><span></span></div>
      ${c.rows.map((r, i) => `
      <div class="crow">
        <select data-bind="rows.${i}.product" aria-label="제품">${productOptions(r.product)}</select>
        <input data-bind="rows.${i}.ver" value="${esc(r.ver)}" placeholder="${M().productById.get(r.product)?.versionKind === 'agent' ? '10' : '8.0'}" aria-label="버전" inputmode="decimal">
        <input data-bind="rows.${i}.build" value="${esc(r.build)}" placeholder="2026.0315 (.100)" aria-label="빌드" inputmode="decimal">
        <button type="button" class="btn sm ghost" data-act="check-del" data-i="${i}" aria-label="이 줄 지우기" ${c.rows.length < 2 ? 'disabled' : ''}>✕</button>
      </div>`).join('')}
    </div>
    <div class="row">
      <button type="button" class="btn sm" data-act="check-add">+ 제품 더하기</button>
      <button type="button" class="btn sm ghost" data-act="check-preset" data-set="server-html5">서버 + HTML5 뷰어</button>
      <button type="button" class="btn sm ghost" data-act="check-preset" data-set="agent">WebLauncher·WebAgent</button>
      <span class="grow"></span>
      <button type="button" class="btn sm ghost" data-act="check-clear">비우기</button>
    </div>
  </form>
  <div id="check-results">${checkResults()}</div>`;
}

export function checkResults() {
  const rows = checkRows();
  if (!rows.length) return '<p class="muted pad">제품을 고르면 결과가 나와요.</p>';
  const res = check(M(), rows, { ozVer: parseVersion(A.check.oz) });
  const s = res.summary;
  const zipFiles = new Set();
  for (const r of res.rows) for (const it of r.items) if (it.status !== 'ok') for (const g of it.guides) if (g.file && M().files[g.file]) zipFiles.add(g.file);
  const text = answerText(M(), res, { format: A.check.format, internal: A.check.internal && can('team'), customer: A.check.customer });
  return `
  <section class="summary">
    <div class="sum s-missing"><b>${s.missing}</b><span>패치 필요</span></div>
    <div class="sum s-unknown"><b>${s.unknown}</b><span>확인 필요</span></div>
    <div class="sum s-ok"><b>${s.ok}</b><span>적용됨</span></div>
  </section>
  <div class="cols wide-left">
    <div class="stack">
      ${res.rows.map(r => `
      <section class="card">
        <header class="card-h"><h2>${chip(r.product.id)} <span class="muted">${r.ver != null ? esc(fmtVer(r.ver, r.product.versionKind)) : '버전 ?'}${r.build ? ' · ' + esc(r.build.text) : ''}</span></h2></header>
        ${r.items.length ? `<ul class="results">${r.items.map(it => resultItem(r, it)).join('')}</ul>` : '<p class="muted">이 제품이 대상인 보안 패치가 없어요.</p>'}
      </section>`).join('')}
      ${res.compat.map(c => `<section class="note-box warn"><b>호환성 · ${esc(c.date || '')}</b><div>${md(c.body)}</div>${c.version ? `<small>버전: ${esc(c.version)}</small>` : ''}</section>`).join('')}
      ${!can('customer') ? '<section class="note-box"><b>다운로드 링크·가이드 문서</b>는 유지보수 고객 인증번호나 컨설팅팀 코드로 <a href="#/login">로그인</a>하면 여기에 함께 나와요.</section>' : ''}
      ${res.latest?.items?.length ? `<section class="note-box"><b>${esc(res.latest.title || '최신 패치 파일')}</b> ${res.latest.items.map(i => extLink(i, { cls: 'btn sm' })).join(' ')} <small class="muted">${esc(res.latest.note || '')}</small></section>` : ''}
    </div>
    <section class="card answer">
      <header class="card-h"><h2>붙여 넣을 답</h2></header>
      <div class="seg" role="group" aria-label="답 모양">
        <button class="seg-b ${A.check.format === 'mail' ? 'on' : ''}" data-act="check-format" data-v="mail">메일</button>
        <button class="seg-b ${A.check.format === 'chat' ? 'on' : ''}" data-act="check-format" data-v="chat">메신저</button>
      </div>
      ${can('team') ? `<label class="chk"><input type="checkbox" data-act="check-internal" ${A.check.internal ? 'checked' : ''}> 사내 링크(대응이력·컨설팅 참고)도 넣기</label>` : ''}
      <textarea id="answer" class="answer-text" readonly rows="16">${esc(text)}</textarea>
      <div class="row">
        <button class="btn primary" data-act="copy-el" data-el="answer">답 복사</button>
        <button class="btn" data-act="copy-check-link">이 확인 주소 복사</button>
        ${zipFiles.size ? `<button class="btn" data-act="zip-files" data-ids="${esc([...zipFiles].join(','))}">가이드 ${zipFiles.size}개 묶어 받기 (zip)</button>` : ''}
      </div>
      <p class="hint">주소에는 고객 이름이 들어가지 않아요. 팀원끼리 같은 확인 화면을 열 때 쓰세요.</p>
    </section>
  </div>`;
}

function resultItem(r, it) {
  const p = it.patch;
  const kind = r.product.versionKind;
  return `<li class="res res-${it.status}">
    <div class="res-h">${statusBadge(it.status)} <a href="#/patch/${esc(p.id)}" class="res-t"><b>${esc(p.code)}</b> ${esc(p.title)}</a></div>
    <div class="res-why">${it.clause ? `규칙 ${esc(fmtRule(it.clause, kind))}` : esc(p.ruleText || '')}${it.reason ? ` — ${esc(it.reason)}` : ''}</div>
    ${it.extras.map(x => `<div class="res-extra">${x.need ? '권장' : '확인'}: ${esc(x.label)} → <b>${esc(x.build)}</b></div>`).join('')}
    ${it.status !== 'ok' && p._locked && can('customer') ? '<div class="res-extra muted">이 인증번호로는 이 제품의 다운로드·가이드를 볼 수 없어요.</div>' : ''}
    ${it.status !== 'ok' ? `
      ${it.downloads?.items?.length || it.downloads?.hub ? `<div class="res-dl"><span class="k">다운로드</span>${(it.downloads.items || []).map(d => extLink(d, { cls: 'btn sm' })).join('')}${it.downloads.hub ? extLink(it.downloads.hub, { cls: 'btn sm ghost' }) : ''}${!it.downloads.items.length && it.downloads.all.length ? '<small class="muted">이 버전용 링크 없음 — <a href="#/patch/' + esc(p.id) + '">전체 보기</a></small>' : ''}</div>` : ''}
      ${it.guides.length ? `<div class="res-files">${it.guides.map(g => fileRow(g.file, `${g.group ? g.group + ' · ' : ''}${g.label}`)).join('')}</div>` : ''}` : ''}
  </li>`;
}

export function rememberCheck() {
  const rows = checkRows();
  if (!rows.length) return;
  const q = encodeRows(rows, parseVersion(A.check.oz));
  const label = rows.map(r => `${prodName(r.product)} ${r.ver != null ? fmtVer(r.ver, M().productById.get(r.product)?.versionKind) : ''}${r.build ? ' ' + r.build.text : ''}`).join(' + ');
  const list = store.get('fz-recent-checks', []).filter(x => x.q !== q);
  list.unshift({ q, label, customer: A.check.customer || '', at: new Date().toISOString() });
  store.set('fz-recent-checks', list.slice(0, 12));
}

// ---------- 패치 목록 · 카드 ----------
export function viewPatches() {
  const m = M();
  const pf = A.pf;
  let list = [...m.patches];
  if (pf.product) list = list.filter(p => p.products?.includes(pf.product));
  return `
  <header class="page-h"><div><p class="eyebrow">보안 패치</p><h1>패치 ${m.patches.length}개</h1></div>
  ${isAdmin() ? '<a class="btn primary" href="#/edit/patches/new">+ 새 패치</a>' : ''}</header>
  <div class="filters"><span class="k">제품</span>
    <button class="fchip ${!pf.product ? 'on' : ''}" data-act="pf" data-v="">전체</button>
    ${m.products.map(p => `<button class="fchip ${pf.product === p.id ? 'on' : ''}" data-act="pf" data-v="${esc(p.id)}">${esc(p.name)}</button>`).join('')}
  </div>
  <div class="pgrid">${list.map(patchCard).join('') || '<p class="muted">이 제품이 대상인 패치가 없어요.</p>'}</div>`;
}

function patchCard(p) {
  const files = (p.guides || []).reduce((n, g) => n + (g.items || []).length, 0);
  return `<a class="pcard" href="#/patch/${esc(p.id)}">
    <div class="pcard-h"><span class="pcode">${esc(p.code)}</span>${p.short ? `<span class="tag">${esc(p.short)}</span>` : ''}${p.checks?.length ? '<span class="tag warn" title="확인 필요 메모가 있어요">확인 필요</span>' : ''}</div>
    <div class="pcard-t">${esc(p.title)}</div>
    <div class="pcard-r"><span class="k">패치 버전</span> ${esc(p.ruleText || '-')}</div>
    <div class="pchips">${(p.products || []).map(id => chip(id, { link: false })).join('')}</div>
    <div class="pcard-f muted">${p.downloads ? `다운로드 ${(p.downloads.items || []).length}` : '다운로드 -'} · 가이드 ${files}${p.noticeDate ? ` · 공지 ${esc(p.noticeDate)}` : ''}</div>
  </a>`;
}

export function viewPatch(id) {
  const m = M();
  const p = m.patchById.get(id);
  if (!p) return notFound('패치');
  const kind = patchKind(p);
  const hist = changesFor(p.id).slice(0, 8);
  const notePages = (p.notePages || []).map(n => m.noteById.get(n)).filter(Boolean);
  const sec = (title, body, cls = '') => (body ? `<section class="psec ${cls}"><h3>${title}</h3>${body}</section>` : '');
  const links = list => (list?.length ? `<ul class="links">${list.map(l => `<li>${extLink(l)}</li>`).join('')}</ul>` : '');
  return `
  <nav class="crumbs"><a href="#/patches">보안 패치</a> › ${esc(p.code)}</nav>
  <article class="card patch">
    <header class="patch-h">
      <div>
        <p class="eyebrow">${esc(p.code)}${p.short ? ` · ${esc(p.short)}` : ''}</p>
        <h1>${esc(p.title)}</h1>
        <p class="muted">${p.noticeUrl ? extLink({ label: `기술공지 ${p.code}`, url: p.noticeUrl }) : ''}${p.noticeDate ? ` · 공지 ${esc(p.noticeDate)}${p.noticeDateGuess ? ' <small title="oztn 공지 번호에서 추정한 날짜">(추정)</small>' : ''}` : ''}</p>
      </div>
      <div class="row">
        <button class="btn sm" data-act="copy-patch" data-id="${esc(p.id)}">요약 복사</button>
        ${isAdmin() ? `<a class="btn sm primary" href="#/edit/patches/${esc(p.id)}">편집</a>` : ''}
      </div>
    </header>
    <div class="pgrid2">
      <div>
        ${sec('📦 대상 제품', `<div class="pchips">${(p.products || []).map(x => chip(x)).join('') || '<span class="muted">없음</span>'}</div>${p.productsText ? `<small class="muted">노션 표기: ${esc(p.productsText)}</small>` : ''}`)}
        ${sec('🏷️ 패치 버전', `<p class="rule">${esc(p.ruleText || '')}</p>
          ${(p.ruleDetails || []).length ? `<ul>${p.ruleDetails.map(d => `<li>${inline(d)}</li>`).join('')}</ul>` : ''}
          ${(p.rules || []).length ? `<table class="mini"><thead><tr><th>버전</th><th>이 빌드부터 적용됨</th></tr></thead><tbody>${p.rules.map(r => `<tr><td>${esc(fmtRange(r, kind))}</td><td><b>${esc(r.build)}</b></td></tr>`).join('')}${(p.extras || []).map(x => `<tr class="extra"><td>${esc(fmtRange(x, kind))}</td><td>${esc(x.build)} <small>(${esc(x.label)})</small></td></tr>`).join('')}</tbody></table>` : '<p class="muted">패치 확인용 규칙이 아직 없어요.</p>'}
          <form class="inline-check" data-form="patch-check" data-patch="${esc(p.id)}"><select name="product">${(p.products || []).map(x => `<option value="${esc(x)}">${esc(prodName(x))}</option>`).join('')}</select><input name="ver" placeholder="버전" aria-label="버전"><input name="build" placeholder="빌드" aria-label="빌드"><button class="btn sm primary">이 패치 확인</button></form>`)}
        ${p._locked ? `<section class="psec"><div class="note-box">${can('customer') ? '이 인증번호로는 이 패치의 다운로드 링크와 가이드 문서를 볼 수 없어요. 다른 제품용이에요.' : '<b>다운로드 링크와 고객 가이드 문서</b>는 유지보수 고객 인증번호나 컨설팅팀 코드로 <a href="#/login">로그인</a>하면 보여요.'}</div></section>` : ''}
        ${p.downloads ? sec('⬇️ 다운로드', `<div class="dl">${(p.downloads.items || []).map(d => `${extLink(d, { cls: 'btn sm' })}`).join('')}${p.downloads.hub ? extLink({ ...p.downloads.hub, label: p.downloads.hub.icon ? '🔗 안내' : p.downloads.hub.label }, { cls: 'btn sm ghost' }) : ''}</div>${p.downloads.note ? `<small class="muted">${esc(p.downloads.note)}</small>` : ''}`) : ''}
        ${(p.guides || []).length ? sec('📄 가이드 문서', `${p.guideNote ? `<p class="muted small">${esc(p.guideNote)}</p>` : ''}${p.guides.map(g => `${g.title ? `<h4>${esc(g.title)} ${(g.products || []).map(x => chip(x, { link: false })).join('')}</h4>` : ''}<div class="files">${(g.items || []).map(it => fileRow(it.file, `${it.label}${it.products?.length ? ' · ' + it.products.map(prodName).join(', ') : ''}`)).join('')}</div>`).join('')}`) : ''}
      </div>
      <div>
        ${sec('📋 대응이력', links(p.history))}
        ${sec('❓ 고객 FAQ', links(p.faq))}
        ${sec('💼 컨설팅 참고사항', `${links(p.notes)}${notePages.map(n => `<details class="notepage" open><summary><a href="#/note/${esc(n.id)}">${esc(n.title)}</a></summary><div class="md">${md(n.body)}</div></details>`).join('')}`)}
        ${(p.checks || []).length ? sec('⚠️ 확인 필요', `<ul>${p.checks.map(c => `<li>${esc(c.text)}${c.source ? ` <small class="muted">— ${esc(c.source)}</small>` : ''}</li>`).join('')}</ul>`, 'warn') : ''}
        ${hist.length ? sec('🕘 이 패치의 변경', `<ul class="clist">${hist.map(changeItem).join('')}</ul>`) : ''}
      </div>
    </div>
  </article>`;
}

export function patchSummaryText(p) {
  const L = [`[${p.code}] ${p.title}`];
  if (p.noticeUrl) L.push(`기술공지: ${p.noticeUrl}`);
  L.push(`대상 제품: ${(p.products || []).map(prodName).join(', ')}`);
  L.push(`패치 버전: ${p.ruleText || ''}`);
  for (const d of p.ruleDetails || []) L.push(`  - ${d}`);
  for (const d of p.downloads?.items || []) L.push(`다운로드 ${d.label}: ${d.url}`);
  const guides = (p.guides || []).flatMap(g => (g.items || []).map(i => `${g.title ? g.title + ' ' : ''}${i.label}: ${M().files[i.file]?.name || ''}`));
  if (guides.length) L.push('가이드 문서:', ...guides.map(g => `  - ${g}`));
  return L.join('\n') + '\n';
}

// ---------- 매트릭스 ----------
export function viewMatrix() {
  const m = M();
  const f = A.mx;
  const patches = m.patches.filter(p => !f.patches.length || f.patches.includes(p.id));
  let prods = m.products.filter(p => !f.prods.length || f.prods.includes(p.id));
  if (f.group) prods = prods.filter(p => p.group === f.group);
  if (f.hitOnly) prods = prods.filter(pr => patches.some(p => p.products?.includes(pr.id)));
  const groups = [...new Set(m.products.map(p => p.group).filter(Boolean))];
  const edit = isAdmin() && f.edit;
  return `
  <header class="page-h"><div><p class="eyebrow">보안 패치 대상 제품</p><h1>제품 × 패치 매트릭스</h1>
  <p class="muted">칸을 누르면 그 패치 카드로 가요. 가로로 밀어 보세요.</p></div>
  ${isAdmin() ? `<button class="btn ${edit ? 'danger' : ''}" data-act="mx-edit">${edit ? '칸 편집 끝내기' : '칸 편집'}</button>` : ''}</header>
  <div class="filters">
    <span class="k">분류</span>
    <button class="fchip ${!f.group ? 'on' : ''}" data-act="mx-group" data-v="">전체</button>
    ${groups.map(g => `<button class="fchip ${f.group === g ? 'on' : ''}" data-act="mx-group" data-v="${esc(g)}">${esc(g)}</button>`).join('')}
    <label class="chk"><input type="checkbox" data-act="mx-hit" ${f.hitOnly ? 'checked' : ''}> O 있는 제품만</label>
  </div>
  <details class="filters-more" ${f.prods.length || f.patches.length ? 'open' : ''}><summary>제품·패치 골라 보기 ${f.prods.length + f.patches.length ? `<span class="badge sm">${f.prods.length + f.patches.length}</span>` : ''}</summary>
    <div class="filters"><span class="k">제품</span>${m.products.map(p => `<button class="fchip ${f.prods.includes(p.id) ? 'on' : ''}" data-act="mx-prod" data-v="${esc(p.id)}">${esc(p.name)}</button>`).join('')}</div>
    <div class="filters"><span class="k">패치</span>${m.patches.map(p => `<button class="fchip ${f.patches.includes(p.id) ? 'on' : ''}" data-act="mx-patch" data-v="${esc(p.id)}">${esc(p.code)}</button>`).join('')}
    ${f.prods.length || f.patches.length ? '<button class="fchip ghost" data-act="mx-reset">모두 보기</button>' : ''}</div>
  </details>
  ${edit ? '<p class="note-box warn">칸 편집 중: 칸을 누르면 O ↔ 빈칸이 바뀌고 "최근 변경"에 남아요. 팀원에게는 게시해야 보여요.</p>' : ''}
  <div class="mx-wrap" tabindex="0" aria-label="매트릭스 표">
    <table class="mx">
      <thead><tr><th class="corner">제품 구분</th>${patches.map(p => `<th scope="col"><a href="#/patch/${esc(p.id)}" title="${esc(p.title)}"><span class="mx-code">${esc(p.code.replace(/^\d{4}_/, ''))}</span><small>${esc(p.short || '')}</small></a></th>`).join('')}<th class="tot" scope="col">계</th></tr></thead>
      <tbody>${prods.map(pr => {
        const n = patches.filter(p => p.products?.includes(pr.id)).length;
        return `<tr class="${n ? '' : 'empty-row'}"><th scope="row"><a href="#/product/${esc(pr.id)}"><i class="gdot g-${groupKey(pr.group)}"></i>${esc(pr.name)}</a></th>${patches.map(p => {
          const hit = p.products?.includes(pr.id);
          const t = `${pr.name} × ${p.code}: ${hit ? '대상' : '대상 아님'}`;
          if (edit) return `<td class="${hit ? 'hit' : ''}"><button class="cellbtn" data-act="cell" data-patch="${esc(p.id)}" data-product="${esc(pr.id)}" title="${esc(t)}" aria-label="${esc(t)}">${hit ? 'O' : '·'}</button></td>`;
          return hit ? `<td class="hit"><a href="#/patch/${esc(p.id)}" title="${esc(t)} — ${esc(p.ruleText || '')}" aria-label="${esc(t)}">O</a></td>` : '<td aria-label="대상 아님"></td>';
        }).join('')}<td class="tot">${n || ''}</td></tr>`;
      }).join('')}</tbody>
      <tfoot><tr><th scope="row">대상 제품 수</th>${patches.map(p => `<td class="tot">${prods.filter(pr => p.products?.includes(pr.id)).length}</td>`).join('')}<td></td></tr></tfoot>
    </table>
  </div>
  <p class="hint">패치 버전 규칙: ${patches.map(p => `<b>${esc(p.code)}</b> ${esc(p.ruleText || '-')}`).join(' · ')}</p>`;
}

// ---------- 제품별 ----------
export function viewProducts() {
  const m = M();
  const groups = new Map();
  for (const p of m.products) {
    const g = p.group || '기타';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(p);
  }
  return `
  <header class="page-h"><div><p class="eyebrow">제품별</p><h1>제품마다 받아야 할 패치</h1></div>${isAdmin() ? '<a class="btn primary" href="#/edit/products/new">+ 새 제품</a>' : ''}</header>
  ${[...groups].map(([g, ps]) => `<h2 class="group-h">${esc(g)}</h2><div class="prgrid">${ps.map(pr => {
    const list = m.patches.filter(p => p.products?.includes(pr.id));
    return `<a class="prcard" href="#/product/${esc(pr.id)}"><b>${esc(pr.name)}</b><span class="muted">${list.length ? list.map(p => esc(p.code.replace(/^\d{4}_/, ''))).join(' · ') : '대상 패치 없음'}</span><span class="n ${list.length ? '' : 'zero'}">${list.length}</span></a>`;
  }).join('')}</div>`).join('')}`;
}

export function viewProduct(id) {
  const m = M();
  const pr = m.productById.get(id);
  if (!pr) return notFound('제품');
  const kind = pr.versionKind || 'oz';
  const list = m.patches.filter(p => p.products?.includes(pr.id));
  const compat = m.compat.filter(c => c.products?.includes(pr.id));
  return `
  <nav class="crumbs"><a href="#/products">제품별</a> › ${esc(pr.name)}</nav>
  <header class="page-h"><div><p class="eyebrow">${esc(pr.group || '')}</p><h1>${esc(pr.name)}</h1>
  ${(pr.aliases || []).length ? `<p class="muted">다른 이름: ${pr.aliases.map(esc).join(', ')}</p>` : ''}</div>
  ${isAdmin() ? `<a class="btn sm primary" href="#/edit/products/${esc(pr.id)}">편집</a>` : ''}</header>
  <form class="card quick inline" data-form="quick-check" autocomplete="off">
    <input type="hidden" name="product" value="${esc(pr.id)}">
    <label class="fld"><span>버전</span><input name="ver" placeholder="${kind === 'agent' ? '10' : '8.0'}" required inputmode="decimal"></label>
    <label class="fld"><span>빌드</span><input name="build" placeholder="2026.0315" inputmode="decimal"></label>
    <button class="btn primary">이 제품 확인</button>
  </form>
  ${(pr.hints || []).map(h => `<div class="note-box"><b>도움말</b> ${esc(h.text)}${h.source ? ` <small class="muted">— ${esc(h.source)}</small>` : ''}</div>`).join('')}
  ${compat.map(c => `<div class="note-box warn"><b>호환성 · ${esc(c.date || '')}</b>${md(c.body)}${c.version ? `<small>버전: ${esc(c.version)}</small>` : ''}</div>`).join('')}
  <section class="card">
    <header class="card-h"><h2>대상 보안 패치 ${list.length}개</h2></header>
    ${list.length ? `<div class="table-wrap"><table class="tbl">
      <thead><tr><th>패치</th><th>패치 버전</th><th>다운로드</th><th>가이드 문서</th></tr></thead>
      <tbody>${list.map(p => {
        const g = pickGuides(p, pr.id, null);
        const d = pickDownloads(p, null);
        return `<tr><td><a href="#/patch/${esc(p.id)}"><b>${esc(p.code)}</b><br>${esc(p.title)}</a></td>
        <td>${esc(p.ruleText || '')}${(p.rules || []).length ? `<br><small class="muted">${p.rules.map(r => esc(fmtRule(r, kind))).join(' / ')}</small>` : ''}</td>
        <td>${d ? (d.items || []).map(x => extLink(x)).join('<br>') : '<span class="muted">-</span>'}</td>
        <td>${g.length ? g.map(x => `<button class="linkbtn" data-act="${/pdf/i.test(m.files[x.file]?.type || '') ? 'view-file' : 'dl-file'}" data-id="${esc(x.file)}">${esc(x.label)}${x.group ? ` <small>(${esc(x.group)})</small>` : ''}</button>`).join('<br>') : '<span class="muted">-</span>'}</td></tr>`;
      }).join('')}</tbody></table></div>` : '<p class="muted">이 제품이 대상인 보안 패치가 없어요.</p>'}
  </section>`;
}

// ---------- 자료 (FAQ · 호환성 · 파일 서명 · 모든 파일) ----------
export function viewDocs() {
  const m = M();
  const used = new Map();
  for (const p of m.patches) for (const g of p.guides || []) for (const it of g.items || []) {
    if (!used.has(it.file)) used.set(it.file, []);
    used.get(it.file).push({ route: `#/patch/${p.id}`, label: p.code });
  }
  for (const r of m.refs) for (const f of r.files || []) {
    if (!used.has(f)) used.set(f, []);
    used.get(f).push({ route: '#/docs', label: r.title });
  }
  const files = Object.entries(m.files).sort((a, b) => (a[1].name || '').localeCompare(b[1].name || ''));
  return `
  <header class="page-h"><div><p class="eyebrow">자료</p><h1>공통 자료 · 호환성 · 파일</h1></div>${isAdmin() ? '<a class="btn sm" href="#/admin#files">파일 관리</a>' : ''}</header>
  <div class="cols">
    ${m.refs.map(r => `<section class="card"><header class="card-h"><h2>${esc(r.title)}</h2>${isAdmin() ? `<a class="more" href="#/edit/refs/${esc(r.id)}">편집</a>` : ''}</header>
      ${r.body ? `<div class="md">${md(r.body)}</div>` : ''}
      <div class="files">${(r.files || []).map(f => fileRow(f)).join('')}</div>
      ${(r.links || []).length ? `<ul class="links">${r.links.map(l => `<li>${extLink(l)}</li>`).join('')}</ul>` : ''}</section>`).join('')}
  </div>
  <section class="card">
    <header class="card-h"><h2>🔄 서버, 뷰어 호환성</h2>${isAdmin() ? '<a class="more" href="#/edit/compat/new">+ 추가</a>' : ''}</header>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>날짜</th><th>내용</th><th>버전</th><th>관련 제품</th></tr></thead>
    <tbody>${m.compat.map(c => `<tr><td><b>${esc(c.date || '')}</b>${isAdmin() ? `<br><a href="#/edit/compat/${esc(c.id)}" class="small">편집</a>` : ''}</td><td>${md(c.body)}${(c.checks || []).map(x => `<div class="note-box warn small">${esc(x.text)} <small class="muted">— ${esc(x.source || '')}</small></div>`).join('')}</td><td>${esc(c.version || '')}</td><td>${(c.products || []).map(x => chip(x)).join('')}</td></tr>`).join('')}</tbody></table></div>
  </section>
  <section class="card">
    <header class="card-h"><h2>모든 파일 ${files.length}개</h2></header>
    <div class="table-wrap"><table class="tbl files-tbl"><thead><tr><th>파일</th><th>크기</th><th>쓰는 곳</th><th></th></tr></thead>
    <tbody>${files.map(([id, f]) => `<tr><td><span class="ftype ${fileIcon(f).toLowerCase()}">${fileIcon(f)}</span> <a href="#/file/${esc(id)}">${esc(f.name)}</a></td><td class="nowrap">${fmtSize(f.size)}${f.pages ? ` · ${f.pages}${fileIcon(f) === 'PPTX' ? '장' : '쪽'}` : ''}</td><td>${(used.get(id) || []).map(u => `<a href="${u.route}">${esc(u.label)}</a>`).join(', ') || '<span class="muted">-</span>'}</td><td class="nowrap">${fileIcon(f) === 'PDF' ? `<button class="btn sm" data-act="view-file" data-id="${esc(id)}">보기</button>` : ''}<button class="btn sm" data-act="dl-file" data-id="${esc(id)}">받기</button></td></tr>`).join('')}</tbody></table></div>
  </section>`;
}

export function viewFile(id) {
  const f = M().files[id];
  if (!f) return notFound('파일');
  const kind = fileIcon(f);
  const where = [];
  for (const p of M().patches) for (const g of p.guides || []) for (const it of g.items || []) if (it.file === id) where.push(`<a href="#/patch/${esc(p.id)}">${esc(p.code)}</a> ${esc(g.title ? g.title + ' · ' : '')}${esc(it.label)}`);
  for (const r of M().refs) if ((r.files || []).includes(id)) where.push(`<a href="#/docs">${esc(r.title)}</a>`);
  return `
  <nav class="crumbs"><a href="#/docs">자료</a> › 파일</nav>
  <section class="card">
    <header class="card-h"><h2><span class="ftype ${kind.toLowerCase()}">${kind}</span> ${esc(f.name)}</h2></header>
    <p class="muted">${fmtSize(f.size)}${f.pages ? ` · ${f.pages}${kind === 'PPTX' ? '장' : '쪽'}` : ''}${f.updatedAt ? ` · 올림 ${esc(fmtWhen(f.updatedAt))} ${esc(f.updatedBy || '')}` : ''}</p>
    <div class="row">${kind === 'PDF' ? `<button class="btn primary" data-act="view-file" data-id="${esc(id)}">화면에서 보기</button>` : '<span class="muted">PPTX 는 내려받아서 열어 주세요.</span>'}<button class="btn" data-act="dl-file" data-id="${esc(id)}">내려받기</button></div>
    ${where.length ? `<h3>쓰는 곳</h3><ul>${where.map(w => `<li>${w}</li>`).join('')}</ul>` : ''}
    ${f.text ? `<details><summary>문서 글자 미리보기 (검색에 쓰임)</summary><pre class="pre-text">${esc(f.text.slice(0, 6000))}${f.text.length > 6000 ? '\n…' : ''}</pre></details>` : ''}
  </section>`;
}

export function viewNote(id) {
  const n = M().noteById.get(id);
  if (!n) return notFound('참고 문서');
  const p = n.patch && M().patchById.get(n.patch);
  return `
  <nav class="crumbs">${p ? `<a href="#/patch/${esc(p.id)}">${esc(p.code)}</a> › ` : ''}참고 문서</nav>
  <article class="card"><header class="card-h"><h2>${esc(n.title)}</h2>${isAdmin() ? `<a class="btn sm primary" href="#/edit/notes/${esc(n.id)}">편집</a>` : ''}</header>
  <div class="md">${md(n.body)}</div></article>`;
}

// ---------- 검색 ----------
export function viewSearch(q) {
  const res = q ? search(A.docs, q) : [];
  return `
  <header class="page-h"><div><p class="eyebrow">검색</p><h1>패치·FAQ·참고·가이드 문서 전체에서 찾기</h1></div></header>
  <form class="searchbar" data-form="search" role="search"><input name="q" value="${esc(q)}" placeholder="예: whitelist, 버전 확인, 설정 파일 이름" aria-label="검색어" autofocus><button class="btn primary">찾기</button></form>
  ${q ? `<p class="muted">"${esc(q)}" — ${res.length}개</p>` : '<p class="muted">PDF·PPTX 가이드 문서 안의 글자까지 찾아요. 단어 여러 개는 모두 들어간 것만.</p>'}
  <ul class="sres">${res.map(r => `<li><a href="${r.doc.route}"><span class="tag">${esc(r.doc.type)}</span> <b>${esc(r.doc.title)}</b></a>
    <p class="snip">${esc(r.snippet[0])}<mark>${esc(r.snippet[1])}</mark>${esc(r.snippet[2])}</p>
    ${r.doc.file ? `<div class="row">${/pdf/i.test(M().files[r.doc.file]?.type || '') ? `<button class="btn sm" data-act="view-file" data-id="${esc(r.doc.file)}">보기</button>` : ''}<button class="btn sm" data-act="dl-file" data-id="${esc(r.doc.file)}">받기</button></div>` : ''}</li>`).join('')}</ul>`;
}

// ---------- 최근 변경 ----------
export function viewChanges() {
  const groups = new Map();
  for (const c of M().changes) {
    const d = (c.at || '').slice(0, 10);
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d).push(c);
  }
  return `
  <header class="page-h"><div><p class="eyebrow">최근 변경</p><h1>무엇이 언제 누구에 의해 바뀌었나</h1>
  <p class="muted">${M().publishedAt ? `마지막 게시: ${esc(fmtWhen(M().publishedAt))} ${esc(M().publishedBy || '')}` : ''}</p></div></header>
  ${[...groups].map(([d, list]) => `<section class="card"><header class="card-h"><h2>${esc(d)}</h2></header><ul class="clist">${list.map(changeItem).join('')}</ul></section>`).join('') || '<p class="muted">아직 변경 기록이 없어요.</p>'}`;
}

// ---------- 링크 점검 ----------
export function viewLinks() {
  const all = allLinks(M());
  const byUrl = new Map();
  for (const l of all) {
    if (!byUrl.has(l.url)) byUrl.set(l.url, { url: l.url, labels: new Set(), where: [] });
    const e = byUrl.get(l.url);
    if (!l.icon) e.labels.add(l.label);
    e.where.push(l);
  }
  const rows = [...byUrl.values()].map(e => ({ ...e, kind: linkKind(e.url), health: healthOf(e.url) }));
  const order = { bad: 0, warn: 1, unknown: 2, internal: 3, ok: 4 };
  rows.sort((a, b) => order[a.health.cls] - order[b.health.cls] || a.url.localeCompare(b.url));
  const cnt = k => rows.filter(r => r.health.cls === k).length;
  const probeable = rows.filter(r => r.kind.probe).length;
  return `
  <header class="page-h"><div><p class="eyebrow">링크 점검</p><h1>바깥 링크 ${rows.length}개 (${all.length}곳에서 씀)</h1>
  <p class="muted">이 기기에서 점검: oztn·Google 문서 주소가 응답하는지만 봐요(로그인·권한·404 는 알 수 없음). 사내망(oz4cs.com)과 http 주소는 점검하지 않아요. ${isAdmin() ? '관리자가 직접 열어 보고 "정상/깨짐"을 표시하면 팀원 모두에게 보여요.' : ''}</p></div>
  <button class="btn primary" data-act="probe-links">이 기기에서 점검 (${probeable})</button></header>
  <section class="summary small">
    <div class="sum s-missing"><b>${cnt('bad')}</b><span>깨짐</span></div>
    <div class="sum s-unknown"><b>${cnt('unknown') + cnt('warn')}</b><span>점검 안 함·주의</span></div>
    <div class="sum"><b>${cnt('internal')}</b><span>사내망</span></div>
    <div class="sum s-ok"><b>${cnt('ok')}</b><span>정상</span></div>
  </section>
  <div class="table-wrap"><table class="tbl links-tbl">
    <thead><tr><th>상태</th><th>링크</th><th>쓰는 곳</th>${isAdmin() ? '<th>표시</th>' : ''}</tr></thead>
    <tbody>${rows.map(r => `<tr>
      <td class="nowrap"><i class="dot ${r.health.cls}"></i> ${esc(r.health.text)}<br><small class="muted">${esc(r.kind.label)}</small></td>
      <td><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc([...r.labels][0] || r.url)}</a><br><small class="muted url">${esc(r.url)}</small>${M().links?.[r.url]?.note ? `<br><small>${esc(M().links[r.url].note)}</small>` : ''}</td>
      <td>${r.where.map(w => `<a href="${w.route}">${esc(w.where)} ${esc(w.section)}</a>`).join('<br>')}${r.where.length > 1 ? `<br><small class="muted">${r.where.length}곳에서 같은 주소</small>` : ''}</td>
      ${isAdmin() ? `<td class="nowrap"><button class="btn sm" data-act="mark-link" data-url="${esc(r.url)}" data-ok="1">정상</button><button class="btn sm ghost" data-act="mark-link" data-url="${esc(r.url)}" data-ok="0">깨짐</button></td>` : ''}
    </tr>`).join('')}</tbody></table></div>`;
}

export function notFound(what) {
  return `<div class="empty"><h2>${esc(what)}을(를) 찾을 수 없어요</h2><p class="muted">지워졌거나 주소가 바뀌었을 수 있어요.</p><a class="btn" href="#/">홈으로</a></div>`;
}

export { inRange };
