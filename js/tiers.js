// forcsoz 권한 단계 — 공용 core/access.js (ACCESS-SPEC.md, jayangchild-site 에서 복사) 위에 이 사이트의 역할과 내용 나누기
//
// 역할 (아이디 + 코드 하나로 로그인, 역할은 자리(slot)가 정한다):
//   공개 public        기술공지: 패치 번호·제목·기술공지 링크·대상 제품(매트릭스)·패치 버전 규칙 → 평문
//   유지보수고객       + 다운로드 링크, 고객 가이드 문서, 고객 FAQ, 공통 FAQ, 최신 패치 파일, 제품 도움말
//     customer          모든 제품. 아이디 = 고객 ID(회사 DB), 코드 = 인증번호
//     c_<제품>          제품 하나만 (CSV 에 제품 칸이 있으면). 공통 자료(cust)는 함께 보인다
//   컨설팅팀원 staff   + 대응이력, 컨설팅 참고, 참고 문서, 호환성, 확인 필요, 파일 서명, 최근 변경 (아이디 = @forcs.com 주소)
//   작성자 writer      + 편집·게시 (꾸러미에 공개 저장소 쓰기 토큰, writer 등급 항목에 데이터 저장소 열쇠)
//   관리자 admin       + 사람·권한 (oz@ 계정)
//
// 내용은 관리자 데이터(core, 비공개 저장소)에 있고, "게시"가 등급마다 항목으로 나눠 access.publish 로 올린다:
//   public/pub · cust/common · c_<제품>/patches · customer/patches(제품 등급이 없는 제품) · staff/team · writer/vault
// PDF·PPTX 는 files.js 로 forcsoz/files-N 에 파일마다 다른 키로 올리고, 그 키는 위 항목 안에만 둔다 (열쇠를 바꿔도 파일은 그대로).

import { createAccess } from './core/access.js';
import { canon } from './core/merge.js';
import { sourceFromCore } from './model.js';

// 제품별 등급은 설정 때 열쇠가 만들어지므로 고정 목록이다. 나중에 생긴 제품은 'customer'(모든 제품) 등급으로 간다
export const PRODUCT_TIERS = {
  'server-servlet': 'Server (servlet)', 'server-net': 'Server (.net)', scheduler: 'Scheduler', html5manager: 'Html5Manager', applet: 'Applet Module',
  'html5-viewer': 'HTML5 Viewer', 'exe-viewer': 'EXE Viewer', 'android-viewer': 'Android Viewer', 'ios-viewer': 'iOS Viewer',
  weblauncher: 'WebLauncher', webagent: 'WebAgent', ztransferx: 'ZtransferX',
};
export const tierOfProduct = pid => (PRODUCT_TIERS[pid] ? `c_${pid.replace(/-/g, '_')}` : null);
const productOfTier = t => Object.keys(PRODUCT_TIERS).find(p => tierOfProduct(p) === t) || null;

export const ROLES = [
  { id: 'public' },
  { id: 'cust', name: '유지보수고객 (공통)', inherits: ['public'] },
  ...Object.entries(PRODUCT_TIERS).map(([p, n]) => ({ id: tierOfProduct(p), name: `유지보수고객 · ${n}`, inherits: ['cust'] })),
  { id: 'customer', name: '유지보수고객', inherits: Object.keys(PRODUCT_TIERS).map(tierOfProduct) },
  { id: 'staff', name: '컨설팅팀원', inherits: ['customer'] },
  { id: 'writer', name: '작성자', inherits: ['staff'], write: true },
  { id: 'admin', name: '관리자', inherits: ['writer'], write: true, admin: true },
];

export const SITE_REPO = { owner: 'forcsoz', repo: 'forcsoz.github.io' };
export const SITE_URL = 'https://forcsoz.github.io/';
export const TEAM_DOMAIN = 'forcs.com';
export const CONFIG = {
  site: 'forcsoz', title: 'OZ 보안 패치 (FORCS 컨설팅)', owner: SITE_REPO.owner, repo: SITE_REPO.repo, siteUrl: SITE_URL, roles: ROLES,
  files: { repos: true, prefix: 'forcsoz-files' }, // access.publishFile 은 쓰지 않는다 (파일은 files.js)
};
export const makeAccess = (opts = {}, cfg = {}) => createAccess({ ...CONFIG, ...cfg }, opts);

