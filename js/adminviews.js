// 로그인 · 관리자 기기 연결 · 편집기 (관리 화면 자체는 adminpage.js)

import { A } from './state.js';
import { esc, md } from './md.js';
import { fmtVer, parseVersion, fmtRange } from './rules.js';
import { TEAM_DOMAIN } from './tiers.js';
import { KIND } from './admin.js';

const core = () => A.env.core;
const M = () => A.model;

// ---------- 로그인 (한 화면, 역할은 고르지 않는다 — 아이디의 자리가 정한다) ----------
export function viewLogin({ error = '', none = false } = {}) {
  return `
  <div class="lock">
    <form class="lock-card" data-form="login" autocomplete="off">
      <div class="brand-big"><img src="assets/icon.svg" alt=""><div><b>로그인</b><small>OZ 보안 패치 · FORCS 컨설팅</small></div></div>
      ${none ? '<p class="note-box">아직 게시된 내용이 없어요. 관리자가 자료를 넣고 게시하면 열려요.</p>' : ''}
      <label class="fld"><span>아이디</span><input name="id" autocomplete="username" required autofocus placeholder="고객 ID 또는 name@${TEAM_DOMAIN}"></label>
      <label class="fld"><span>인증번호 · 코드</span><input type="password" name="secret" autocomplete="current-password" required placeholder="유지보수 인증번호 또는 받은 코드"></label>
      <label class="chk"><input type="checkbox" name="remember" checked> 이 기기 기억 (30일, 개인 기기에서만)</label>
      ${error ? `<p class="err">${esc(error)}</p>` : ''}
      <button class="btn primary big">로그인</button>
      <p class="hint">유지보수 고객은 <b>고객 ID + 인증번호</b>, 컨설팅팀·작성자·관리자는 <b>@${TEAM_DOMAIN} 주소 + 받은 코드</b>. 권한은 넣은 값으로 정해져요. 확인하는 데 1~2초 걸려요 (남이 맞혀 보기 어렵게 일부러 느리게).</p>
      <p class="lock-foot"><a href="#/">← 공개 화면으로</a> · <a href="#/admin-connect">처음 설정 · 관리자 복구</a></p>
    </form>
  </div>`;
}

// ---------- 처음 설정 · 관리자 복구 ----------
export function viewAdminConnect({ error = '', tab = '' } = {}) {
  const s = core().status();
  const t = tab || (s.connected ? 'recover' : 'setup');
  return `
  <div class="lock">
    <div class="lock-card wide">
      <div class="brand-big"><img src="assets/icon.svg" alt=""><div><b>처음 설정 · 관리자 복구</b><small>데이터: forcsoz/forcsoz-data (비공개) · 사이트: forcsoz.github.io</small></div></div>
      <div class="seg" role="tablist">
        <a class="seg-b ${t === 'setup' ? 'on' : ''}" href="#/admin-connect/setup">처음 설정</a>
        <a class="seg-b ${t === 'recover' ? 'on' : ''}" href="#/admin-connect/recover">관리자 코드를 잃었어요</a>
      </div>
      ${error ? `<p class="err">${esc(error)}</p>` : ''}
      ${t === 'setup' ? `<form class="stack sm" data-form="admin-setup" autocomplete="off"><p>빈 <code>forcsoz/forcsoz-data</code> 저장소에 처음 한 번. 끝나면 <b>관리자 코드</b>, <b>데이터 저장소 복구 코드</b>, <b>명단 복구 코드</b>를 한 번만 보여 줘요. 그다음부터 관리자도 다른 사람처럼 아이디 + 코드로 로그인해요.</p>
        <label class="fld"><span>GitHub 토큰 (forcsoz-data · forcsoz.github.io · files-N 쓰기, 저장소 만들기)</span><input type="password" name="token" required autocomplete="off"></label>
        <label class="fld"><span>데이터 저장소 비밀번호 (8자 이상 — 금고 열쇠, 봉투에 보관)</span><input type="password" name="pw" required minlength="8" autocomplete="new-password"></label>
        <label class="fld"><span>한 번 더</span><input type="password" name="pw2" required minlength="8" autocomplete="new-password"></label>
        <div class="grid-2"><label class="fld"><span>관리자 아이디 (oz@ 주소)</span><input name="email" type="email" required value="oz@${TEAM_DOMAIN}"></label>
        <label class="fld"><span>이름</span><input name="user" required placeholder="관리자"></label></div>
        <button class="btn primary">설정</button></form>` : ''}
      ${t === 'recover' ? `<form class="stack sm" data-form="admin-recover" autocomplete="off"><p>관리자 코드를 잃었을 때: 관리자 기기(데이터 저장소가 연결된 기기)에서 <b>데이터 저장소 비밀번호</b>와 <b>명단 복구 코드</b>로 새 관리자 코드를 받아요.${s.connected ? '' : ' <b class="err">이 기기는 아직 데이터 저장소에 연결되지 않았어요 — 아래 토큰도 넣어 주세요.</b>'}</p>
        ${s.connected ? '' : '<label class="fld"><span>GitHub 토큰</span><input type="password" name="token" required autocomplete="off"></label>'}
        <label class="fld"><span>데이터 저장소 비밀번호</span><input type="password" name="pw" required autocomplete="current-password"></label>
        <label class="fld"><span>명단 복구 코드</span><input name="code" required placeholder="ABCD-EFGH-…"></label>
        <button class="btn primary">새 관리자 코드 받기</button></form>` : ''}
      <p class="lock-foot"><a href="#/">← 공개 화면으로</a> · <a href="#/login">로그인</a></p>
    </div>
  </div>`;
}

