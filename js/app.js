// 화면 틀 · 길(라우팅) · 누름/입력 처리. env 를 받아서 시작한다 (main.js = 실제 GitHub, dev/dev.js = 가짜)
//   env = { core, access(core/access.js), site(createSite), read(n, path), filesOpts }
// 첫 화면은 공개(기술공지). «로그인» 한 화면에서 넣은 값으로 역할이 정해지고, 그 역할의 메뉴가 열린다.

import { A, can } from './state.js';
import * as V from './views.js';
import * as AV from './adminviews.js';
import { esc } from './md.js';
import { buildModel, sourceFromCore, searchDocs, allLinks, linkKind } from './model.js';
import { parseVersion, parseBuild, parseFull, parseRuleText, check, encodeRows, decodeRows, fmtVer, STATUS } from './rules.js';
import { weakReasons } from './tier.js';
import { createPublisher, previewAs, roleLabel, parseCustomerCsv, viewRoleOf, importCustomers } from './tiers.js';
import { createAdmin } from './admin.js';
import { readEntry } from './files.js';
import { openViewer, closeViewer } from './pdfview.js';
import { jszip } from './textract.js';
import { $, $$, toast, modal, confirmBox, download, copyText, readForm, store, fmtWhen } from './ui.js';

const ICON = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  check: '<path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/>',
  matrix: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  patch: '<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/>',
  product: '<rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1"/>',
  docs: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>',
  changes: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  links: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  admin: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  theme: '<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/>',
};
const icon = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// [길, 이름, 그림, 볼 수 있는 가장 낮은 역할]
const NAV_ALL = [
  ['', '기술공지', 'home', 'public'], ['check', '패치 확인', 'check', 'public'], ['matrix', '매트릭스', 'matrix', 'public'], ['patches', '보안 패치', 'patch', 'public'],
  ['products', '제품별', 'product', 'public'], ['docs', '자료', 'docs', 'customer'], ['changes', '최근 변경', 'changes', 'team'], ['links', '링크 점검', 'links', 'team'], ['search', '검색', 'search', 'public'],
];
const navFor = () => NAV_ALL.filter(n => can(n[3]));
const TABS = ['', 'check', 'matrix', 'patches'];

export async function startApp(env) {
  A.env = env;
  A.lastSeen = store.get('fz-last-seen', '');
  A.health = store.get('fz-health', {});
  A.render = render;
  applyTheme();
  bindGlobal();
  window.addEventListener('hashchange', () => { closeViewer(); route(); });
  await boot();
  return { A, render, enterAdmin, enterSite, doLogin, logout };
}

// ---------- 시작 ----------
// 첫 화면은 공개(기술공지). 기억해 둔 로그인이 있으면(access.resume) 그 역할로 연다
//   공개 화면은 이 기기 저장소(IndexedDB: core.ready·기억한 로그인)를 기다리지 않고 먼저 그린다 — IndexedDB 가 느리거나 막힌
//   브라우저에서도 «여는 중…» 에 머물지 않는다. 공개 항목을 1.5초 안에 못 받으면 «준비 중» 공개 화면부터, 받으면 아래에서 다시 그린다.
//   처음 설정 전(keyring.json·공개 항목 없음 → 404)이면 공개 화면에 관리자용 «처음 설정»
async function boot() {
  const { core, site, access } = A.env;
  A.mode = 'loading';
  let pubDone = false;
  const pub = site.loadPublic().then(r => { pubDone = true; return r; }, e => { console.warn(e); return null; });
  const first = await Promise.race([pub, sleep(1500).then(() => 'late')]);
  let shown = null; // 먼저 그린 공개 화면 { mode, sig }
  if (A.mode === 'loading') {
    if (first === 'ok') { A.role = 'public'; enterSite({ go: false }); } else { A.mode = 'none'; A.role = 'public'; route(); }
    shown = { mode: A.mode, sig: site.sig };
  }
  await Promise.race([pub, sleep(10000)]);
  await core.ready;
  if (access.me()) return; // 그사이 로그인했다 (doLogin 이 화면을 맡는다)
  let r;
  try {
    r = await site.load({ skipPublic: pubDone });
  } catch (e) {
    A.mode = 'none';
    A.loginError = e.message;
    return route();
  }
  const info = site.info;
  if (info?.canWrite) {
    try { return await enterWrite(info, { go: false }); } catch (e) { console.warn(e); toast(e.message, 'error'); }
  }
  // 기억한 로그인이 없고 먼저 그린 공개 화면 그대로면 다시 그리지 않는다 (로그인 화면에 넣고 있던 글자를 지우지 않게)
  if (!info && shown && shown.sig === site.sig && shown.mode === A.mode && A.mode === (r === 'none' ? 'none' : 'site')) return;
  if (r === 'none' && !info) { A.mode = 'none'; A.role = 'public'; return route(); }
  return enterSite({ go: false });
}

function setModel(src) {
  A.model = buildModel(src);
  A.docs = searchDocs(A.model);
}

