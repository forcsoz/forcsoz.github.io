// test.html 의 시험들. node tools/run-tests.mjs 로 헤드리스 Edge 에서 돈다 (FORCSOZ_SEED 가 있으면 실제 seed 로도).
// 시험 자료(제품·패치·사람·번호)는 모두 지어낸 것.
import { createCore } from './js/core/core.js';
import { FakeGitHub } from './js/core/fake-backend.js';
import * as C from './js/core/crypto.js';
import { makeAccess, createPublisher, previewAs, parseCustomerCsv, importCustomers, customerRole, viewRoleOf, splitContent } from './js/tiers.js';
import { createSite } from './js/site.js';
import { createAdmin } from './js/admin.js';
import { readEntry, sha256hex } from './js/files.js';
import { buildModel, sourceFromCore, searchDocs, search } from './js/model.js';
import { parseVersion, parseBuild, parseFull, cmpBuild, parseRuleText, check, answerText, encodeRows, decodeRows } from './js/rules.js';
import { weakReasons } from './js/tier.js';
import { estimateBits } from './js/entropy.js';
import { md } from './js/md.js';

const out = document.getElementById('out');
const results = [];
function report(name, ok, detail = '') {
  results.push({ name, ok, detail });
  const li = document.createElement('li');
  li.className = ok ? 'ok' : 'bad';
  li.textContent = `${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`;
  out.append(li);
}
const log = t => { document.getElementById('log').textContent += `${t}\n`; };
const assert = (c, m) => { if (!c) throw new Error(m); };
const sortObj = o => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
const eq = (a, b, m) => assert(JSON.stringify(a) === JSON.stringify(b), `${m}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
async function rejects(p, code, m) {
  try { await (typeof p === 'function' ? p() : p); } catch (e) { assert(!code || e.code === code, `${m}: 오류 코드 ${e.code} (기대 ${code}) ${e.message}`); return e; }
  throw new Error(`${m}: 오류가 나야 하는데 안 났어요`);
}
async function test(name, fn) {
  const t0 = performance.now();
  try { await fn(); report(name, true, `${Math.round(performance.now() - t0)}ms`); } catch (e) { console.error(e); report(name, false, e.message); }
}
const td = new TextDecoder();
const RUN = Date.now().toString(36);
const dbs = [];
const ITER = 2000; // 시험을 빠르게 (실제 60만)

// ---------- 가짜 GitHub 세계 ----------
function world(tag) {
  const gh = new FakeGitHub({ owner: 'forcsoz', tokens: ['tok-1', 'tok-2'], creators: ['tok-1', 'tok-2'] });
  gh.repo('forcsoz-data', { isPublic: false });
  const site = gh.repo('forcsoz.github.io', { isPublic: true });
  site.files.set('index.html', { sha: 'sha0', bytes: C.utf8('<!doctype html>') });
  site.addCommit('init', ['index.html']);
  const read = async (n, path) => { const b = gh.repos.has(`files-${n}`) ? gh.repo(`files-${n}`).read(path) : null; if (!b) throw Object.assign(new Error('없음'), { status: 404 }); return b; };
  const account = token => ({
    async repoInfo(name) { return gh.repos.has(name) ? { private: !gh.repo(name).isPublic, size: 0, branch: 'main' } : null; },
    async createRepo(name) { await gh.createRepoBy(token, name); return this.repoInfo(name); },
  });
  const mkCore = who => { const n = `fz-t-${RUN}-${tag}-${who}-core`; dbs.push(n); return createCore({ dbName: n, backend: (t, dev) => gh.client(t, dev.repo), account, autoSync: false, user: who }); };
  const mkAccess = who => { const n = `fz-t-${RUN}-${tag}-${who}-ax`; dbs.push(n); return makeAccess({ reader: gh.reader('forcsoz.github.io'), backendFor: (token, r) => gh.client(token, r.repo), kvName: n }, { iter: ITER }); };
  const device = who => { const access = mkAccess(who); return { access, site: createSite({ access }) }; };
  const siteAll = () => [...site.files].map(([p, f]) => `${p}\n${td.decode(f.bytes)}`).join('\n');
  return { gh, site, read, mkCore, mkAccess, device, siteAll };
}

// ---------- 1. 규칙 (지어낸 글) ----------
await test('버전·빌드 읽기: 8.0 / 8 / 80 / 1.0 / 10, 2026.0315(.100) · 20260315 · 2026-3-15, 붙여 쓴 값', async () => {
  eq(['8.0', '8', '80', '9.0', '5.1', '1.0', '10', '', 'x'].map(parseVersion), [80, 80, 80, 90, 51, 10, 10, null, null], '버전');
  eq(['2026.0315', '20260315', '2026-03-15', '2026.3.15', '2026.0315.100', '2026.1399', 'abc'].map(s => parseBuild(s)?.text ?? null), ['2026.0315', '2026.0315', '2026.0315', '2026.0315', '2026.0315.100', null, null], '빌드');
  eq(parseFull('80.2026.0315.100'), { ver: 80, build: parseBuild('2026.0315.100') }, '붙여 쓴 값');
  eq(parseFull('8.0 2026.0315').ver, 80, '빈칸으로 붙여 쓴 값');
  eq(cmpBuild(parseBuild('2026.0315'), parseBuild('2026.0314')), 1, '뒤 날짜');
  eq(cmpBuild(parseBuild('2026.0315'), parseBuild('2026.0315')), 0, '같은 날 = 적용됨');
  eq(cmpBuild(parseBuild('2026.0315'), parseBuild('2026.0315.100')), null, '기준에 뒤 번호가 있고 입력에 없으면 정할 수 없음');
  eq(cmpBuild(parseBuild('2026.0315.050'), parseBuild('2026.0315.100')), -1, '뒤 번호 비교');
});

await test('규칙 글 → 구조: "N이상 빌드 이후", "N 빌드 이후 / M 빌드 이후", "N이하"', async () => {
  eq(parseRuleText('80이상 2026.0101 이후').rules, [{ min: 80, max: null, build: '2026.0101' }], '이상');
  eq(parseRuleText('80 2026.1002 이후 / 90 2026.1006 이후').rules, [{ min: 80, max: 80, build: '2026.1002' }, { min: 90, max: 90, build: '2026.1006' }], '두 개');
  eq(parseRuleText('70이하 2026.0101 이후').rules, [{ min: null, max: 70, build: '2026.0101' }], '이하');
  eq(parseRuleText('10이상 2026.0618 이후').rules[0].min, 10, 'WebAgent 꼴');
  eq(parseRuleText('어떤 글').errors, ['어떤 글'], '못 읽은 부분');
});

const FAKE = {
  products: [
    { id: 'server-servlet', name: 'Server (servlet)', group: '서버', versionKind: 'oz', order: 1 },
    { id: 'html5-viewer', name: 'HTML5 Viewer', group: '뷰어', versionKind: 'oz', order: 2 },
    { id: 'webagent', name: 'WebAgent', group: '설치형', versionKind: 'agent', order: 3, hints: [{ text: '시험 도움말', source: '시험' }] },
  ],
  patches: [
    { id: 'T_001', code: 'T_001', title: '시험 패치 하나', products: ['server-servlet', 'html5-viewer'], ruleText: '80이상 2026.0301 이후', rules: [{ min: 80, max: null, build: '2026.0301' }],
      downloads: { hub: null, items: [{ label: '8.0', url: 'https://example.test/dl/t1-80', ver: { min: 80, max: 80 } }, { label: '9.0', url: 'https://example.test/dl/t1-90', ver: { min: 90, max: 90 } }], note: '' },
      guides: [{ title: '', products: null, items: [{ label: '시험 가이드', file: 'F1', ver: { min: 80, max: 90 } }] }],
      history: [{ label: '시험 고객목록', url: 'https://intra.example.test/secret-history' }], notes: [{ label: '시험 사내 메모', url: 'https://intra.example.test/secret-note' }], checks: [{ text: '시험 확인 메모 비밀', source: '시험' }], order: 1 },
    { id: 'T_002', code: 'T_002', title: '시험 패치 둘 (설치형)', products: ['webagent'], ruleText: '10이상 2026.0500 이후', rules: [{ min: 10, max: null, build: '2026.0500' }],
      downloads: { hub: null, items: [{ label: 'WebAgent', url: 'https://example.test/dl/t2', ver: null }], note: '' }, guides: [], history: [], notes: [], checks: [], order: 2 },
    { id: 'T_003', code: 'T_003', title: '시험 패치 셋', products: ['server-servlet'], ruleText: '80 2026.0601 이후 / 90 2026.0611 이후', rules: [{ min: 80, max: 80, build: '2026.0601' }, { min: 90, max: 90, build: '2026.0611' }],
      extras: [{ label: '시험 권장', build: '2026.0701.100', min: 80, max: null }], downloads: null, guides: [], history: [], notes: [], checks: [], order: 3 },
  ],
  compat: [{ id: 'cp1', date: '2026-01-01', body: '서버와 뷰어를 같이 패치 [시험 버그](https://intra.example.test/bug)', version: '80이상', products: ['server-servlet', 'html5-viewer'], order: 1 }],
  notes: [{ id: 'n1', title: '시험 참고 문서', patch: 'T_001', body: '### 비밀 절차\n1. 시험 단계' }],
  refs: [{ id: 'r1', title: '시험 공통 FAQ', kind: 'faq', tier: 'customer', files: ['F2'], links: [], body: '', order: 1 }, { id: 'r2', title: '시험 내부 서명', kind: 'signing', tier: 'team', files: ['F3'], links: [{ label: '사내 도구', url: 'https://intra.example.test/sign' }], body: '', order: 2 }],
  home: { id: 'home', latest: { title: '최신 패치 파일', hub: null, items: [{ label: '8.0', url: 'https://example.test/dl/all-80', ver: { min: 80, max: 80 } }], note: '' } },
};
const SECRETS = ['https://example.test/dl/t1-80', 'intra.example.test', '시험 확인 메모 비밀', '비밀 절차', '시험 고객목록'];

await test('패치 확인: 지어낸 규칙으로 필요·적용됨·확인 필요, 다운로드·가이드 고르기, 답 글', async () => {
  const m = buildModel({ products: FAKE.products, patches: FAKE.patches, compat: FAKE.compat, home: FAKE.home, files: { F1: { name: '시험가이드.pdf', type: 'application/pdf' } } });
  const r = check(m, [{ product: 'server-servlet', ver: 80, build: parseBuild('2026.0415') }]);
  const st = Object.fromEntries(r.rows[0].items.map(i => [i.patch.code, i.status]));
  eq(sortObj(st), { T_001: 'ok', T_003: 'missing' }, '서블릿 8.0 0415');
  eq(r.rows[0].items.find(i => i.patch.code === 'T_001').downloads.items.map(d => d.label), ['8.0'], '8.0 다운로드만');
  const r2 = check(m, [{ product: 'server-servlet', ver: 90, build: parseBuild('2026.0611') }, { product: 'webagent', ver: 10, build: null }, { product: 'server-servlet', ver: 70, build: parseBuild('2026.0101') }]);
  eq(r2.rows[0].items.map(i => i.status), ['ok', 'ok'], '9.0 경계 = 적용됨');
  eq(r2.rows[1].items[0].status, 'unknown', '빌드 없으면 확인 필요');
  eq(r2.rows[2].items.map(i => i.status), ['unknown', 'unknown'], '규칙 밖 버전(7.0)은 확인 필요');
  eq(r2.compat.length, 1, '호환성 경고');
  const r3 = check(m, [{ product: 'server-servlet', ver: 80, build: parseBuild('2026.0601.001') }]);
  assert(r3.rows[0].items.find(i => i.patch.code === 'T_003').extras[0].need, '권장 빌드 표시');
  const text = answerText(m, r, { format: 'mail', customer: '시험고객' });
  assert(text.includes('패치 필요: [T_003]') && text.includes('시험고객') && !text.includes('intra.example.test'), '메일 답');
  assert(answerText(m, r, { format: 'chat' }).includes('필요한 패치: T_003'), '메신저 답');
  const q = encodeRows([{ product: 'server-servlet', ver: 80, build: parseBuild('2026.0415') }], 70);
  eq(decodeRows(q).rows[0].build.text, '2026.0415', '주소로 왕복');
});

await test('약한 비밀문장 경고 · 인증번호 목록 강도 (순서대로 발급된 번호 잡기)', async () => {
  assert(weakReasons('forcs1234').length >= 2, '약함');
  eq(weakReasons('봄비-기린-리코더-등대-42'), [], '강함');
  const seq = Array.from({ length: 50 }, (_, i) => `OZ2026${String(1000 + i).padStart(6, '0')}`);
  const e1 = estimateBits(seq);
  assert(e1.sequential && e1.bits < 40, `순번 ${JSON.stringify(e1)}`);
  const rnd = Array.from({ length: 50 }, () => [...crypto.getRandomValues(new Uint8Array(12))].map(b => '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[b % 32]).join(''));
  assert(estimateBits(rnd).bits >= 40, '무작위 12자');
  const parsed = parseCustomerCsv('고객ID,인증번호,고객명,제품\nC-1,Q7RK29XMHT4P,가회사,Server (servlet)\nC-2,M3VD8KQTZP2X,나회사,HTML5 Viewer;WebAgent\nC-3,,다회사,', FAKE.products);
  eq(parsed.rows.map(r => [r.id, r.products]), [['C-1', ['server-servlet']], ['C-2', ['html5-viewer', 'webagent']]], 'CSV');
  eq(parsed.errors.length, 1, '빈 번호 줄');
  eq(parsed.rows.map(customerRole), ['c_server_servlet', 'customer'], '제품 하나면 그 제품 등급');
  assert(parseCustomerCsv('인증번호\n12345678', FAKE.products).errors[0].includes('고객ID'), '아이디 칸 없으면 거부');
});

await test('마크다운: 글자는 이스케이프, http(s) 링크만', async () => {
  const h = md('**굵게** `code` [ok](https://a.test) [bad](javascript:alert(1)) <img src=x onerror=1>\n- 하나\n  - 둘\n> 상자');
  assert(h.includes('<b>굵게</b>') && h.includes('href="https://a.test"') && !/href="javascript/.test(h) && !h.includes('<img') && h.includes('<div class="callout">'), h);
});

// ---------- 2. 권한 단계 전체 (지어낸 자료) ----------
const W = world('a');
let core; let admin; let pub; let adm; let ax; let codes = {}; const files = {}; const bytesOf = {};
const randomBytes = n => { const u = new Uint8Array(n); for (let i = 0; i < n; i += 65536) crypto.getRandomValues(u.subarray(i, Math.min(n, i + 65536))); return u; };

await test('관리자 설정: core + access.setup → 관리자 코드·명단 복구 코드, 자료 넣기, 파일 암호화해 올리기(조각 여러 개)', async () => {
  core = W.mkCore('관리자');
  ax = W.mkAccess('admin');
  await core.setup('tok-1', 'data-pass-1234', { user: '관리자' });
  const res = await ax.setup(core, { token: 'tok-1', name: '관리자', identifier: 'oz@forcs.com' });
  adm = res.admin;
  codes.admin = res.code;
  assert(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(res.code), `코드 모양 ${res.code}`);
  admin = createAdmin({ core, files: { read: W.read, chunk: 64 * 1024, limit: 600e3 } });
  pub = createPublisher({ core, access: ax });
  for (const [k, n] of [['F1', 300e3], ['F2', 100e3], ['F3', 50e3]]) {
    bytesOf[k] = randomBytes(n);
    const rec = await admin.uploadDoc(new File([bytesOf[k]], `${k}.dat`, { type: 'application/octet-stream' }), { name: `${k}-시험.dat` });
    files[k] = rec.id;
  }
  assert(core.collection('docs').get(files.F1).parts === 5, `조각 수 ${core.collection('docs').get(files.F1).parts}`);
  const fix = o => JSON.parse(JSON.stringify(o).replace(/"F([123])"/g, (_, d) => `"${files[`F${d}`]}"`));
  for (const p of FAKE.products) await admin.save('products', p);
  for (const p of FAKE.patches) await admin.save('patches', fix(p));
  for (const c of FAKE.compat) await admin.save('compat', c);
  for (const n of FAKE.notes) await admin.save('notes', n);
  for (const r of FAKE.refs) await admin.save('refs', fix(r));
  await admin.save('settings', FAKE.home);
  const ch = core.collection('changes').list();
  assert(ch.length >= 12 && ch.every(c => c.by === '관리자'), `변경 기록 ${ch.length}`);
  assert(W.gh.repos.has('files-1'), '파일 저장소 files-1');
});

await test('사람: 팀원·작성자(@forcs.com 주소마다 코드+초대 글), 고객 인증번호(고객 ID 필요), 40비트 미만은 weak-code', async () => {
  const t = await adm.addPerson({ name: '시험 팀원', identifier: 'Team.Tester@forcs.com', role: 'staff' });
  assert(t.invitation.includes(t.code) && t.invitation.includes('Team.Tester@forcs.com'), '초대 글');
  codes.team = t.code;
  codes.writer = (await adm.addPerson({ name: '시험 작성자', identifier: 'writer.tester@forcs.com', role: 'writer' })).code;
  const rows = parseCustomerCsv('고객ID,인증번호,고객명,제품\nCUST-ALL,Q7RK-29XM-HT4P-WZ6D,가회사,\nCUST-SRV,M3VD-8KQT-ZP2X-LR9C,나회사,Server (servlet)\nCUST-WEAK,20261234,다회사,', FAKE.products).rows;
  const rep = await importCustomers(adm, rows);
  eq([rep.added.length, rep.weak], [2, [4]], '약한 번호 줄은 거부');
  const rep2 = await importCustomers(adm, rows.slice(2), { acceptWeak: true });
  assert(rep2.added.length === 1 && rep2.added[0].weak && rep2.added[0].bits < 40, '알고 받기(acceptWeak)');
  await rejects(() => adm.addPerson({ name: 'x', identifier: 'CUST-ALL', role: 'customer', code: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ' }), 'duplicate', '같은 고객 ID');
  codes.custAll = 'Q7RK-29XM-HT4P-WZ6D';
  codes.custSrv = 'm3vd 8kqt zp2x lr9c'; // 대소문자·띄어쓰기 상관없음
});

await test('게시: 등급마다 항목 → 공개는 평문(기술공지만), 나머지는 암호문, keyring 에 아이디·이름 없음', async () => {
  const r = await pub.publish();
  assert(r.changed >= 6, `게시 ${JSON.stringify(r)}`);
  eq((await pub.publish()).changed, 0, '바뀐 것 없으면 0');
  const all = W.siteAll();
  assert(all.includes('시험 패치 하나'), '공개 목록에 제목(기술공지)');
  for (const s of SECRETS) assert(!all.includes(s), `공개 저장소 글자에 "${s}"`);
  for (const s of ['Team.Tester', 'team.tester', 'CUST-ALL', '나회사', 'Q7RK']) assert(!all.includes(s), `keyring 에 "${s}"`);
  const pubIdx = JSON.parse(td.decode(W.site.files.get('access/public/index.json').bytes));
  const pubData = JSON.stringify(pubIdx);
  assert(!pubData.includes('downloads') && !pubData.includes('history'), '공개 항목에 다운로드·대응이력 칸 없음');
  for (const fr of ['files-1']) for (const [, f] of W.gh.repo(fr).files) assert(!td.decode(f.bytes).includes('PDF'), '파일 저장소는 암호문');
});

const custDev = W.device('cust');
const srvDev = W.device('srv');
const teamDev = W.device('team');
await test('공개(로그인 없음): 기술공지만 — 다운로드·가이드·대응이력 없음', async () => {
  const d = W.device('anon');
  eq(await d.site.load(), 'ok', '게시됨');
  const m = buildModel(d.site.source());
  eq(m.patches.map(p => p.code), ['T_001', 'T_002', 'T_003'], '패치 목록');
  assert(m.patches.every(p => p._locked && !p.downloads && !p.history), '잠김');
  eq(Object.keys(m.files).length, 0, '파일 없음');
  eq(m.notes.length + m.compat.length + m.changes.length, 0, '팀 내용 없음');
});

await test('유지보수고객: 맞는 인증번호로 열림, 틀리면 실패 · 다운로드·가이드·공통 FAQ 보임, 팀 내용은 없음', async () => {
  await custDev.site.load();
  await rejects(() => custDev.site.login('CUST-ALL', 'Q7RK-29XM-HT4P-WZ6E'), 'bad-login', '틀린 번호');
  await rejects(() => custDev.site.login('CUST-NONE', codes.custAll), 'bad-login', '없는 고객 ID');
  const info = await custDev.site.login('cust-all', codes.custAll, { remember: true });
  eq(viewRoleOf(info.role), 'customer', '역할');
  const m = buildModel(custDev.site.source());
  assert(m.patches.every(p => !p._locked && p.downloads !== undefined), '모든 패치 열림');
  eq(m.patchById.get('T_001').downloads.items[0].url, 'https://example.test/dl/t1-80', '다운로드');
  assert(m.files[files.F1] && m.files[files.F2] && !m.files[files.F3], '가이드·공통 FAQ 파일 O, 내부 서명 파일 X');
  assert(!m.patchById.get('T_001').history && !m.notes.length && !m.compat.length, '대응이력·참고·호환성 없음');
  eq(m.productById.get('webagent').hints.length, 1, '제품 도움말');
  assert(!info.canWrite && !info.bundle.token, '고객 꾸러미에 토큰 없음');
});

await test('제품 범위 고객(서버만): 서버 패치만 열리고 설치형 패치는 잠김', async () => {
  await srvDev.site.load();
  const info = await srvDev.site.login('CUST-SRV', codes.custSrv);
  eq(info.role, 'c_server_servlet', '제품 등급');
  const m = buildModel(srvDev.site.source());
  eq(m.patches.map(p => [p.code, p._locked]), [['T_001', false], ['T_002', true], ['T_003', false]], '열린 패치');
  assert(m.files[files.F2], '공통 FAQ 는 보임');
});

await test('컨설팅팀원: 이메일(대소문자 상관없음)+코드, 틀린 코드 실패 · 대응이력·참고·호환성·내부 파일 보임, 토큰 없음', async () => {
  await teamDev.site.load();
  await rejects(() => teamDev.site.login('team.tester@forcs.com', 'AAAA-BBBB-CCCC'), 'bad-login', '틀린 코드');
  const info = await teamDev.site.login('TEAM.TESTER@FORCS.COM', codes.team.toLowerCase(), { remember: true });
  eq(viewRoleOf(info.role), 'team', '역할');
  const m = buildModel(teamDev.site.source());
  eq(m.patchById.get('T_001').history[0].url, 'https://intra.example.test/secret-history', '대응이력');
  assert(m.notes.length === 1 && m.compat.length === 1 && m.files[files.F3] && m.changes.length > 5, '팀 내용');
  assert(!info.canWrite && !info.bundle.token && !teamDev.site.opened['writer/vault'], '토큰·데이터 열쇠 없음');
  assert(search(searchDocs(m), '비밀 절차').length >= 1, '검색: 참고 문서');
});

await test('작성자: 꾸러미에 쓰기 토큰, writer 등급 항목의 데이터 열쇠로 새 기기에서 core 열기 → 고치고 게시', async () => {
  const d = W.device('writer');
  await d.site.load();
  const info = await d.site.login('writer.tester@forcs.com', codes.writer);
  assert(info.canWrite && info.bundle.token === 'tok-1' && !info.isAdmin, '쓰기 역할');
  const v = d.site.opened['writer/vault']?.vault;
  assert(v?.dek && v.token, '데이터 열쇠');
  const c2 = W.mkCore('작성자');
  await c2.openWithKey(v);
  await c2.sync();
  eq(c2.collection('patches').list().length, 3, '작성자가 데이터 저장소를 읽음');
  const a2 = createAdmin({ core: c2, files: { read: W.read } });
  const p = c2.collection('patches').get('T_002');
  await a2.save('patches', { ...p, title: '시험 패치 둘 (작성자가 고침)' });
  const r = await createPublisher({ core: c2, access: d.access }).publish();
  assert(r.changed >= 1, '작성자가 게시');
  await c2.sync();
  await core.sync();
  assert(core.collection('changes').list().some(c => c.by === '작성자'), '변경 기록에 작성자');
  await d.access.logout();
  await c2.lock();
});

await test('파일 왕복: 고객이 받은 PDF(가짜) 바이트가 올린 것과 같음 (SHA-256), 저장소가 차면 files-2', async () => {
  await custDev.site.refresh();
  const m = buildModel(custDev.site.source());
  const blob = await readEntry(files.F1, m.files[files.F1], W.read);
  eq(await sha256hex(new Uint8Array(await blob.arrayBuffer())), await sha256hex(bytesOf.F1), 'F1 같음');
  const big = randomBytes(400e3);
  const rec = await admin.uploadDoc(new File([big], 'F4.dat'), { name: 'F4.dat' });
  eq(rec.repo, 2, '두 번째 파일 저장소');
  assert(W.gh.repos.has('files-2'), 'files-2 만들어짐');
});

await test('코드 새로 발급: 예전 코드·기억한 기기는 못 씀, 새 코드는 됨 (새 개인 열쇠로 다시 암호화)', async () => {
  const before = JSON.parse(td.decode(W.site.files.get('keyring.json').bytes));
  const ppl = await adm.people();
  const tp = ppl.find(p => p.identifier === 'Team.Tester@forcs.com');
  const r = await adm.resetCode(tp.id);
  const after = JSON.parse(td.decode(W.site.files.get('keyring.json').bytes));
  const changed = Object.keys(after.slots).filter(k => JSON.stringify(after.slots[k]) !== JSON.stringify(before.slots[k]));
  eq(changed.length, 1, '그 사람 자리만 다시 암호화');
  await rejects(() => teamDev.access.refresh(), 'revoked', '기억한 기기');
  const d = W.device('team2');
  await d.site.load();
  await rejects(() => d.site.login('team.tester@forcs.com', codes.team), 'bad-login', '예전 코드');
  await d.site.login('team.tester@forcs.com', r.code);
  codes.team = r.code;
});

await test('막기(고객): 자리를 빼고 등급 열쇠를 바꿔 다시 감쌈 → 막힌 사람은 새 내용 못 엶, 남은 사람은 그대로', async () => {
  const ppl = await adm.people();
  const ca = ppl.find(p => p.identifier === 'CUST-ALL');
  const kvBefore = JSON.parse(td.decode(W.site.files.get('access/cust/index.json').bytes)).kv;
  const oldKeys = JSON.parse(JSON.stringify(custDev.access.me().bundle.keys));
  const r = await adm.revoke(ca.id);
  assert(r.rotated.includes('cust') && r.rotated.includes('c_server_servlet'), `바꾼 열쇠 ${r.rotated}`);
  const idx = JSON.parse(td.decode(W.site.files.get('access/cust/index.json').bytes));
  eq(idx.kv, kvBefore + 1, '열쇠 판이 올라감');
  // 막힌 사람의 예전 열쇠로 새 항목 열쇠를 풀 수 없다
  const e = idx.items.common;
  let opened = true;
  try { await C.decryptText(await C.importDEK(C.unb64(oldKeys.cust.k)), e.k, `item:cust:common`); } catch { opened = false; }
  assert(!opened, '예전 열쇠로 못 엶');
  await rejects(() => custDev.site.refresh(), 'revoked', '막힌 기기');
  const d = W.device('cust2');
  await d.site.load();
  await rejects(() => d.site.login('CUST-ALL', codes.custAll), 'bad-login', '막힌 번호');
  await srvDev.site.refresh();
  const m = buildModel(srvDev.site.source());
  assert(!m.patchById.get('T_001')._locked, '남은 고객은 새 열쇠로 그대로');
  const p = (await adm.people()).find(x => x.id === ca.id);
  eq(p.status, 'revoked', '명단에는 "막음"으로 남음 (지우지 않음)');
});

await test('휴지통: 패치를 휴지통에 → 게시 → 공개에서 빠짐 → 되살리기 → 다시 보임 (지우는 함수 없음)', async () => {
  await core.sync();
  await admin.remove('patches', 'T_003');
  await pub.publish();
  const d = W.device('anon2');
  await d.site.load();
  eq(buildModel(d.site.source()).patches.map(p => p.code), ['T_001', 'T_002'], '빠짐');
  await admin.restore('patches', 'T_003');
  await pub.publish();
  await d.site.refresh();
  eq(buildModel(d.site.source()).patches.map(p => p.code), ['T_001', 'T_002', 'T_003'], '되살아남');
  assert(core.collection('changes').list().some(c => c.kind === 'deleted') && core.collection('changes').list().some(c => c.kind === 'restored'), '변경 기록');
});

await test('관리자 미리 보기: 공개·고객·팀원 화면이 게시 규칙과 같음', async () => {
  const src = sourceFromCore(core);
  const pubView = previewAs(src, 'public');
  assert(pubView.patches.every(p => p._locked) && !Object.keys(pubView.files).length, '공개');
  const custView = previewAs(src, 'customer', 'webagent');
  eq(custView.patches.map(p => p._locked), [true, false, true], '고객(WebAgent 만)');
  const teamView = previewAs(src, 'team');
  assert(teamView.notes.length === 1 && !teamView.patches.some(p => p._locked), '팀원');
  eq(splitContent(src).map(i => i.tier).filter(t => t === 'writer').length, 0, '나누기에는 데이터 열쇠 없음 (게시 때만 더함)');
});

await test('실제 강도(PBKDF2 60만 회)로 자리 만들고 로그인 — 걸린 시간 기록', async () => {
  const K = world('kdf');
  const c = K.mkCore('관리자');
  const n = `fz-t-${RUN}-kdf-ax`; dbs.push(n);
  const ax2 = makeAccess({ reader: K.gh.reader('forcsoz.github.io'), backendFor: (token, r) => K.gh.client(token, r.repo), kvName: n });
  await c.setup('tok-1', 'data-pass-1234', { user: '관리자' });
  const a = (await ax2.setup(c, { token: 'tok-1', name: '관리자', identifier: 'oz@forcs.com' })).admin;
  const code = (await a.addPerson({ name: '시험', identifier: 'kdf@forcs.com', role: 'staff' })).code;
  const ring = JSON.parse(td.decode(K.site.files.get('keyring.json').bytes));
  assert(Object.values(ring.slots).every(sl => (sl.i || 0) >= 600000), `반복 수 ${JSON.stringify(Object.values(ring.slots).map(sl => sl.i))}`);
  const d = K.device('kdf-user');
  const t0 = performance.now();
  await d.site.login('kdf@forcs.com', code);
  log(`PBKDF2 60만 회 로그인 ${Math.round(performance.now() - t0)}ms`);
});

// ---------- 3. 실제 seed (저장소 밖, ?seed=1) ----------
if (new URLSearchParams(location.search).has('seed')) {
  const S = world('seed');
  let sc; let sadm; let sa; let seed; let tm;
  await test('실제 seed: 가져오기 → 제품 12 · 패치 7 · 매트릭스 O 17 · 파일 11 · 참고 2 · 호환성 1, 게시, 팀원 로그인', async () => {
    seed = await (await fetch('/__seed/seed.json')).json();
    sc = S.mkCore('관리자');
    const sax = S.mkAccess('admin');
    await sc.setup('tok-1', 'data-pass-1234', { user: '관리자' });
    sa = (await sax.setup(sc, { token: 'tok-1', name: '관리자', identifier: 'oz@forcs.com' })).admin;
    sadm = createAdmin({ core: sc, files: { read: S.read } });
    const counts = await sadm.importSeed(seed, async src => { const r = await fetch(`/__seed/${src}`); return r.ok ? r.blob() : null; });
    eq([counts.files, counts.products, counts.patches, counts.notes, counts.compat, counts.refs, counts.missingFiles.length], [11, 12, 7, 2, 1, 2, 0], `가져온 수 ${JSON.stringify(counts)}`);
    await createPublisher({ core: sc, access: sax }).publish();
    const code = (await sa.addPerson({ name: '시험 팀원', identifier: 'team.tester@forcs.com', role: 'staff' })).code;
    tm = S.device('team');
    await tm.site.load();
    await tm.site.login('team.tester@forcs.com', code);
    const m = buildModel(tm.site.source());
    eq([m.products.length, m.patches.length, m.patches.reduce((n, p) => n + p.products.length, 0), Object.keys(m.files).length, m.notes.length, m.compat.length, m.refs.length], [12, 7, 17, 11, 2, 1, 2], '팀원이 보는 수');
    // 노션 원본과 같은지: 링크 수
    const linksSeed = JSON.stringify(seed).match(/https?:\/\//g).length;
    const linksModel = JSON.stringify({ p: m.patches.map(p => ({ ...p, _locked: undefined })), n: m.notes, c: m.compat, r: m.refs, h: m.home }).match(/https?:\/\//g).length;
    eq(linksModel, linksSeed, '링크가 하나도 빠지지 않음');
  });

  await test('실제 seed: 파일 11개가 팀원 기기에서 바이트 그대로 (SHA-256 = seed)', async () => {
    const m = buildModel(tm.site.source());
    const byName = new Map(Object.entries(m.files).map(([id, f]) => [f.name, { id, f }]));
    for (const sf of seed.files) {
      const x = byName.get(sf.name);
      assert(x, `없는 파일 ${sf.name}`);
      const blob = await readEntry(x.id, x.f, S.read);
      eq(await sha256hex(new Uint8Array(await blob.arrayBuffer())), sf.sha256, sf.name);
    }
  });

  await test('실제 seed: 패치 확인 기대값 (노션 규칙에서 손으로 적은 경우들, 저장소 밖 checker-cases.json)', async () => {
    const cases = (await (await fetch('/__seed/checker-cases.json')).json()).cases;
    const m = buildModel(tm.site.source());
    for (const c of cases) {
      const full = c.full ? parseFull(c.full) : null;
      const row = { product: c.product, ver: full ? full.ver : parseVersion(c.ver), build: full ? full.build : parseBuild(c.build) };
      const res = check(m, [row], { ozVer: parseVersion(c.oz || '') });
      const got = Object.fromEntries(res.rows[0].items.map(i => [i.patch.code, i.status]));
      eq(sortObj(got), sortObj(c.expect), c.name);
      if (c.guides) eq([...new Set(res.rows[0].items.flatMap(i => i.guides.map(g => m.files[g.file]?.name)))].sort(), [...c.guides].sort(), `${c.name} 가이드`);
      if (c.extrasNeed) for (const [code, need] of Object.entries(c.extrasNeed)) eq(res.rows[0].items.find(i => i.patch.code === code).extras.some(x => x.need), need, `${c.name} 권장`);
    }
    log(`패치 확인 경우 ${cases.length}개`);
  });

  await test('실제 seed: 검색이 PDF·PPTX 글자까지 (검색어는 저장소 밖 checker-cases.json)', async () => {
    const m = buildModel(tm.site.source());
    const docs = searchDocs(m);
    const cfg = await (await fetch('/__seed/checker-cases.json')).json();
    for (const q of cfg.search) assert(search(docs, q).length > 0, `검색 "${q}"`);
    assert(search(docs, cfg.searchInPdf).some(r => r.doc.type === 'PDF'), 'PDF 안의 글자');
  });

  await test('실제 seed: 공개 화면(로그인 없음)에 사내 링크·다운로드·고객목록이 없음', async () => {
    const all = S.siteAll();
    const cfg = await (await fetch('/__seed/checker-cases.json')).json();
    for (const s of cfg.notPublic) assert(!all.includes(s), `공개 저장소 글자에 "${s}"`);
    assert(all.includes(cfg.publicMust), '기술공지 제목은 공개');
  });
}

// ---------- 끝 ----------
for (const n of dbs) indexedDB.deleteDatabase(n);
const fails = results.filter(r => !r.ok);
const summary = `${fails.length ? 'FAIL' : 'PASS'} ${results.length - fails.length}/${results.length}`;
document.getElementById('summary').textContent = summary;
document.getElementById('summary').className = fails.length ? 'bad' : 'ok';
document.title = `forcsoz 시험 ${summary}`;
document.body.dataset.done = summary;
