// 개발용: dev.html?seed=1 (가짜 GitHub + 노션에서 옮긴 seed) 을 헤드리스 Edge 로 열고 화면을 찍는다.
//   FORCSOZ_SEED=<seed 폴더> node tools/shots.mjs [출력 폴더]
// seed 폴더(회사 자료)는 저장소 밖에 있고, 시험 서버가 /__seed/ 로만 내준다. 콘솔 오류·CSP 위반이 있으면 실패.
import { serve, launch, newPage } from './cdp.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdir } from 'node:fs/promises';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const seedDir = process.env.FORCSOZ_SEED;
if (!seedDir) { console.error('FORCSOZ_SEED 를 정해 주세요'); process.exit(2); }
const out = process.argv[2] || join(root, 'tools', '_shots');
await mkdir(out, { recursive: true });
const only = process.env.SHOTS_ONLY ? new Set(process.env.SHOTS_ONLY.split(',')) : null;

const { server, port } = await serve(root, 0, { mounts: { '/__seed/': seedDir } });
const { browser, close } = await launch();
const base = `http://127.0.0.1:${port}/dev.html`;
let bad = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function boot(page) {
  await page.goto(`${base}?seed=1&iter=20000&run=${Date.now().toString(36)}`);
  try {
    await page.waitFor('window.__dev && window.__dev.ready', 300000);
  } catch (e) {
    console.log(page.problems.join(' | '));
    throw e;
  }
  const err = await page.eval('window.__dev.error || ""');
  if (err) throw new Error(`seed 실패: ${err}`);
}
const go = async (page, hash, wait = 'document.querySelector("#view")') => {
  await page.eval(`location.hash = ${JSON.stringify(hash)}`);
  await sleep(250);
  await page.waitFor(/[(=]/.test(wait) ? wait : `document.querySelector(${JSON.stringify(wait)})`, 20000);
  await sleep(250);
};
async function login(page, email, secret) {
  await go(page, '#/login', 'document.querySelector("form[data-form=login]")');
  await page.eval(`(() => { const f = document.querySelector('form[data-form=login]'); f.id.value = ${JSON.stringify(email)}; f.secret.value = ${JSON.stringify(secret)}; f.requestSubmit(); })()`);
  await page.waitFor('document.querySelector("#view") && !location.hash.startsWith("#/login")', 60000);
  await sleep(400);
}
async function shot(page, name) {
  if (only && !only.has(name.split('-')[0])) return;
  await sleep(300);
  await page.shot(join(out, `${name}.png`));
  console.log('  찍음', name);
}

const sizes = [['pc', 1360, 900, false], ['phone', 400, 850, true]];
try {
  for (const [tag, w, h, mob] of sizes) {
    console.log(`== ${tag} ${w}x${h}`);
    const page = await newPage(browser, { width: w, height: h, mobile: mob });
    await boot(page);
    const codes = await page.eval('JSON.stringify(window.__dev.codes)').then(JSON.parse);
    const custs = await page.eval('JSON.stringify(window.__dev.customers)').then(JSON.parse);
    // 1. 공개 첫 화면
    await go(page, '#/');
    await shot(page, `public-home-${tag}`);
    await go(page, '#/matrix');
    await shot(page, `public-matrix-${tag}`);
    await go(page, '#/patch/2026_001');
    await shot(page, `public-patch-${tag}`);
    // 2. 로그인 화면
    await go(page, '#/login', 'document.querySelector("form[data-form=login]")');
    await shot(page, `login-${tag}`);
    // 3. 유지보수고객 (서버만)
    await login(page, custs.server.id, custs.server.number);
    await go(page, '#/check?r=server-servlet%3A80%3A2026.0315', '#check-results .summary');
    await shot(page, `customer-check-${tag}`);
    await go(page, '#/patch/2026_007');
    await shot(page, `customer-patch-locked-${tag}`);
    await page.eval('document.querySelector("[data-act=logout]").click()');
    await page.waitFor('document.querySelector("a[href=\'#/login\']")', 20000);
    // 4. 컨설팅팀원
    await login(page, 'team.tester@forcs.com', codes.team);
    await go(page, '#/');
    await shot(page, `team-home-${tag}`);
    await go(page, '#/check?r=server-servlet%3A80%3A2026.0315%2Chtml5-viewer%3A80%3A2026.0201', '#check-results .summary');
    await shot(page, `team-check-${tag}`);
    await go(page, '#/matrix');
    await shot(page, `team-matrix-${tag}`);
    await go(page, '#/patch/2026_005');
    await shot(page, `team-patch-${tag}`);
    await go(page, '#/search?q=whitelist');
    await shot(page, `team-search-${tag}`);
    await go(page, '#/links');
    await shot(page, `team-links-${tag}`);
    // PDF 보기
    await go(page, '#/patch/2026_008');
    await page.eval('document.querySelector("[data-act=view-file]").click()');
    await page.waitFor('document.querySelector(".viewer .pdf-page canvas")', 60000);
    await sleep(800);
    await shot(page, `team-pdf-${tag}`);
    await page.eval('document.querySelector("[data-v=close]").click()');
    await page.eval('document.querySelector("[data-act=logout]").click()');
    await page.waitFor('document.querySelector("a[href=\'#/login\']")', 20000);
    // 5. 관리자 (이메일 + 코드)
    await login(page, 'oz@forcs.com', codes.admin);
    await page.waitFor('document.querySelector("#pub-state .btn, #pub-state .st")', 30000);
    await shot(page, `admin-${tag}`);
    await go(page, '#/edit/patches/2026_007', 'document.querySelector("form[data-form=editor]")');
    await shot(page, `admin-editor-${tag}`);
    await go(page, '#/admin#people', '#people');
    await shot(page, `admin-people-${tag}`);
    // 어두운 테마
    await go(page, '#/');
    await page.eval('document.documentElement.dataset.theme = "dark"');
    await go(page, '#/check?r=webagent%3A10%3A2026.0701&oz=80', '#check-results .summary');
    await shot(page, `dark-check-${tag}`);
    const probs = page.problems.filter(p => !/favicon/.test(p));
    if (probs.length) { bad++; console.log('  문제:\n   ' + probs.join('\n   ')); } else console.log('  콘솔 오류·CSP 위반 없음');
    await page.close();
  }
} catch (e) {
  bad++;
  console.error(e);
} finally {
  await close();
  server.close();
}
process.exit(bad ? 1 : 0);