// ---------- 내 계정 (로그인한 사람 누구나) ----------
export function viewAccount() {
  const me = A.env.access.me();
  if (!me) return '<div class="empty"><p>로그인한 사람만 볼 수 있어요.</p><a class="btn primary" href="#/login">로그인</a></div>';
  return `
  <header class="page-h"><div><p class="eyebrow">내 계정</p><h1>${esc(me.name || '')}</h1><p class="muted">${esc(me.roleName)}</p></div></header>
  <section class="card">
    <header class="card-h"><h2>코드를 내가 정한 비밀문장으로 바꾸기</h2></header>
    <form class="stack sm" data-form="change-secret" autocomplete="off">
      <label class="fld"><span>지금 코드 (또는 비밀문장)</span><input type="password" name="old" required autocomplete="current-password"></label>
      <label class="fld"><span>새 비밀문장 (10자 이상, 남이 짐작하기 어려운 문장)</span><input type="password" name="phrase" required minlength="10" autocomplete="new-password" data-act-input="pw-check"></label>
      <div id="pw-warn" class="hint"></div>
      <button class="btn primary">바꾸기</button>
      <div id="secret-result"></div>
    </form>
    <p class="hint">${me.canWrite ? '작성자·관리자는 바로 바뀌어요.' : '보기만 하는 계정은 사이트에 직접 올릴 수 없어서, 바꾸기 요청 글자(ACX1.…)가 나와요. 그 글자를 관리자에게 보내면 관리자가 적용해요. 그 글자에는 비밀문장이 들어 있지 않아요.'}</p>
  </section>`;
}

export { viewAdmin, stateText, hydrateAdmin, csvPreviewHtml } from './adminpage.js';

// ---------- 편집기 ----------
const KINDS = { oz: 'OZ 버전 (51·60·70·80·90)', agent: 'WebLauncher·WebAgent (10)', other: '기타' };
const verVal = v => (v == null ? '' : fmtVer(v));

