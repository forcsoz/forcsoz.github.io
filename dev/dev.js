// 개발·시험용 시작: 메모리 안의 가짜 GitHub 로 사이트를 띄운다. 회사 자료는 이 파일에 없다.
//   dev.html            빈 사이트 (처음 설정: 토큰 tok-dev)
//   dev.html?seed=1     시험 서버(tools/cdp.mjs serve)가 /__seed/ 로 내주는 seed.json·파일을 가져와 사람·게시까지 해 둔다
//   ?iter=20000         코드 → 열쇠 계산 횟수 (시험을 빠르게. 실제는 60만)
//   window.__dev        시험 스크립트가 쓰는 손잡이 (가짜 GitHub, core, access, app, 발급한 코드들)

import { createCore } from '../js/core/core.js';
import { FakeGitHub } from '../js/core/fake-backend.js';
import { makeAccess, SITE_REPO } from '../js/tiers.js';
import { createSite } from '../js/site.js';
import { startApp } from '../js/app.js';

const qs = new URLSearchParams(location.search);
const RUN = qs.get('run') || Date.now().toString(36);
const ITER = Number(qs.get('iter')) || undefined;
const TOK = 'tok-dev';
const gh = new FakeGitHub({ owner: 'forcsoz', tokens: [TOK], creators: [TOK] });
gh.repo('forcsoz-data', { isPublic: false });
const siteRepo = gh.repo(SITE_REPO.repo, { isPublic: true });
siteRepo.files.set('index.html', { sha: 'sha0', bytes: new TextEncoder().encode('<!doctype html>') });
siteRepo.addCommit('init', ['index.html']);

const tick = () => new Promise(r => setTimeout(r, 0));
const read = async (n, path) => {
  await tick();
  const b = gh.repos.has(`files-${n}`) ? gh.repo(`files-${n}`).read(path) : null;
  if (!b) throw Object.assign(new Error('없음'), { status: 404 });
  return b;
};
const account = token => ({
  async repoInfo(name) { await tick(); return gh.repos.has(name) ? { private: !gh.repo(name).isPublic, size: 0, branch: 'main' } : null; },
  async createRepo(name) { await gh.createRepoBy(token, name); return this.repoInfo(name); },
});

const core = createCore({ dbName: `fz-dev-core-${RUN}`, backend: (t, dev) => gh.client(t, dev.repo), account, siteUrl: `${location.origin}${location.pathname}` });
const access = makeAccess({ reader: gh.reader(SITE_REPO.repo), backendFor: (token, r) => gh.client(token, r.repo), kvName: `fz-dev-access-${RUN}` }, ITER ? { iter: ITER } : {});
const site = createSite({ access });
const env = { core, access, site, read, filesOpts: { read } };

const dev = { gh, core, access, site, env, codes: {}, ready: false };
window.__dev = dev;

async function seedAll() {
  const { A } = await import('../js/state.js');
  const seed = await (await fetch('/__seed/seed.json')).json();
  const code0 = await core.setup(TOK, 'data-pass-1234', { user: '관리자 oz' });
  const res = await access.setup(core, { token: TOK, name: '관리자 oz', identifier: 'oz@forcs.com' });
  dev.codes = { admin: res.code, rosterRecovery: res.recoveryCode, coreRecovery: code0 };
  await dev.app.enterAdmin('admin', { go: false });
  A.adm = res.admin;
  dev.importCounts = await A.admin.importSeed(seed, async src => {
    const r = await fetch(`/__seed/${src}`);
    return r.ok ? r.blob() : null;
  });
  // 시험용 사람 (지어낸 이름·번호)
  const t = await res.admin.addPerson({ name: '시험 팀원', identifier: 'team.tester@forcs.com', role: 'staff' });
  const w = await res.admin.addPerson({ name: '시험 작성자', identifier: 'writer.tester@forcs.com', role: 'writer' });
  dev.codes.team = t.code;
  dev.codes.writer = w.code;
  dev.customers = {
    all: { id: 'TEST-CUST-001', number: 'Q7RK-29XM-HT4P-WZ6D' },
    server: { id: 'TEST-CUST-002', number: 'M3VD-8KQT-ZP2X-LR9C' },
  };
  await res.admin.addPerson({ name: '시험고객 가', identifier: dev.customers.all.id, role: 'customer', code: dev.customers.all.number });
  await res.admin.addPerson({ name: '시험고객 나', identifier: dev.customers.server.id, role: 'c_server_servlet', code: dev.customers.server.number });
  dev.publish = await A.pub.publish();
  await dev.app.logout();
}

dev.app = await startApp(env);
if (qs.get('seed')) {
  try { await seedAll(); } catch (e) { console.error(e); dev.error = String(e?.stack || e); }
}
dev.ready = true;