let siteTimer = 0;
function enterSite({ go = true } = {}) {
  const info = A.env.site.info;
  A.mode = 'site';
  A.role = viewRoleOf(info?.role);
  A.me = info ? { id: info.pid, name: info.name } : null;
  rebuildSiteModel();
  firstSeen();
  clearInterval(siteTimer);
  siteTimer = setInterval(refreshSite, 5 * 60e3);
  if ((go || /^#\/(admin|edit|login)/.test(location.hash)) && location.hash !== '#/' && location.hash !== '') { location.hash = '#/'; return; }
  route();
}

function rebuildSiteModel() {
  const src = A.env.site.source();
  setModel(A.preview ? previewAs(src, A.preview) : src);
}

async function refreshSite() {
  if (A.mode !== 'site' || document.hidden) return;
  try {
    if (await A.env.site.refresh()) {
      A.role = viewRoleOf(A.env.site.info?.role);
      rebuildSiteModel();
      toast('새 내용이 게시되어 바꿔 보여 드려요.');
      if (!isEditing()) route();
    }
  } catch (e) {
    if (e.code === 'revoked') { A.role = 'public'; A.me = null; await A.env.site.refresh().catch(() => {}); rebuildSiteModel(); toast(e.message, 'error'); route(); }
  }
}

// 쓰기 역할: 관리자는 꾸러미의 데이터 열쇠로(access.openAdmin), 작성자는 writer 등급 항목의 데이터 열쇠로 core 를 연다
async function enterWrite(info, { go = true } = {}) {
  const { core, access, site } = A.env;
  A.adm = null;
  if (info.isAdmin) {
    A.adm = await access.openAdmin(core);
  } else if (!core.status().open) {
    const v = site.opened['writer/vault']?.vault;
    if (!v) throw new Error('작성자용 데이터 열쇠가 아직 게시되지 않았어요. 관리자에게 "게시"를 한 번 부탁해 주세요.');
    await core.openWithKey(v);
  }
  if (info.name && core.status().user !== info.name) await core.setUser(info.name);
  return enterAdmin(info.isAdmin ? 'admin' : 'writer', { go });
}

let offChange = null;
let offStatus = null;
function enterAdmin(role = 'admin', { go = true } = {}) {
  const { core, access } = A.env;
  const info = access.me();
  A.mode = 'admin';
  A.role = role === 'writer' ? 'writer' : 'admin';
  A.me = info ? { id: info.pid, name: info.name } : null;
  A.preview = '';
  A.admin = createAdmin({ core, files: A.env.filesOpts || {} });
  A.pub = createPublisher({ core, access });
  rebuildAdminModel();
  firstSeen();
  offChange?.();
  offStatus?.();
  let t = 0;
  offChange = core.onChange(() => { clearTimeout(t); t = setTimeout(() => { if (A.mode !== 'admin' || !core.status().open) return; rebuildAdminModel(); if (!isEditing()) route(); else updateChrome(); }, 150); });
  offStatus = core.onStatus(() => updateChrome());
  if (go && !/^#\/(admin|edit)/.test(location.hash)) { location.hash = '#/admin'; return; }
  route();
}

function rebuildAdminModel() {
  const src = sourceFromCore(A.env.core);
  setModel(A.preview ? previewAs(src, A.preview) : src);
  A.pub?.state().then(s => { A.dirty = s.dirty; updateChrome(); }).catch(() => {});
}
const rebuildModel = () => (A.mode === 'admin' ? rebuildAdminModel() : rebuildSiteModel());

// 로그인 하나: 아이디 + 코드 → 역할은 자리(slot)가 정한다 (access.login = authProvider)
async function doLogin(identifier, secret, { remember = true } = {}) {
  const info = await A.env.site.login(String(identifier || '').trim(), secret, { remember });
  A.preview = '';
  if (info.canWrite) return enterWrite(info);
  toast(`${info.roleName}(으)로 로그인했어요.`);
  return enterSite();
}

async function logout() {
  const { core, site } = A.env;
  offChange?.(); offStatus?.(); offChange = null; offStatus = null;
  A.mode = 'loading';
  if (core.status().open) { await core.lock(); }
  await core.forgetSession();
  await site.logout();
  A.admin = null; A.pub = null; A.adm = null; A.edit = null;
  A.preview = '';
  A.me = null;
  A.blobs.clear();
  toast('로그아웃했어요. 이 기기에 기억한 열쇠는 지웠어요.');
  history.replaceState(null, '', `${location.pathname}#/`);
  await boot();
}

// 처음 보는 기기: 지금까지의 변경은 "새"로 치지 않는다
function firstSeen() {
  if (A.lastSeen || !can('team')) return;
  A.lastSeen = A.model.changes[0]?.at || new Date().toISOString();
  store.set('fz-last-seen', A.lastSeen);
}

const isEditing = () => /^#\/edit\//.test(location.hash) || !!document.activeElement?.closest?.('form[data-form="check"], form[data-form="import"], form[data-form="import-customers"], form[data-form="add-person"]');

// ---------- 길 ----------
function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [pathq, anchor = ''] = h.split('#');
  const [path, query = ''] = pathq.split('?');
  return { parts: path.split('/').filter(Boolean), query, anchor };
}

function route() {
  const { parts } = parseHash();
  if (parts[0] === 'login' || parts[0] === 'admin-connect') return renderLogin(parts);
  render();
}

function renderLogin(parts) {
  const app = $('#app');
  document.body.dataset.shell = '';
  if (parts[0] === 'admin-connect') {
    if (A.mode === 'admin') { location.hash = '#/admin'; return; }
    app.innerHTML = AV.viewAdminConnect({ error: A.connectError || '', tab: parts[1] || '' });
    A.connectError = '';
    document.title = '관리자 기기 연결 — OZ 보안 패치';
    return;
  }
  if (A.mode === 'admin') { location.hash = '#/admin'; return; }
  app.innerHTML = AV.viewLogin({ error: A.loginError || '', none: A.mode === 'none' });
  A.loginError = '';
  document.title = '로그인 — OZ 보안 패치';
  $('input[name="secret"]', app)?.focus();
}

function render() {
  const app = $('#app');
  document.body.dataset.mode = A.mode;
  if (A.mode === 'loading') { app.innerHTML = '<div class="lock"><p class="muted">여는 중…</p></div>'; return; }
  if (A.mode === 'none') {
    document.body.dataset.shell = '';
    // 아직 게시된 것이 없을 때(처음 설정 전 포함)의 공개 화면: 이름 · 짧은 소개 · «로그인» · (처음 설정 전이면) 관리자용 «처음 설정»
    app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#/"><img src="assets/icon.svg" alt=""><span><b>OZ 보안 패치</b><small>FORCS 컨설팅 · 기술공지</small></span></a>
    <div class="top-right"><a class="btn sm primary" href="#/login">로그인</a></div>
  </header>
  <main id="view" class="view pub-empty" tabindex="-1">
    <section class="login-cta"><div><b>OZ 보안 패치 기술공지</b><span class="muted">누구나 볼 수 있는 공지예요. 유지보수 고객은 인증번호로, 컨설팅팀은 이메일과 코드로 로그인하면 다운로드 링크와 가이드 문서가 열려요.</span></div><a class="btn primary" href="#/login">로그인</a></section>
    <section class="card"><header class="card-h"><h2>준비 중이에요</h2></header>
      <p class="note-box">아직 게시된 기술공지가 없어요. 관리자가 자료를 넣고 게시하면, 이곳에서 제품 · 버전 · 빌드를 넣고 필요한 보안 패치를 바로 확인할 수 있어요.</p>
      ${A.loginError ? `<p class="err">${esc(A.loginError)}</p>` : ''}</section>
    ${A.env.site.preSetup ? '<p class="muted small setup-hint">관리자이신가요? 사이트를 아직 처음 설정하지 않았어요. <a class="btn sm ghost" href="#/admin-connect/setup">처음 설정</a></p>' : ''}
  </main>`;
    document.title = 'OZ 보안 패치';
    return;
  }
  const key = `${A.mode}|${A.role}|${A.preview}`;
  if (!$('#view') || document.body.dataset.shell !== key) { app.innerHTML = shell(); document.body.dataset.shell = key; }
  renderView();
}

function shell() {
  const admin = A.mode === 'admin';
  const loggedIn = A.role !== 'public';
  const nav = navFor();
  const tabs = nav.filter(n => TABS.includes(n[0]));
  return `
  <a class="skip" href="#view">본문으로</a>
  ${A.preview ? `<div class="preview-bar">${admin ? '미리 보기' : '보는 중'}: <b>${esc(roleLabel(A.preview))}</b> 화면 <button class="btn sm" data-act="preview" data-v="">${admin ? '미리 보기 끝' : '내 화면으로'}</button></div>` : ''}
  <header class="topbar">
    <a class="brand" href="#/"><img src="assets/icon.svg" alt=""><span><b>OZ 보안 패치</b><small>${loggedIn ? esc(roleLabel(A.role)) : '기술공지'}</small></span></a>
    <form class="topsearch" data-form="search" role="search"><input name="q" placeholder="검색 (/ 누르기)" aria-label="검색"></form>
    <div class="top-right">
      <span id="chrome-status"></span>
      <button class="iconbtn" data-act="theme" title="밝게/어둡게" aria-label="밝게/어둡게">${icon('theme')}</button>
      ${loggedIn ? `<a class="who hide-sm" href="#/account" title="내 계정">${esc(A.me?.name || roleLabel(A.role))}</a><button class="btn sm ghost" data-act="logout">로그아웃</button>` : '<a class="btn sm primary" href="#/login">로그인</a>'}
    </div>
  </header>
  <div class="layout">
    <nav class="side" aria-label="메뉴">
      ${nav.map(([r, t, i]) => `<a href="#/${r}" data-nav="${r}">${icon(i)}<span>${t}</span>${r === 'changes' ? '<span class="nbadge" id="nav-new"></span>' : ''}</a>`).join('')}
      ${admin ? `<a href="#/admin" data-nav="admin" class="admin-link">${icon('admin')}<span>관리</span><span class="nbadge" id="nav-dirty"></span></a>` : ''}
      ${loggedIn && !A.preview ? '<button class="linkbtn side-public" data-act="preview" data-v="public">공개 화면으로 보기</button>' : ''}
      <div class="side-foot" id="side-foot"></div>
    </nav>
    <main id="view" class="view" tabindex="-1"></main>
  </div>
  <nav class="tabbar" aria-label="메뉴">
    ${tabs.map(n => `<a href="#/${n[0]}" data-nav="${n[0]}">${icon(n[2])}<span>${n[1].replace('보안 ', '')}</span></a>`).join('')}
    <button data-act="more">${icon('more')}<span>더보기</span><span class="nbadge" id="tab-new"></span></button>
  </nav>`;
}

function needLogin(role) {
  return `<div class="empty"><h2>${esc(roleLabel(role))} 이상만 볼 수 있어요</h2><p class="muted">${role === 'customer' ? '유지보수 고객 인증번호나 컨설팅팀 코드로' : '컨설팅팀 이메일과 코드로'} 로그인해 주세요.</p>${A.role === 'public' ? '<a class="btn primary" href="#/login">로그인</a>' : '<a class="btn" href="#/">기술공지로</a>'}</div>`;
}

function renderView() {
  const { parts, query, anchor } = parseHash();
  const v = $('#view');
  const admin = A.mode === 'admin';
  const p0 = parts[0] || '';
  let html;
  let title = '';
  try {
    const navItem = NAV_ALL.find(n => n[0] === p0);
    if (navItem && !can(navItem[3])) html = needLogin(navItem[3]);
    else if ((p0 === 'file' || p0 === 'note') && !can(p0 === 'note' ? 'team' : 'customer')) html = needLogin(p0 === 'note' ? 'team' : 'customer');
    else if (p0 === '') { html = V.viewHome(); }
    else if (p0 === 'check') { syncCheckFromQuery(query); html = V.viewCheck(); title = '패치 확인'; }
    else if (p0 === 'patches') { html = V.viewPatches(); title = '보안 패치'; }
    else if (p0 === 'patch') { html = V.viewPatch(decodeURIComponent(parts[1] || '')); title = parts[1]; }
    else if (p0 === 'matrix') { html = V.viewMatrix(); title = '매트릭스'; }
    else if (p0 === 'products') { html = V.viewProducts(); title = '제품별'; }
    else if (p0 === 'product') { html = V.viewProduct(decodeURIComponent(parts[1] || '')); title = A.model.productById.get(parts[1])?.name; }
    else if (p0 === 'docs') { html = V.viewDocs(); title = '자료'; }
    else if (p0 === 'file') { html = V.viewFile(decodeURIComponent(parts[1] || '')); title = '파일'; }
    else if (p0 === 'note') { html = V.viewNote(decodeURIComponent(parts[1] || '')); title = '참고 문서'; }
    else if (p0 === 'search') { html = V.viewSearch(new URLSearchParams(query).get('q') || ''); title = '검색'; }
    else if (p0 === 'changes') { html = V.viewChanges(); title = '최근 변경'; }
    else if (p0 === 'links') { html = V.viewLinks(); title = '링크 점검'; }
    else if (p0 === 'account') { html = AV.viewAccount(); title = '내 계정'; }
    else if (p0 === 'admin' && admin) { html = AV.viewAdmin(); title = '관리'; }
    else if (p0 === 'edit' && admin) { startEdit(parts[1], decodeURIComponent(parts[2] || 'new')); html = AV.viewEditor(); title = '편집'; }
    else if (p0 === 'admin' || p0 === 'edit') html = needLogin('writer');
    else html = V.notFound('화면');
  } catch (e) {
    console.error(e);
    html = `<div class="empty"><h2>화면을 그리지 못했어요</h2><p class="err">${esc(e.message)}</p></div>`;
  }
  v.innerHTML = html;
  document.title = `${title ? title + ' — ' : ''}OZ 보안 패치`;
  for (const el of $$('[data-w]', v)) el.style.width = `${el.dataset.w}%`;
  updateChrome();
  if (p0 === 'changes' && can('team')) markSeen();
  if (p0 === 'admin' && admin) AV.hydrateAdmin();
  if (anchor) document.getElementById(anchor)?.scrollIntoView({ block: 'start' });
  else window.scrollTo(0, 0);
}

function updateChrome() {
  const p0 = parseHash().parts[0] || '';
  for (const a of $$('[data-nav]')) {
    const r = a.dataset.nav;
    const on = r === p0 || (r === 'patches' && p0 === 'patch') || (r === 'products' && p0 === 'product') || (r === 'docs' && (p0 === 'file' || p0 === 'note')) || (r === 'admin' && p0 === 'edit');
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  const n = A.model && can('team') ? V.newCount() : 0;
  for (const id of ['nav-new', 'tab-new']) { const b = document.getElementById(id); if (b) { b.textContent = n ? String(n) : ''; b.hidden = !n; } }
  const d = document.getElementById('nav-dirty');
  if (d) { d.textContent = A.dirty ? '게시 전' : ''; d.hidden = !A.dirty; }
  const cs = document.getElementById('chrome-status');
  if (cs) {
    if (A.mode === 'admin') {
      const s = A.env.core.status();
      cs.innerHTML = `<a class="chipstat s-${esc(s.state)}" href="#/admin" title="${esc(s.error || '')}">${esc(AV.stateText(s.state))}</a>${A.dirty ? ' <a class="chipstat warn" href="#/admin#publish">게시 안 됨</a>' : ''}`;
    } else {
      cs.innerHTML = A.env.site.offline ? '<span class="chipstat warn">오프라인 (마지막 내용)</span>' : '';
    }
  }
  const f = document.getElementById('side-foot');
  if (f && A.model) f.innerHTML = A.model.publishedAt ? `게시 ${esc(fmtWhen(A.model.publishedAt))}${A.model.publishedBy ? `<br>${esc(A.model.publishedBy)}` : ''}` : '';
}

function markSeen() {
  const top = A.model.changes[0]?.at;
  if (top && top > (A.lastSeen || '')) {
    store.set('fz-last-seen', top);
    setTimeout(() => { A.lastSeen = top; updateChrome(); }, 0);
  }
}

// ---------- 패치 확인 상태 ----------
let lastCheckQuery = '';
function syncCheckFromQuery(query) {
  if (!query || query === lastCheckQuery) return;
  lastCheckQuery = query;
  const { rows, ozVer } = decodeRows(query);
  if (!rows.length) return;
  A.check.rows = rows.map(r => ({ product: r.product, ver: r.ver != null ? fmtVer(r.ver, A.model.productById.get(r.product)?.versionKind) : '', build: r.build?.text || '' }));
  A.check.oz = ozVer != null ? fmtVer(ozVer) : '';
}

function checkQuery() {
  const rows = A.check.rows.map(r => ({ product: r.product, ver: parseVersion(r.ver), build: parseBuild(r.build) })).filter(r => r.product);
  return encodeRows(rows, parseVersion(A.check.oz));
}

let rememberT = 0;
function updateCheckResults() {
  const box = $('#check-results');
  if (box) box.innerHTML = V.checkResults();
  const q = checkQuery();
  lastCheckQuery = q;
  history.replaceState(null, '', `#/check?${q}`);
  clearTimeout(rememberT);
  rememberT = setTimeout(V.rememberCheck, 1500);
}

function setBind(path, value) {
  const keys = path.split('.');
  let o = A.check;
  keys.slice(0, -1).forEach(k => { o = o[k]; });
  o[keys[keys.length - 1]] = value;
}

// ---------- 파일 ----------
async function getBlob(id) {
  if (A.blobs.has(id)) return A.blobs.get(id);
  const e = A.model.files[id];
  if (!e) throw new Error('이 파일을 볼 권한이 없거나 파일을 찾을 수 없어요.');
  toast(`받는 중… ${e.name}`);
  const b = await readEntry(id, e, A.env.read);
  A.blobs.set(id, b);
  return b;
}

async function openFile(id, { dl = false } = {}) {
  try {
    const f = A.model.files[id];
    const b = await getBlob(id);
    if (!dl && /pdf/i.test(f.type || '')) await openViewer(b, f.name);
    else download(b, f.name);
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function zipFiles(ids) {
  const JSZip = await jszip();
  const z = new JSZip();
  for (const id of ids) {
    const f = A.model.files[id];
    if (f) z.file(f.name, await getBlob(id));
  }
  const out = await z.generateAsync({ type: 'blob' });
  download(out, `OZ_보안패치_가이드_${new Date().toISOString().slice(0, 10)}.zip`);
}

// ---------- 링크 점검 (이 기기) ----------
async function probeLinks() {
  const urls = [...new Set(allLinks(A.model).map(l => l.url))].filter(u => linkKind(u).probe);
  toast(`링크 ${urls.length}개 점검 중…`);
  let i = 0;
  const work = async () => {
    while (i < urls.length) {
      const u = urls[i++];
      let ok = false;
      try {
        await fetch(u, { mode: 'no-cors', cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(10000) });
        ok = true;
      } catch {}
      A.health[u] = { ok, at: new Date().toISOString() };
    }
  };
  await Promise.all([work(), work(), work(), work()]);
  store.set('fz-health', A.health);
  const bad = urls.filter(u => !A.health[u].ok).length;
  toast(bad ? `${bad}개가 응답하지 않아요` : '모두 응답했어요', bad ? 'error' : '');
  renderView();
}

// ---------- 사람·권한 ----------
async function showInvite({ person, code, invitation, weak, bits }) {
  await modal(`<div class="dlg"><h2>${esc(person.name)} — ${esc(person.roleLabel)}</h2>
    ${code ? `<p>아이디: <b>${esc(person.identifier)}</b> · 코드: <b class="code-big inline">${esc(code)}</b></p>` : ''}
    ${weak ? `<p class="err">약한 번호예요 (약 ${bits}비트).</p>` : ''}
    <p class="muted">아래 글을 <b>${esc(person.identifier)}</b> 로 보내 주세요. 이 창을 닫으면 코드를 다시 볼 수 없어요 (잃으면 "새 코드").</p>
    <textarea id="invite-text" class="answer-text" rows="10" readonly>${esc(invitation || '')}</textarea>
    <div class="row end"><button class="btn" data-act="copy-el" data-el="invite-text">초대 글 복사</button><button class="btn primary" data-close="ok">보냈어요</button></div></div>`, { wide: true });
}

async function publishNow(msg) {
  const r = await A.pub.publish();
  rebuildAdminModel();
  toast(msg || (r.changed ? '게시했어요. 1~2분 안에 모두에게 보여요.' : '바뀐 것이 없어요.'));
  return r;
}

// ---------- 편집 ----------
const ARRAYS = {
  patches: ['products', 'rules', 'extras', 'ruleDetails', 'guides', 'history', 'faq', 'notes', 'notePages', 'checks', 'downloads.items'],
  products: ['hints', 'aliases'], notes: [], compat: ['products', 'checks'], refs: ['files', 'links'], settings: ['latest.items'],
};
const TEMPLATES = {
  rules: () => ({ min: 80, max: null, build: '' }),
  extras: () => ({ label: '', build: '', min: null, max: null }),
  'downloads.items': () => ({ label: '', url: '', ver: null }),
  'latest.items': () => ({ label: '', url: '', ver: null }),
  guides: () => ({ title: '', products: [], items: [] }),
  history: () => ({ label: '', url: '' }), faq: () => ({ label: '', url: '' }), notes: () => ({ label: '', url: '' }), links: () => ({ label: '', url: '', note: '' }),
  checks: () => ({ text: '', source: '' }), hints: () => ({ text: '', source: '' }),
};
const tmplFor = path => (TEMPLATES[path] || (/^guides\.\d+\.items$/.test(path) ? () => ({ label: '', file: '', ver: null }) : () => ({})))();
const getPath = (o, path) => path.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
function setPath(o, path, v) {
  const ks = path.split('.');
  let x = o;
  ks.slice(0, -1).forEach((k, i) => { if (x[k] == null) x[k] = /^\d+$/.test(ks[i + 1]) ? [] : {}; x = x[k]; });
  x[ks[ks.length - 1]] = v;
}
const clone = o => JSON.parse(JSON.stringify(o));

function startEdit(col, id) {
  if (!AV.NEW[col] && col !== 'settings') throw new Error('알 수 없는 편집기예요.');
  if (A.edit && A.edit.col === col && A.edit.id === id) return;
  const { core } = A.env;
  let rec = id !== 'new' ? core.collection(col).get(id) : null;
  if (col === 'settings') rec = core.collection('settings').get(id) || { id, latest: { title: '최신 패치 파일', hub: null, items: [], note: '' } };
  if (id !== 'new' && !rec) throw new Error('찾을 수 없어요.');
  const back = col === 'patches' && id !== 'new' ? `#/patch/${id}` : col === 'products' && id !== 'new' ? `#/product/${id}` : col === 'notes' && id !== 'new' ? `#/note/${id}` : col === 'settings' ? '#/' : col === 'compat' || col === 'refs' ? '#/docs' : '#/admin#edit';
  A.edit = { col, id, isNew: id === 'new', draft: rec ? clone(rec) : AV.NEW[col](), back };
}

function serializeEditor() {
  const form = $('form[data-form="editor"]');
  const e = A.edit;
  const obj = readForm(form, { parseVer: parseVersion });
  for (const p of ARRAYS[e.col] || []) if (getPath(obj, p) == null) setPath(obj, p, []);
  if (e.col === 'patches') for (const g of obj.guides || []) { g.items = g.items || []; g.products = g.products || []; }
  const next = { ...e.draft };
  for (const k of Object.keys(obj)) next[k] = obj[k];
  e.draft = next;
  return next;
}

function cleanDraft(col, d) {
  const link = l => (l && (l.url || l.label) ? { label: l.label || '', url: (l.url || '').trim(), ...(l.icon ? { icon: true } : {}), ...(l.note ? { note: l.note } : {}) } : null);
  const ver = v => (v && (v.min != null || v.max != null) ? { min: v.min ?? null, max: v.max ?? null } : null);
  const out = clone(d);
  if (col === 'patches') {
    out.code = String(out.code || '').trim();
    out.rules = (out.rules || []).filter(r => r.build).map(r => ({ min: r.min ?? null, max: r.max ?? null, build: parseBuild(r.build)?.text || r.build }));
    out.extras = (out.extras || []).filter(x => x.build).map(x => ({ label: x.label || '', build: parseBuild(x.build)?.text || x.build, min: x.min ?? null, max: x.max ?? null }));
    if (out.downloads) {
      out.downloads.hub = link(out.downloads.hub);
      out.downloads.items = (out.downloads.items || []).filter(i => i.url).map(i => ({ label: i.label || '', url: i.url.trim(), ver: ver(i.ver) }));
      if (!out.downloads.hub && !out.downloads.items.length && !out.downloads.note) out.downloads = null;
    }
    out.guides = (out.guides || []).map(g => ({ title: g.title || '', products: g.products?.length ? g.products : null, items: (g.items || []).filter(i => i.file || i.label).map(i => ({ label: i.label || '', file: i.file || '', ver: ver(i.ver) })) })).filter(g => g.items.length || g.title);
    for (const k of ['history', 'faq', 'notes']) out[k] = (out[k] || []).map(link).filter(Boolean);
    out.checks = (out.checks || []).filter(c => c.text);
    out.noticeDateGuess = !!out.noticeDateGuess;
  }
  if (col === 'products') out.hints = (out.hints || []).filter(h => h.text);
  if (col === 'compat') out.checks = (out.checks || []).filter(c => c.text);
  if (col === 'refs') out.links = (out.links || []).map(link).filter(Boolean);
  if (col === 'settings' && out.latest) {
    out.latest.hub = link(out.latest.hub);
    out.latest.items = (out.latest.items || []).filter(i => i.url).map(i => ({ label: i.label || '', url: i.url.trim(), ver: ver(i.ver) }));
  }
  return out;
}

function validate(col, d, isNew) {
  const { core } = A.env;
  const errs = [];
  const urlOk = u => !u || /^https?:\/\/\S+$/.test(u);
  if (col === 'patches') {
    if (!/^\S+$/.test(d.code)) errs.push('번호를 넣어 주세요 (빈칸 없이).');
    if (!d.title) errs.push('제목을 넣어 주세요.');
    if (isNew && core.collection('patches').list({ deleted: 'all' }).some(p => p.id === d.code)) errs.push(`번호 ${d.code} 는 이미 있어요 (휴지통 포함).`);
    for (const r of d.rules) if (!parseBuild(r.build)) errs.push(`규칙의 빌드 "${r.build}" 를 읽을 수 없어요.`);
    for (const x of d.extras) if (!parseBuild(x.build)) errs.push(`권장 빌드 "${x.build}" 를 읽을 수 없어요.`);
    if (!urlOk(d.noticeUrl)) errs.push('기술공지 주소가 올바르지 않아요.');
    for (const l of [...(d.downloads?.items || []), d.downloads?.hub, ...d.history, ...d.faq, ...d.notes].filter(Boolean)) if (!urlOk(l.url)) errs.push(`주소가 올바르지 않아요: ${l.url}`);
  }
  if (col === 'products') {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(d.id || '')) errs.push('id 는 영문 소문자·숫자·- 로 넣어 주세요.');
    if (isNew && core.collection('products').list({ deleted: 'all' }).some(p => p.id === d.id)) errs.push('같은 id 가 이미 있어요.');
    if (!d.name) errs.push('이름을 넣어 주세요.');
  }
  if ((col === 'notes' || col === 'refs') && !d.title) errs.push('제목을 넣어 주세요.');
  if (col === 'compat' && !d.date) errs.push('날짜를 넣어 주세요.');
  return errs;
}

async function saveEditor() {
  const e = A.edit;
  const d = cleanDraft(e.col, serializeEditor());
  if (e.isNew) {
    if (e.col === 'patches') d.id = d.code;
    else if (e.col !== 'products') d.id = `${e.col.replace(/s$/, '')}-${Date.now().toString(36)}`;
  }
  const errs = validate(e.col, d, e.isNew);
  if (errs.length) { toast(errs.join(' '), 'error'); return; }
  const { fields } = await A.admin.save(e.col, d);
  toast(fields.length || e.isNew ? '저장했어요. 모두에게 보이려면 관리 › 게시' : '바뀐 것이 없어요.');
  const back = e.isNew ? (e.col === 'patches' ? `#/patch/${d.id}` : e.col === 'products' ? `#/product/${d.id}` : e.col === 'notes' ? `#/note/${d.id}` : e.back) : e.back;
  A.edit = null;
  location.hash = back;
}

function rerenderEditor() {
  const y = window.scrollY;
  $('#view').innerHTML = AV.viewEditor();
  window.scrollTo(0, y);
}

// ---------- 테마 ----------
function applyTheme() {
  const t = store.get('fz-theme', 'auto');
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = t;
}

// ---------- 누름 · 입력 · 제출 ----------
function bindGlobal() {
  document.addEventListener('click', onClick);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChangeEv);
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) {
      const s = $('.topsearch input') || $('.searchbar input');
      if (s) { e.preventDefault(); s.focus(); }
    }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshSite(); });
}