// 화면이 쓰는 역할 이름 (access 역할 → 화면 단계)
export function viewRoleOf(role) {
  if (!role || role === 'public') return 'public';
  if (role === 'cust' || role === 'customer' || /^c_/.test(role)) return 'customer';
  if (role === 'staff') return 'team';
  return role === 'writer' ? 'writer' : role === 'admin' ? 'admin' : 'public';
}
const LABEL = { public: '공개', customer: '유지보수고객', team: '컨설팅팀원', writer: '작성자', admin: '관리자' };
export const roleLabel = id => LABEL[id] || ROLES.find(r => r.id === id)?.name || id;
export const RANK = { public: 0, customer: 1, team: 2, writer: 3, admin: 4 };
export const atLeast = (role, need) => (RANK[role] ?? 0) >= RANK[need];

const PUBLIC_PATCH = ['id', 'code', 'title', 'short', 'noticeUrl', 'noticeDate', 'noticeDateGuess', 'products', 'productsText', 'ruleText', 'ruleDetails', 'rules', 'extras', 'order'];
const CUSTOMER_PATCH = ['downloads', 'guideNote', 'guides', 'faq'];
const TEAM_PATCH = ['history', 'notes', 'notePages', 'checks'];
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));

// 전체 원본(관리자 데이터) → [{ tier, id, data }]
export function splitContent(src) {
  const fileEntry = id => (src.files[id] ? { [id]: src.files[id] } : {});
  const items = [];
  items.push({ tier: 'public', id: 'pub', data: { products: src.products.map(p => { const { hints, ...rest } = p; return rest; }), patches: src.patches.map(p => pick(p, PUBLIC_PATCH)) } });
  const custRefs = src.refs.filter(r => (r.tier || 'customer') === 'customer');
  const commonFiles = {};
  for (const r of custRefs) for (const f of r.files || []) Object.assign(commonFiles, fileEntry(f));
  items.push({ tier: 'cust', id: 'common', data: { home: src.home || {}, refs: custRefs, hints: Object.fromEntries(src.products.filter(p => p.hints?.length).map(p => [p.id, p.hints])), files: commonFiles } });
  const used = new Set(Object.keys(commonFiles));
  const parts = new Map(); // tier → { patches }
  for (const t of [...Object.keys(PRODUCT_TIERS).map(tierOfProduct), 'customer']) parts.set(t, {});
  for (const p of src.patches) {
    const files = {};
    for (const g of p.guides || []) for (const it of g.items || []) { Object.assign(files, fileEntry(it.file)); used.add(it.file); }
    const part = { id: p.id, ...pick(p, CUSTOMER_PATCH), files };
    const tiers = new Set((p.products || []).map(x => tierOfProduct(x) || 'customer'));
    if (!tiers.size) tiers.add('customer');
    for (const t of tiers) parts.get(t)[p.id] = part;
  }
  for (const [t, patches] of parts) items.push({ tier: t, id: 'patches', data: { patches } });
  const teamFiles = {};
  for (const id of Object.keys(src.files)) if (!used.has(id)) Object.assign(teamFiles, fileEntry(id));
  const teamRefs = src.refs.filter(r => r.tier === 'team');
  items.push({
    tier: 'staff', id: 'team',
    data: { patches: Object.fromEntries(src.patches.map(p => [p.id, pick(p, TEAM_PATCH)])), notes: src.notes, compat: src.compat, refs: teamRefs, changes: src.changes, links: src.links, files: teamFiles },
  });
  return items;
}