function input(name, value, { label = '', type = 'text', ph = '', dt = '', cls = '', req = false } = {}) {
  const el = `<input name="${esc(name)}" type="${type}" value="${esc(value ?? '')}" placeholder="${esc(ph)}"${dt ? ` data-type="${dt}"` : ''}${req ? ' required' : ''}>`;
  return label ? `<label class="fld ${cls}"><span>${esc(label)}</span>${el}</label>` : el;
}
function area(name, value, { label = '', rows = 4, dt = '', ph = '', id = '' } = {}) {
  return `<label class="fld"><span>${esc(label)}</span><textarea name="${esc(name)}" rows="${rows}"${dt ? ` data-type="${dt}"` : ''} placeholder="${esc(ph)}"${id ? ` id="${id}"` : ''}>${esc(value ?? '')}</textarea></label>`;
}
function prodChecks(name, selected = []) {
  return `<div class="checks">${M().products.map(p => `<label class="chk"><input type="checkbox" name="${esc(name)}[]" value="${esc(p.id)}" ${selected?.includes(p.id) ? 'checked' : ''}> ${esc(p.name)}</label>`).join('')}</div>`;
}
function fileSelect(name, value) {
  const docs = core().collection('docs').list();
  return `<select name="${esc(name)}"><option value="">(파일 없음)</option>${docs.map(d => `<option value="${esc(d.id)}" ${d.id === value ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}${value && !docs.some(d => d.id === value) ? `<option value="${esc(value)}" selected>(없는 파일 ${esc(value)})</option>` : ''}</select>`;
}

// 줄 목록 편집. cols: [{ k, label, type: text|ver|file|products|url|check, ph }]
function rows(path, list, cols, { add = '+ 줄 더하기', empty = '' } = {}) {
  list = list || [];
  return `<div class="ed-rows" data-path="${esc(path)}">
    ${list.length ? '' : `<p class="muted small">${esc(empty || '없음')}</p>`}
    ${list.map((it, i) => `<div class="ed-row">${cols.map(c => {
      const nm = `${path}.${i}.${c.k}`;
      const v = c.k.split('.').reduce((o, k) => o?.[k], it);
      if (c.type === 'ver') return `<label class="fld xs"><span>${esc(c.label)}</span><input name="${esc(nm)}" value="${esc(verVal(v))}" data-type="ver" placeholder="${esc(c.ph || '')}"></label>`;
      if (c.type === 'file') return `<label class="fld"><span>${esc(c.label)}</span>${fileSelect(nm, v)}<input type="file" accept=".pdf,.pptx" data-act-change="ed-upload" data-target="${esc(nm)}" data-skip aria-label="새 파일 올리기"></label>`;
      if (c.type === 'products') return `<div class="fld"><span>${esc(c.label)}</span>${prodChecks(nm, v)}</div>`;
      if (c.type === 'check') return `<label class="chk"><input type="checkbox" name="${esc(nm)}" ${v ? 'checked' : ''}> ${esc(c.label)}</label>`;
      return `<label class="fld ${c.wide ? 'wide' : ''}"><span>${esc(c.label)}</span><input name="${esc(nm)}" value="${esc(v ?? '')}" placeholder="${esc(c.ph || '')}"${c.type === 'url' ? ' type="url"' : ''}></label>`;
    }).join('')}<button type="button" class="btn sm ghost" data-act="ed-del" data-path="${esc(path)}" data-i="${i}" aria-label="이 줄 지우기">✕</button></div>`).join('')}
    <button type="button" class="btn sm" data-act="ed-add" data-path="${esc(path)}">${esc(add)}</button>
  </div>`;
}
const LINK_COLS = [{ k: 'label', label: '이름' }, { k: 'url', label: '주소', type: 'url', wide: true }, { k: 'icon', label: '🔗 아이콘만', type: 'check' }];

export const NEW = {
  patches: () => ({ id: '', code: '', title: '', short: '', products: [], productsText: '', ruleText: '', rules: [], ruleDetails: [], extras: [], downloads: { hub: null, items: [], note: '' }, guideNote: '', guides: [], history: [], faq: [], notes: [], notePages: [], checks: [], noticeUrl: '', noticeDate: '', order: (M().patches.length + 1) }),
  products: () => ({ id: '', name: '', group: '서버', versionKind: 'oz', aliases: [], hints: [], order: M().products.length + 1 }),
  notes: () => ({ id: '', title: '', patch: '', body: '' }),
  compat: () => ({ id: '', date: new Date().toISOString().slice(0, 10), body: '', version: '', products: [], checks: [], order: M().compat.length + 1 }),
  refs: () => ({ id: '', title: '', kind: 'other', tier: 'team', body: '', files: [], links: [], order: M().refs.length + 1 }),
};

export function viewEditor() {
  const e = A.edit;
  if (!e) return '<p class="muted">편집할 것을 고르세요.</p>';
  const d = e.draft;
  const head = (t) => `<nav class="crumbs"><a href="#/admin#edit">관리</a> › 편집</nav><header class="page-h"><div><p class="eyebrow">${esc(KIND[e.col] || e.col)} ${e.isNew ? '새로 만들기' : '편집'}</p><h1>${esc(t)}</h1></div></header>`;
  const foot = `<div class="ed-foot"><button class="btn primary">저장</button><a class="btn" href="${esc(e.back || '#/admin#edit')}">취소</a>${!e.isNew && e.col !== 'settings' ? `<span class="grow"></span><button type="button" class="btn danger" data-act="ed-trash">휴지통으로</button>` : ''}</div>`;
  let body = '';
  if (e.col === 'patches') {
    body = `
    <fieldset><legend>기본</legend><div class="grid-3">
      ${input('code', d.code, { label: '번호 (예: 2026_009)', req: true })}
      ${input('short', d.short, { label: '짧은 이름' })}
      ${input('order', d.order, { label: '순서', dt: 'num', type: 'number' })}
    </div>
    ${input('title', d.title, { label: '제목', req: true })}
    <div class="grid-2">${input('noticeUrl', d.noticeUrl, { label: '📢 기술공지 주소', type: 'url' })}${input('noticeDate', d.noticeDate, { label: '공지일 (YYYY-MM-DD)', ph: '2026-10-11' })}</div>
    <label class="chk"><input type="checkbox" name="noticeDateGuess" ${d.noticeDateGuess ? 'checked' : ''}> 공지일은 추정값</label></fieldset>

    <fieldset><legend>📦 대상 제품 = 매트릭스의 O</legend>${prodChecks('products', d.products)}
    ${input('productsText', d.productsText, { label: '노션 표기 (글자 그대로)' })}</fieldset>

    <fieldset><legend>🏷️ 패치 버전 → 패치 확인 규칙</legend>
      <div class="row end">${input('ruleText', d.ruleText, { label: '패치 버전 (글)', ph: '80이상 2026.0101 이후', cls: 'grow' })}<button type="button" class="btn sm" data-act="ed-parse-rule">글에서 규칙 읽기</button></div>
      <p class="hint">규칙: 버전이 (이상~이하) 안이면 빌드가 이 값 "이후(같은 빌드 포함)" 일 때 적용됨. 버전은 8.0 / 80 / 10 처럼, 빌드는 2026.0101 또는 2026.0814.100.</p>
      ${rows('rules', d.rules, [{ k: 'min', label: '버전 이상', type: 'ver', ph: '8.0' }, { k: 'max', label: '버전 이하', type: 'ver', ph: '(없음)' }, { k: 'build', label: '이 빌드 이후', ph: '2026.0101' }], { add: '+ 규칙', empty: '규칙이 없으면 패치 확인이 "확인 필요"로만 나와요.' })}
      ${area('ruleDetails', (d.ruleDetails || []).join('\n'), { label: '패치 버전 상세 (줄마다)', dt: 'lines', rows: 2 })}
      <b class="small">권장 빌드 (버그 수정 등, 꼭 필요하진 않음)</b>
      ${rows('extras', d.extras, [{ k: 'label', label: '설명', wide: true }, { k: 'build', label: '빌드' }, { k: 'min', label: '버전 이상', type: 'ver' }, { k: 'max', label: '버전 이하', type: 'ver' }], { add: '+ 권장 빌드' })}
      <div class="rule-test"><b class="small">규칙 시험</b> <input data-skip data-act-input="rule-test" id="rt-ver" placeholder="버전 8.0"> <input data-skip data-act-input="rule-test" id="rt-build" placeholder="빌드 2026.0315"> <span id="rt-out" class="hint"></span></div>
    </fieldset>

    <fieldset><legend>⬇️ 다운로드</legend>
      <div class="grid-3">${input('downloads.hub.label', d.downloads?.hub?.label, { label: '안내 링크 이름', ph: '🔗' })}${input('downloads.hub.url', d.downloads?.hub?.url, { label: '안내 링크 주소', type: 'url' })}<label class="chk"><input type="checkbox" name="downloads.hub.icon" ${d.downloads?.hub?.icon ? 'checked' : ''}> 🔗 아이콘만</label></div>
      ${rows('downloads.items', d.downloads?.items, [{ k: 'label', label: '이름', ph: '8.0' }, { k: 'url', label: '주소', type: 'url', wide: true }, { k: 'ver.min', label: '버전 이상', type: 'ver' }, { k: 'ver.max', label: '버전 이하', type: 'ver' }], { add: '+ 다운로드 링크' })}
      ${input('downloads.note', d.downloads?.note, { label: '메모' })}
    </fieldset>

    <fieldset><legend>📄 가이드 문서</legend>
      ${input('guideNote', d.guideNote, { label: '가이드 메모' })}
      ${(d.guides || []).map((g, gi) => `<div class="ed-group">
        <div class="row end">${input(`guides.${gi}.title`, g.title, { label: `묶음 ${gi + 1} 제목 (없어도 됨)`, cls: 'grow' })}<button type="button" class="btn sm ghost" data-act="ed-del" data-path="guides" data-i="${gi}">묶음 지우기</button></div>
        <div class="fld"><span>이 묶음의 제품 (안 고르면 모든 대상 제품)</span>${prodChecks(`guides.${gi}.products`, g.products)}</div>
        ${rows(`guides.${gi}.items`, g.items, [{ k: 'label', label: '이름', wide: true }, { k: 'file', label: '파일', type: 'file' }, { k: 'ver.min', label: '버전 이상', type: 'ver' }, { k: 'ver.max', label: '버전 이하', type: 'ver' }], { add: '+ 문서' })}
      </div>`).join('')}
      <button type="button" class="btn sm" data-act="ed-add" data-path="guides">+ 가이드 묶음</button>
    </fieldset>

    <fieldset><legend>📋 대응이력</legend>${rows('history', d.history, LINK_COLS, { add: '+ 링크' })}</fieldset>
    <fieldset><legend>❓ 고객 FAQ</legend>${rows('faq', d.faq, LINK_COLS, { add: '+ 링크' })}</fieldset>
    <fieldset><legend>💼 컨설팅 참고사항</legend>${rows('notes', d.notes, LINK_COLS, { add: '+ 링크' })}
      <div class="fld"><span>참고 문서 (이 사이트 안의 글)</span><div class="checks">${M().notes.map(n => `<label class="chk"><input type="checkbox" name="notePages[]" value="${esc(n.id)}" ${(d.notePages || []).includes(n.id) ? 'checked' : ''}> ${esc(n.title)}</label>`).join('') || '<span class="muted">없음</span>'}</div></div>
    </fieldset>
    <fieldset><legend>⚠️ 확인 필요 메모</legend>${rows('checks', d.checks, [{ k: 'text', label: '내용', wide: true }, { k: 'source', label: '출처' }], { add: '+ 메모' })}</fieldset>`;
    return `${head(d.code ? `[${d.code}] ${d.title}` : '새 패치')}<form class="editor" data-form="editor" autocomplete="off">${body}${foot}</form>`;
  }
  if (e.col === 'products') {
    body = `<fieldset><legend>제품</legend><div class="grid-3">
      ${input('id', d.id, { label: 'id (영문, 바꿀 수 없음)', req: true })}
      ${input('name', d.name, { label: '이름', req: true })}
      ${input('order', d.order, { label: '순서', dt: 'num', type: 'number' })}</div>
      <div class="grid-2"><label class="fld"><span>분류</span><input name="group" list="groups" value="${esc(d.group || '')}"><datalist id="groups"><option value="서버"><option value="뷰어"><option value="설치형"></datalist></label>
      <label class="fld"><span>버전 종류</span><select name="versionKind">${Object.entries(KINDS).map(([k, t]) => `<option value="${k}" ${d.versionKind === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label></div>
      ${input('aliases', (d.aliases || []).join(', '), { label: '다른 이름 (쉼표로, 검색에 씀)', dt: 'csv' })}</fieldset>
      <fieldset><legend>도움말</legend>${rows('hints', d.hints, [{ k: 'text', label: '내용', wide: true }, { k: 'source', label: '출처' }], { add: '+ 도움말' })}</fieldset>`;
    return `${head(d.name || '새 제품')}<form class="editor" data-form="editor" autocomplete="off">${body}${foot}</form>`;
  }
  if (e.col === 'notes') {
    body = `<fieldset><legend>참고 문서</legend>${input('title', d.title, { label: '제목', req: true })}
      <label class="fld"><span>패치</span><select name="patch"><option value="">(없음)</option>${M().patches.map(p => `<option value="${esc(p.id)}" ${p.id === d.patch ? 'selected' : ''}>${esc(p.code)}</option>`).join('')}</select></label>
      ${area('body', d.body, { label: '내용 (### 제목, - 목록, > 상자, **굵게**, `코드`, [글](주소))', rows: 16, id: 'md-src' })}
      <div class="md preview" id="md-preview">${md(d.body)}</div></fieldset>`;
    return `${head(d.title || '새 참고 문서')}<form class="editor" data-form="editor" autocomplete="off">${body}${foot}</form>`;
  }
  if (e.col === 'compat') {
    body = `<fieldset><legend>호환성</legend><div class="grid-3">${input('date', d.date, { label: '날짜', req: true })}${input('version', d.version, { label: '버전' })}${input('order', d.order, { label: '순서', dt: 'num', type: 'number' })}</div>
      ${area('body', d.body, { label: '내용 (마크다운)', rows: 5, id: 'md-src' })}<div class="md preview" id="md-preview">${md(d.body)}</div>
      <div class="fld"><span>관련 제품 (패치 확인 결과에 경고로 나와요)</span>${prodChecks('products', d.products)}</div></fieldset>
      <fieldset><legend>확인 필요 메모</legend>${rows('checks', d.checks, [{ k: 'text', label: '내용', wide: true }, { k: 'source', label: '출처' }], { add: '+ 메모' })}</fieldset>`;
    return `${head(`호환성 ${d.date || ''}`)}<form class="editor" data-form="editor" autocomplete="off">${body}${foot}</form>`;
  }
  if (e.col === 'refs') {
    const docs = core().collection('docs').list();
    body = `<fieldset><legend>공통 자료</legend><div class="grid-3">${input('title', d.title, { label: '제목', req: true })}
      <label class="fld"><span>종류</span><select name="kind">${[['faq', '공통 FAQ (홈 바로 가기)'], ['signing', '파일 서명 (홈 바로 가기)'], ['other', '기타']].map(([k, t]) => `<option value="${k}" ${d.kind === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      ${input('order', d.order, { label: '순서', dt: 'num', type: 'number' })}
      <label class="fld"><span>보이는 범위</span><select name="tier"><option value="customer" ${(d.tier || 'customer') === 'customer' ? 'selected' : ''}>유지보수고객부터</option><option value="team" ${d.tier === 'team' ? 'selected' : ''}>컨설팅팀원부터</option></select></label></div>
      ${area('body', d.body, { label: '설명 (마크다운, 없어도 됨)', rows: 3 })}
      <div class="fld"><span>파일</span><div class="checks">${docs.map(f => `<label class="chk"><input type="checkbox" name="files[]" value="${esc(f.id)}" ${(d.files || []).includes(f.id) ? 'checked' : ''}> ${esc(f.name)}</label>`).join('')}</div></div></fieldset>
      <fieldset><legend>링크</legend>${rows('links', d.links, [{ k: 'label', label: '이름' }, { k: 'url', label: '주소', type: 'url', wide: true }, { k: 'note', label: '메모' }], { add: '+ 링크' })}</fieldset>`;
    return `${head(d.title || '새 자료')}<form class="editor" data-form="editor" autocomplete="off">${body}${foot}</form>`;
  }
  if (e.col === 'settings') {
    const l = d.latest || {};
    body = `<fieldset><legend>홈 · 최신 패치 파일</legend>${input('latest.title', l.title, { label: '제목' })}
      <div class="grid-3">${input('latest.hub.label', l.hub?.label, { label: '안내 링크 이름', ph: '🔗' })}${input('latest.hub.url', l.hub?.url, { label: '안내 링크 주소', type: 'url' })}<label class="chk"><input type="checkbox" name="latest.hub.icon" ${l.hub?.icon ? 'checked' : ''}> 🔗 아이콘만</label></div>
      ${rows('latest.items', l.items, [{ k: 'label', label: '이름', ph: '8.0' }, { k: 'url', label: '주소', type: 'url', wide: true }, { k: 'ver.min', label: '버전 이상', type: 'ver' }, { k: 'ver.max', label: '버전 이하', type: 'ver' }], { add: '+ 링크' })}
      ${input('latest.note', l.note, { label: '메모', ph: '→ 26’ 11/6 기준 최신 패치 파일' })}</fieldset>`;
    return `${head('홈 · 최신 패치 파일')}<form class="editor" data-form="editor" autocomplete="off">${body}${foot}</form>`;
  }
  return '<p>알 수 없는 편집기</p>';
}

export { fmtRange };