async function onClick(ev) {
  const b = ev.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  const { core } = A.env;
  const run = async fn => {
    b.disabled = true;
    try { await fn(); } catch (e) { console.warn(e); toast(e.message || String(e), 'error'); } finally { if (document.body.contains(b)) b.disabled = false; }
  };
  switch (act) {
    case 'theme': {
      const cur = store.get('fz-theme', 'auto');
      const sys = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      const now = cur === 'auto' ? (sys === 'dark' ? 'light' : 'dark') : cur === 'dark' ? 'light' : 'dark';
      store.set('fz-theme', now);
      applyTheme();
      return;
    }
    case 'more': return showMore();
    case 'logout': return run(logout);
    case 'preview':
      A.preview = b.dataset.v || '';
      rebuildModel();
      if (A.preview && A.mode === 'admin') { location.hash = '#/'; return render(); }
      return render();
    case 'view-file': return openFile(b.dataset.id);
    case 'dl-file': return openFile(b.dataset.id, { dl: true });
    case 'copy-el': return copyText($(`#${b.dataset.el}`).value);
    case 'copy-check-link': return copyText(`${location.origin}${location.pathname}#/check?${checkQuery()}`);
    case 'copy-patch': return copyText(V.patchSummaryText(A.model.patchById.get(b.dataset.id)));
    case 'zip-files': return run(() => zipFiles(b.dataset.ids.split(',')));
    case 'check-add': A.check.rows.push({ product: '', ver: A.check.rows.at(-1)?.ver || '', build: '' }); return renderView();
    case 'check-del': A.check.rows.splice(Number(b.dataset.i), 1); return renderView();
    case 'check-clear': A.check = { ...A.check, rows: [{ product: '', ver: '', build: '' }], oz: '', customer: '' }; lastCheckQuery = ''; history.replaceState(null, '', '#/check'); return renderView();
    case 'check-preset': {
      const v = A.check.rows.find(r => r.ver)?.ver || '';
      const ids = b.dataset.set === 'agent' ? ['weblauncher', 'webagent'] : ['server-servlet', 'html5-viewer'];
      const have = A.check.rows.filter(r => r.product);
      A.check.rows = [...have, ...ids.filter(id => A.model.productById.has(id) && !have.some(r => r.product === id)).map(id => ({ product: id, ver: b.dataset.set === 'agent' ? '10' : v, build: '' }))];
      if (!A.check.rows.length) A.check.rows = [{ product: '', ver: '', build: '' }];
      renderView();
      return updateCheckResults();
    }
    case 'check-format': A.check.format = b.dataset.v; return updateCheckResults();
    case 'check-internal': A.check.internal = b.checked; return updateCheckResults();
    case 'pf': A.pf.product = b.dataset.v; return renderView();
    case 'mx-group': A.mx.group = b.dataset.v; return renderView();
    case 'mx-hit': A.mx.hitOnly = b.checked; return renderView();
    case 'mx-prod': case 'mx-patch': {
      const k = act === 'mx-prod' ? 'prods' : 'patches';
      const v = b.dataset.v;
      A.mx[k] = A.mx[k].includes(v) ? A.mx[k].filter(x => x !== v) : [...A.mx[k], v];
      return renderView();
    }
    case 'mx-reset': A.mx.prods = []; A.mx.patches = []; return renderView();
    case 'mx-edit': A.mx.edit = !A.mx.edit; return renderView();
    case 'cell': return run(async () => { await A.admin.toggleCell(b.dataset.patch, b.dataset.product); rebuildAdminModel(); renderView(); });
    case 'probe-links': return run(probeLinks);
    case 'mark-link': return run(async () => {
      const note = b.dataset.ok === '0' ? (prompt('메모 (어디가 깨졌는지, 없어도 됨)') || '') : '';
      await A.admin.markLink(b.dataset.url, b.dataset.ok === '1', note);
      rebuildAdminModel(); renderView();
    });
    case 'publish': return run(async () => { await publishNow(); renderView(); });
    case 'reissue': return run(async () => {
      const ppl = await A.adm.people();
      const p = ppl.find(x => x.id === b.dataset.id);
      if (!(await confirmBox(`${p.name} (${p.identifier})에게 새 코드를 줄까요? 예전 코드와 그 코드로 기억한 기기는 바로 못 써요.`))) return;
      const r = await A.adm.resetCode(p.id);
      renderView();
      await showInvite(r);
    });
    case 'revoke': return run(async () => {
      const name = b.dataset.name;
      if (!(await confirmBox(`${name} 의 권한을 막을까요? 자리를 빼고 그 사람이 가진 등급 열쇠를 바꿔 바로 올려요. 앞으로 올리는 내용은 못 보지만, 이미 내려받은 예전 내용은 그 사람 기기에 남을 수 있어요. (명단에서는 지우지 않고 "막음"으로 남아요)`, { ok: '막기', danger: true }))) return;
      const r = await A.adm.revoke(b.dataset.id);
      renderView();
      toast(`막고 등급 열쇠 ${r.rotated.length}개를 바꿨어요.`);
      if (r.recoveryCode) await showCodes({ title: '새 명단 복구 코드', items: [['명단 복구 코드', r.recoveryCode]], note: '관리자를 막아서 명단 열쇠도 바꿨어요. 새 명단 복구 코드를 봉투에 보관하세요.' });
      if (r.tokenExposed) await modal('<div class="dlg"><h2>GitHub 토큰도 바꿔 주세요</h2><p>쓰기 역할의 꾸러미에는 쓰기 토큰이, 작성자 등급에는 데이터 저장소 열쇠가 있었어요. 관리 › 이 기기 · 계정 › <b>GitHub 토큰 바꾸기</b>로 새 토큰을 넣고, GitHub 에서 예전 토큰을 지우세요. 비공개 저장소라 토큰 없이는 데이터를 받을 수 없어요.</p><div class="row end"><button class="btn primary" data-close="ok">알겠어요</button></div></div>');
    });
    case 'new-roster-recovery': return run(async () => {
      if (!(await confirmBox('새 명단 복구 코드를 받으면 예전 코드는 바로 못 써요. 계속할까요?'))) return;
      await showCodes({ title: '명단 복구 코드', items: [['명단 복구 코드', await A.adm.newRecoveryCode()]], note: '관리자 코드를 잃었을 때 쓰는 코드예요. 종이에 적어 봉투에 보관하세요.' });
    });
    case 'admin-lock': return run(logout);
    case 'new-recovery': return run(async () => {
      if (!(await confirmBox('새 데이터 저장소 복구 코드를 받으면 예전 코드는 바로 못 써요. 계속할까요?'))) return;
      await showCodes({ title: '데이터 저장소 복구 코드', items: [['복구 코드', await core.newRecoveryCode()]], note: '데이터 저장소 비밀번호를 잊었을 때 쓰는 코드예요. 종이에 적어 봉투에 보관하세요.' });
    });
    case 'backup': return run(async () => download(new Blob([await core.exportBackup()], { type: 'application/json' }), `forcsoz-backup-${new Date().toISOString().slice(0, 10)}.json`));
    case 'forget-device': return run(async () => {
      if (!(await confirmBox('이 기기의 관리자 연결을 끊을까요? (GitHub 데이터는 그대로예요. 못 올린 변경이 있으면 끊지 않아요.)', { danger: true, ok: '끊기' }))) return;
      await core.forgetDevice();
      A.admin = null;
      history.replaceState(null, '', `${location.pathname}#/`);
      await boot();
    });
    case 'clear-conflict': return run(async () => { await core.collection(b.dataset.col).clearConflicts(b.dataset.id); renderView(); });
    case 'del': return run(async () => {
      if (!(await confirmBox('휴지통으로 옮길까요? 관리 › 휴지통에서 되살릴 수 있어요.'))) return;
      await A.admin.remove(b.dataset.col, b.dataset.id); rebuildAdminModel(); renderView();
    });
    case 'restore': return run(async () => { await A.admin.restore(b.dataset.col, b.dataset.id); rebuildAdminModel(); renderView(); });
    case 'rename-doc': return run(async () => {
      const d = core.collection('docs').get(b.dataset.id);
      const name = prompt('파일 이름', d.name);
      if (name && name !== d.name) { await A.admin.renameDoc(d.id, name); rebuildAdminModel(); renderView(); }
    });
    case 'ed-add': case 'ed-del': {
      serializeEditor();
      const path = b.dataset.path;
      let arr = getPath(A.edit.draft, path);
      if (!Array.isArray(arr)) { arr = []; setPath(A.edit.draft, path, arr); }
      if (act === 'ed-add') arr.push(tmplFor(path)); else arr.splice(Number(b.dataset.i), 1);
      return rerenderEditor();
    }
    case 'ed-parse-rule': {
      serializeEditor();
      const { rules, errors } = parseRuleText(A.edit.draft.ruleText);
      if (rules.length) A.edit.draft.rules = rules;
      rerenderEditor();
      toast(errors.length ? `읽지 못한 부분: ${errors.join(' / ')}` : `규칙 ${rules.length}개를 읽었어요. 저장해야 반영돼요.`, errors.length ? 'error' : '');
      return;
    }
    case 'ed-trash': return run(async () => {
      if (!(await confirmBox('휴지통으로 옮길까요? 관리 › 휴지통에서 되살릴 수 있어요.'))) return;
      await A.admin.remove(A.edit.col, A.edit.id);
      A.edit = null;
      location.hash = '#/admin#trash';
    });
    default:
  }
}