// 열린 항목들 { '<등급>/<id>': data } → 화면 모델 원본
export function assemble(open, meta = {}) {
  const pub = open['public/pub'];
  const common = open['cust/common'];
  const team = open['staff/team'];
  const custParts = {};
  for (const [k, v] of Object.entries(open)) if (/\/patches$/.test(k)) Object.assign(custParts, v.patches || {});
  const files = { ...(common?.files || {}), ...(team?.files || {}) };
  const patches = (pub?.patches || []).map(p => {
    const c = custParts[p.id];
    if (c) Object.assign(files, c.files || {});
    return { ...p, ...(c ? pick(c, CUSTOMER_PATCH) : {}), ...(team?.patches?.[p.id] || {}), _locked: !c };
  });
  return {
    products: (pub?.products || []).map(p => ({ ...p, ...(common?.hints?.[p.id] ? { hints: common.hints[p.id] } : {}) })),
    patches,
    notes: team?.notes || [], compat: team?.compat || [], refs: [...(common?.refs || []), ...(team?.refs || [])],
    home: common?.home || {}, files, changes: team?.changes || [], links: team?.links || {},
    publishedAt: meta.publishedAt || '', publishedBy: meta.publishedBy || '', rev: meta.rev || '',
  };
}

// 이 화면 단계(·제품)로 보면 무엇이 보이나 — 관리자 미리 보기 (게시와 같은 규칙, 암호화 없이)
export function previewAs(src, viewRole, productScope = '') {
  if (viewRole === 'admin' || viewRole === 'writer') return src;
  const role = viewRole === 'public' ? 'public' : viewRole === 'team' ? 'staff' : productScope ? tierOfProduct(productScope) || 'customer' : 'customer';
  const tiers = new Set(closure(role));
  const open = {};
  for (const it of splitContent(src)) if (tiers.has(it.tier)) open[`${it.tier}/${it.id}`] = it.data;
  return assemble(open, { publishedAt: src.publishedAt });
}
function closure(role) {
  const by = new Map(ROLES.map(r => [r.id, r]));
  const seen = new Set();
  const walk = id => { if (seen.has(id)) return; seen.add(id); for (const p of by.get(id)?.inherits || []) walk(p); };
  walk(role);
  seen.add('public');
  return [...seen];
}