function showMore() {
  const admin = A.mode === 'admin';
  const loggedIn = A.role !== 'public';
  modal(`<nav class="more-sheet">${navFor().filter(n => !TABS.includes(n[0])).map(([r, t, i]) => `<a href="#/${r}" data-close="x">${icon(i)}<span>${t}</span></a>`).join('')}
    ${admin ? `<a href="#/admin" data-close="x">${icon('admin')}<span>관리</span></a>` : ''}
    ${loggedIn && !A.preview ? '<button class="btn ghost" data-close="x" data-act="preview" data-v="public">공개 화면으로 보기</button>' : ''}
    ${loggedIn ? '<button class="btn ghost" data-close="x" data-act="logout">로그아웃</button>' : '<a class="btn primary" href="#/login" data-close="x">로그인</a>'}
    <button class="btn" data-close="x">닫기</button></nav>`);
}

async function showCodes({ title, items, note }) {
  await modal(`<div class="dlg"><h2>${esc(title)}</h2><p>${esc(note || '')} <b>다시 보여 주지 않아요.</b></p>
    ${items.map(([k, v]) => `<p class="small muted">${esc(k)}</p><p class="code-big">${esc(v)}</p>`).join('')}
    <div class="row end"><button class="btn primary" data-close="ok">적어 두었어요</button></div></div>`);
}

function onInput(ev) {
  const t = ev.target;
  if (t.dataset.bind) {
    if (t.tagName === 'SELECT') return;
    const path = t.dataset.bind;
    const full = /\.ver$/.test(path) ? parseFull(t.value) : null;
    if (full) {
      const i = Number(path.split('.')[1]);
      const kind = A.model.productById.get(A.check.rows[i].product)?.versionKind;
      A.check.rows[i].ver = fmtVer(full.ver, kind || 'oz');
      A.check.rows[i].build = full.build.text;
      renderView();
      $(`[data-bind="rows.${i}.build"]`)?.focus();
      return updateCheckResults();
    }
    setBind(path, t.value);
    return updateCheckResults();
  }
  if (t.dataset.actInput === 'pw-check') {
    const w = weakReasons(t.value);
    const el = $('#pw-warn');
    if (el) el.innerHTML = t.value ? (w.length ? `<span class="err">약해요: ${w.map(esc).join(' ')}</span>` : '<span class="ok">좋아요</span>') : '';
    return;
  }
  if (t.dataset.actInput === 'rule-test') {
    serializeEditor();
    const d = cleanDraft('patches', A.edit.draft);
    const ver = parseVersion($('#rt-ver').value);
    const build = parseBuild($('#rt-build').value);
    const pid = d.products?.[0];
    const out = $('#rt-out');
    if (!pid) { out.textContent = '대상 제품을 먼저 고르세요.'; return; }
    const m = { ...A.model, patches: [{ ...d, id: d.code || 'new' }], compat: [], home: {} };
    const res = check(m, [{ product: pid, ver, build }], {});
    const it = res.rows[0]?.items[0];
    out.innerHTML = it ? `<b class="st st-${it.status}">${STATUS[it.status].label}</b> ${esc(it.reason)}` : '';
    return;
  }
  if (t.id === 'md-src') { const p = $('#md-preview'); if (p) import('./md.js').then(({ md }) => { p.innerHTML = md(t.value); }); }
}