// ---------- 게시 ----------
async function sha(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

export function createPublisher({ core, access }) {
  const settings = () => core.collection('settings');

  function items() {
    const src = sourceFromCore(core);
    delete src.publishedAt; delete src.publishedBy; delete src.rev;
    for (const f of Object.values(src.files)) { delete f.updatedAt; delete f.updatedBy; }
    const list = splitContent(src);
    // 작성자가 이 데이터 저장소(core)를 열 수 있게: writer 등급 항목에 데이터 열쇠 (관리자 꾸러미에는 access 가 따로 넣는다)
    list.push({ tier: 'writer', id: 'vault', data: { vault: core.vaultKey() } });
    return list;
  }

  async function plan() {
    const prev = settings().get('published')?.hashes || {};
    const out = [];
    for (const it of items()) {
      const h = await sha(canon(it.data));
      if (prev[`${it.tier}/${it.id}`] !== h) out.push({ ...it, hash: h });
    }
    return out;
  }

  async function state() {
    const p = settings().get('published');
    const todo = await plan();
    const since = p?.at || '';
    return { configured: !!p?.at, dirty: todo.length > 0, todo: todo.map(t => `${t.tier}/${t.id}`), publishedAt: since, publishedBy: p?.by || '', pendingChanges: core.collection('changes').list().filter(c => (c.at || '') > since).length };
  }

  let running = null;
  function publish(opts) {
    if (!running) running = doPublish(opts).finally(() => { running = null; });
    return running;
  }
  async function doPublish({ force = false } = {}) {
    if (!access.me()?.canWrite) throw Object.assign(new Error('게시는 작성자·관리자로 로그인해야 해요.'), { code: 'read-only' });
    await core.sync();
    const prev = settings().get('published') || { id: 'published', hashes: {} };
    const todo = force ? await Promise.all(items().map(async it => ({ ...it, hash: await sha(canon(it.data)) }))) : await plan();
    const hashes = { ...(prev.hashes || {}) };
    for (const it of todo) {
      await access.publish({ id: it.id, tier: it.tier, data: it.data });
      hashes[`${it.tier}/${it.id}`] = it.hash;
      await settings().put({ ...prev, id: 'published', hashes }); // 하나씩 기록 (끊겨도 다음에 이어서)
    }
    const at = new Date().toISOString();
    await settings().put({ ...settings().get('published'), id: 'published', hashes, at: todo.length ? at : prev.at, by: todo.length ? core.status().user || '' : prev.by });
    core.sync().catch(() => {});
    return { changed: todo.length, items: todo.map(t => `${t.tier}/${t.id}`) };
  }

  return { items, plan, state, publish };
}

// ---------- CSV (유지보수고객: 고객 ID + 인증번호) ----------
// 칸: 고객ID(필수, 로그인 아이디) · 인증번호(필수) · 고객(이름, 선택) · 제품(선택, 하나 — 여러 개면 모든 제품으로)
export function parseCustomerCsv(text, products) {
  const rows = String(text || '').replace(/^﻿/, '').split(/\r?\n/).map(splitCsv).filter(r => r.some(c => c.trim()));
  if (!rows.length) return { rows: [], errors: ['비어 있어요.'], hasProducts: false };
  const head = rows[0].map(c => c.trim().toLowerCase().replace(/\s+/g, ''));
  const find = (...names) => head.findIndex(h => names.some(n => h === n || h.includes(n)));
  const iNum = find('인증번호', 'code', 'number', 'secret');
  const iId = find('고객id', '아이디', 'id', 'login', '고객번호', '사업자');
  const iLabel = find('고객명', '회사', 'name', '이름', 'label', '고객');
  const iProd = find('제품', 'product');
  const errors = [];
  if (iNum < 0 || iId < 0) return { rows: [], errors: ['첫 줄(머리글)에 "고객ID" 와 "인증번호" 칸이 있어야 해요. 인증번호만으로는 로그인 자리를 만들 수 없어요 (번호가 새어 나가지 않게).'], hasProducts: false };
  const byName = new Map();
  for (const p of products) for (const n of [p.id, p.name, ...(p.aliases || [])]) byName.set(String(n).toLowerCase().replace(/\s+/g, ''), p.id);
  const out = [];
  for (const [i, r] of rows.slice(1).entries()) {
    const line = i + 2;
    const id = (r[iId] || '').trim();
    const number = (r[iNum] || '').trim();
    if (!id || !number) { errors.push(`${line}줄: 고객ID 나 인증번호가 비어 있어요.`); continue; }
    const scope = [];
    if (iProd >= 0 && r[iProd]) {
      for (const n of r[iProd].split(/[;|/]/).map(s => s.trim()).filter(Boolean)) {
        const pid = byName.get(n.toLowerCase().replace(/\s+/g, ''));
        if (pid) scope.push(pid); else errors.push(`${line}줄: 모르는 제품 "${n}"`);
      }
    }
    out.push({ id, number, label: iLabel >= 0 && iLabel !== iId ? (r[iLabel] || '').trim() : '', products: [...new Set(scope)], line });
  }
  return { rows: out, errors, hasProducts: iProd >= 0 };
}
function splitCsv(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',' || ch === '\t') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

// 고객 한 줄 → access 역할 (제품 하나면 그 제품 등급, 아니면 모든 제품)
export const customerRole = row => (row.products?.length === 1 && tierOfProduct(row.products[0])) || 'customer';

// CSV 가져오기: 한 줄마다 admin.addPerson({ identifier: 고객ID, code: 인증번호 }) — 공용 access 가 40비트 미만이면 weak-code
export async function importCustomers(admin, rows, { acceptWeak = false, onProgress = () => {} } = {}) {
  const rep = { added: [], weak: [], duplicate: [], failed: [], multi: 0 };
  for (const [i, r] of rows.entries()) {
    onProgress(i, rows.length);
    if (r.products.length > 1) rep.multi++;
    try {
      const res = await admin.addPerson({ name: r.label || r.id, identifier: r.id, role: customerRole(r), code: r.number, acceptWeak });
      rep.added.push({ pid: res.person.id, bits: res.bits, weak: res.weak, line: r.line });
      if (res.weak) rep.weak.push(r.line);
    } catch (e) {
      if (e.code === 'weak-code') rep.weak.push(r.line);
      else if (e.code === 'duplicate') rep.duplicate.push(r.line);
      else rep.failed.push(`${r.line}줄: ${e.message}`);
    }
  }
  onProgress(rows.length, rows.length);
  return rep;
}