async function onChangeEv(ev) {
  const t = ev.target;
  if (t.dataset.bind && t.tagName === 'SELECT') {
    setBind(t.dataset.bind, t.value);
    renderView();
    return updateCheckResults();
  }
  if (t.name === 'csv' && t.closest('form[data-form="import-customers"]') && t.files?.[0]) {
    const parsed = parseCustomerCsv(await t.files[0].text(), A.model.products);
    $('#csv-preview').innerHTML = AV.csvPreviewHtml(parsed);
    return;
  }
  if (t.dataset.actChange === 'ed-upload' && t.files?.[0]) {
    const target = t.dataset.target;
    serializeEditor();
    try {
      toast('파일을 암호화해 올리는 중…');
      const rec = await A.admin.uploadDoc(t.files[0]);
      setPath(A.edit.draft, target, rec.id);
      toast(rec.reused ? '같은 파일이 이미 있어서 그것을 골랐어요.' : '올렸어요.');
    } catch (e) { toast(e.message, 'error'); }
    rerenderEditor();
  }
}

async function onSubmit(ev) {
  const f = ev.target.closest('form[data-form]');
  if (!f) return;
  ev.preventDefault();
  const kind = f.dataset.form;
  const { core } = A.env;
  const btn = f.querySelector('button:not([type="button"])');
  const busy = async (fn, label) => {
    const old = btn?.textContent;
    if (btn) { btn.disabled = true; if (label) btn.textContent = label; }
    try { await fn(); } catch (e) { console.warn(e); toast(e.message || String(e), 'error'); return e; } finally { if (btn && document.body.contains(btn)) { btn.disabled = false; btn.textContent = old; } }
  };
  const fd = new FormData(f);
  switch (kind) {
    case 'search': {
      const q = String(fd.get('q') || '').trim();
      location.hash = `#/search?q=${encodeURIComponent(q)}`;
      return;
    }
    case 'quick-check': case 'patch-check': {
      const product = String(fd.get('product') || '');
      let ver = String(fd.get('ver') || '').trim();
      let build = String(fd.get('build') || '').trim();
      const full = parseFull(ver);
      if (full) { ver = fmtVer(full.ver, A.model.productById.get(product)?.versionKind || 'oz'); build = full.build.text; }
      A.check.rows = [{ product, ver, build }];
      lastCheckQuery = '';
      location.hash = `#/check?${checkQuery()}`;
      return;
    }
    case 'check': return;
    case 'login': {
      const err = await busy(() => doLogin(String(fd.get('id') || ''), String(fd.get('secret') || ''), { remember: !!fd.get('remember') }), '확인하는 중…');
      if (err) { A.loginError = err.message; renderLogin(['login']); }
      return;
    }
    case 'admin-setup': {
      if (fd.get('pw') !== fd.get('pw2')) { toast('두 비밀번호가 달라요.', 'error'); return; }
      let res;
      let coreCode;
      const err = await busy(async () => {
        const token = String(fd.get('token')).trim();
        const name = String(fd.get('user')).trim();
        coreCode = await core.setup(token, String(fd.get('pw')), { user: name });
        res = await A.env.access.setup(core, { token, name, identifier: String(fd.get('email')).trim() });
      }, '설정하는 중…');
      if (err) { A.connectError = err.message; renderLogin(['admin-connect', 'setup']); return; }
      await showCodes({ title: '설정 끝 — 세 가지를 보관하세요', note: '관리자 코드로 로그인해요. 두 복구 코드는 종이에 적어 봉투에 보관하세요.', items: [['관리자 아이디 · 코드', `${String(fd.get('email')).trim()} · ${res.code}`], ['데이터 저장소 복구 코드', coreCode], ['명단 복구 코드', res.recoveryCode]] });
      A.adm = res.admin;
      await enterWrite(A.env.access.me());
      return;
    }
    case 'admin-recover': {
      let code;
      const err = await busy(async () => {
        if (!core.status().connected) await core.connectWithToken(String(fd.get('token')).trim(), String(fd.get('pw')));
        else await core.open(String(fd.get('pw')));
        const adm = await A.env.access.recoverAdmin(core, String(fd.get('code')));
        const me = (await adm.people()).find(p => p.role === 'admin' && p.status === 'active');
        if (!me) throw new Error('명단에 관리자가 없어요.');
        const r = await adm.resetCode(me.id);
        code = { id: me.identifier, code: r.code };
        await core.lock();
      }, '확인하는 중…');
      if (err) { A.connectError = err.message; renderLogin(['admin-connect', 'recover']); return; }
      await showCodes({ title: '새 관리자 코드', items: [['아이디 · 코드', `${code.id} · ${code.code}`]], note: '예전 관리자 코드는 이제 못 써요. 이 코드로 로그인하세요.' });
      location.hash = '#/login';
      return;
    }
    case 'add-person': {
      let r;
      const err = await busy(async () => {
        const email = String(fd.get('email') || '').trim();
        if (!/@forcs\.com$/i.test(email) && !(await confirmBox(`${email} 은(는) @forcs.com 주소가 아니에요. 그래도 코드를 줄까요?`, { ok: '그래도 주기', danger: true }))) return;
        r = await A.adm.addPerson({ name: String(fd.get('name') || '').trim() || email.split('@')[0], identifier: email, role: String(fd.get('role')) });
        f.reset();
      }, '만드는 중…');
      if (!err && r) { renderView(); await showInvite(r); }
      return;
    }
    case 'import-customers': {
      const prog = $('#csv-progress');
      await busy(async () => {
        const parsed = parseCustomerCsv(await f.elements.csv.files[0].text(), A.model.products);
        if (!parsed.rows.length) throw new Error(parsed.errors[0] || '가져올 줄이 없어요.');
        const rep = await importCustomers(A.adm, parsed.rows, { acceptWeak: !!fd.get('acceptWeak'), onProgress: (i, n) => { prog.textContent = `자리 만드는 중 ${i}/${n} (한 명에 1초쯤)`; } });
        const weakPids = rep.added.filter(x => x.weak).map(x => x.pid);
        if (weakPids.length) { const cur = core.collection('settings').get('customerWeak'); await core.collection('settings').put({ id: 'customerWeak', pids: [...new Set([...(cur?.pids || []), ...weakPids])] }); }
        await A.admin.log('people', { id: 'customers', title: '유지보수고객' }, 'created', [], `유지보수고객 ${rep.added.length}명 가져옴${weakPids.length ? ` (약한 번호 ${weakPids.length})` : ''}`);
        prog.innerHTML = `끝: ${rep.added.length}명 추가${rep.duplicate.length ? ` · 이미 있음 ${rep.duplicate.length}` : ''}${rep.weak.length ? ` · <b class="err">약한 번호 ${rep.weak.length}줄 (${fd.get('acceptWeak') ? '받음' : '거부'}: ${rep.weak.slice(0, 10).join(', ')}줄)</b>` : ''}${rep.multi ? ` · 여러 제품 ${rep.multi}명은 모든 제품으로` : ''}${rep.failed.length ? `<br><span class="err">${rep.failed.slice(0, 5).map(esc).join(' / ')}</span>` : ''}`;
        AV.hydrateAdmin();
      }, '가져오는 중…');
      return;
    }
    case 'apply-secret': return busy(async () => { const v = await A.adm.applySecretChange(String(fd.get('request'))); toast(`${v.name} 의 비밀문장을 적용했어요.`); f.reset(); renderView(); });
    case 'change-secret': return busy(async () => {
      const r = await A.env.access.changeSecret(String(fd.get('old')), String(fd.get('phrase')));
      const out = $('#secret-result');
      if (r.done) { toast('바꿨어요. 다음 로그인부터 새 비밀문장을 쓰세요.'); f.reset(); }
      else out.innerHTML = `<p>아래 글자를 관리자에게 보내 주세요 (비밀문장은 들어 있지 않아요).</p><textarea id="secret-req" class="answer-text" rows="3" readonly>${esc(r.request)}</textarea><button type="button" class="btn sm" data-act="copy-el" data-el="secret-req">복사</button>`;
    });
    case 'import': {
      const seedFile = f.elements.seed.files[0];
      const picked = [...(f.elements.files.files || [])];
      const prog = $('#import-progress');
      await busy(async () => {
        const seed = JSON.parse(await seedFile.text());
        const byName = new Map(picked.map(x => [x.name, x]));
        const fileFor = (src, meta) => byName.get(src.split('/').pop()) || byName.get(meta.name) || null;
        const counts = await A.admin.importSeed(seed, fileFor, { overwrite: !!fd.get('overwrite'), onProgress: t => { prog.textContent = t; } });
        prog.textContent = `끝: 파일 ${counts.files}개 올림 (${counts.filesReused}개는 이미 있음), 패치 ${counts.patches}, 제품 ${counts.products}, 참고 ${counts.notes}, 호환성 ${counts.compat}, 자료 ${counts.refs}, 설정 ${counts.settings}, 건너뜀 ${counts.skipped}${counts.missingFiles.length ? ` · 없는 파일: ${counts.missingFiles.join(', ')}` : ''}`;
        rebuildAdminModel();
        toast('가져왔어요. 확인한 뒤 게시하세요.');
      }, '가져오는 중…');
      return;
    }
    case 'upload': {
      const list = [...f.elements.file.files];
      const prog = $('#upload-progress');
      await busy(async () => {
        for (const [i, file] of list.entries()) {
          prog.textContent = `${i + 1}/${list.length} ${file.name}`;
          const r = await A.admin.uploadDoc(file, { onProgress: p => { prog.textContent = `${i + 1}/${list.length} ${file.name} ${Math.round(p * 100)}%`; } });
          if (r.reused) toast(`${file.name}: 같은 파일이 이미 있어요.`);
        }
        prog.textContent = '';
        rebuildAdminModel(); renderView();
        toast('올렸어요. 패치 편집에서 가이드 문서로 거세요.');
      }, '올리는 중…');
      return;
    }
    case 'user-name': return busy(async () => { await core.setUser(String(fd.get('user'))); toast('저장했어요.'); renderView(); });
    case 'admin-pw': return busy(async () => { await core.changePassword(String(fd.get('pw'))); toast('관리자 비밀번호를 바꿨어요. 다른 관리자 기기는 다음에 새 비밀번호를 물어요.'); f.reset(); });
    case 'rotate-token': return busy(async () => {
      const tok = String(fd.get('token')).trim();
      await core.rotateToken(tok);
      if (A.adm) await A.adm.setToken(tok);
      await A.pub.publish();
      rebuildAdminModel();
      toast('토큰을 바꾸고 게시했어요. 예전 토큰은 1~2주 뒤에 GitHub 에서 지우세요.');
      f.reset();
    });
    case 'editor': return busy(saveEditor, '저장하는 중…');
    default:
  }
}
