// 관리 화면 — 게시·미리 보기, 사람·권한(관리자만), 점검, 편집 바로 가기, 가져오기, 파일, 휴지통, 이 기기·계정

import { A } from './state.js';
import { esc } from './md.js';
import { roleLabel, TEAM_DOMAIN } from './tiers.js';
import { codeBits, normAccessCode, MIN_CODE_BITS } from './core/access.js';
import { estimateBits } from './entropy.js';
import { fmtSize, fmtWhen, ago } from './ui.js';
import { KIND } from './admin.js';

const core = () => A.env.core;
const M = () => A.model;

export function stateText(s) {
  return { locked: '잠김', saved: '저장됨', pending: '이 기기에만 있음 (곧 올라감)', syncing: '올리는 중', offline: '오프라인', error: '오류' }[s] || s;
}

export function viewAdmin() {
  const s = core().status();
  const isAdmin = A.role === 'admin';
  const lint = A.admin.lint();
  const usage = A.admin.files.usage();
  const docs = core().collection('docs').list().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const trash = ['patches', 'products', 'notes', 'compat', 'refs', 'docs'].flatMap(c => core().collection(c).trash().map(r => ({ c, r })));
  const conflicts = ['patches', 'products', 'notes', 'compat', 'refs', 'settings', 'docs', 'people'].flatMap(c => core().collection(c).conflicts().map(r => ({ c, r })));
  const src = core().collection('settings').get('source');
  const empty = !core().collection('patches').list().length;
  const toc = [['publish', '게시'], ...(isAdmin ? [['people', '사람·권한']] : []), ['lint', `점검 ${lint.filter(x => x.level !== 'info').length || ''}`], ['edit', '편집'], ['import', '가져오기'], ['files', '파일'], ['trash', `휴지통 ${trash.length || ''}`], ['device', '이 기기 · 계정']];
  return `
  <header class="page-h"><div><p class="eyebrow">관리 · ${esc(roleLabel(A.role))}</p><h1>${esc(s.user || '이름 없음')}</h1>
  <p class="muted">저장 상태: <b class="sync s-${esc(s.state)}">${esc(stateText(s.state))}</b>${s.error ? ` — ${esc(s.error)}` : ''}</p></div>
  <div class="row"><button class="btn" data-act="admin-lock">로그아웃</button></div></header>

  <nav class="toc">${toc.map(([id, t]) => `<a href="#/admin#${id}">${esc(t)}</a>`).join('')}</nav>

  ${empty ? '<div class="note-box warn"><b>아직 자료가 없어요.</b> 아래 <a href="#/admin#import">가져오기</a>에서 노션에서 옮긴 <code>seed.json</code> 과 파일들을 넣으세요.</div>' : ''}

  <section class="card" id="publish">
    <header class="card-h"><h2>게시 (공개 · 고객 · 팀원 화면에 반영)</h2></header>
    <div id="pub-state"><p class="muted">확인하는 중…</p></div>
    <div class="row"><span class="small muted">미리 보기:</span>${[['', '관리자 (모두)'], ['public', '공개'], ['customer', '유지보수고객'], ['team', '컨설팅팀원']].map(([r, t]) => `<button class="fchip ${A.preview === r ? 'on' : ''}" data-act="preview" data-v="${r}">${esc(t)}</button>`).join('')}</div>
    <p class="hint">미리 보기는 게시할 때와 같은 규칙으로 나눈 화면이에요. 위쪽 띠의 "미리 보기 끝"으로 돌아와요.</p>
  </section>

  ${isAdmin ? viewPeople() : ''}

  <section class="card" id="lint">
    <header class="card-h"><h2>데이터 점검</h2></header>
    ${lint.length ? `<ul class="lint">${lint.map(l => `<li class="lv-${l.level}"><span class="tag">${l.level === 'error' ? '오류' : l.level === 'warn' ? '주의' : '참고'}</span> <a href="${l.route}">${esc(l.where)}</a> ${esc(l.text)}</li>`).join('')}</ul>` : '<p class="muted">문제 없음</p>'}
  </section>

  <section class="card" id="edit">
    <header class="card-h"><h2>편집</h2></header>
    <div class="edit-links">
      <div><b>패치</b> ${M().patches.map(p => `<a href="#/edit/patches/${esc(p.id)}">${esc(p.code)}</a>`).join(' ')} <a class="btn sm" href="#/edit/patches/new">+ 새 패치</a></div>
      <div><b>제품</b> ${M().products.map(p => `<a href="#/edit/products/${esc(p.id)}">${esc(p.name)}</a>`).join(' ')} <a class="btn sm" href="#/edit/products/new">+ 새 제품</a></div>
      <div><b>참고 문서</b> ${M().notes.map(n => `<a href="#/edit/notes/${esc(n.id)}">${esc(n.title)}</a>`).join(' ')} <a class="btn sm" href="#/edit/notes/new">+ 새 문서</a></div>
      <div><b>호환성</b> ${M().compat.map(c => `<a href="#/edit/compat/${esc(c.id)}">${esc(c.date || c.id)}</a>`).join(' ')} <a class="btn sm" href="#/edit/compat/new">+ 추가</a></div>
      <div><b>공통 자료</b> ${M().refs.map(r => `<a href="#/edit/refs/${esc(r.id)}">${esc(r.title)}</a>`).join(' ')} <a class="btn sm" href="#/edit/refs/new">+ 추가</a></div>
      <div><b>홈</b> <a href="#/edit/settings/home">최신 패치 파일 링크</a></div>
      <div><b>매트릭스</b> <a href="#/matrix">매트릭스에서 "칸 편집"</a></div>
    </div>
    <p class="hint">누가 무엇을 보나: <b>공개</b> = 번호·제목·기술공지·대상 제품·패치 버전 · <b>유지보수고객</b> = + 다운로드·고객 가이드 문서·고객 FAQ·공통 자료(범위 "고객") · <b>컨설팅팀원</b> = + 대응이력·컨설팅 참고·참고 문서·호환성·확인 필요·공통 자료(범위 "팀")·최근 변경.</p>
  </section>

  ${conflicts.length ? `<section class="card" id="conflicts"><header class="card-h"><h2>동시에 고친 내용 ${conflicts.length}</h2></header>
    <p class="muted">두 사람이 같은 때 같은 칸을 고쳐서 나중 것이 남았어요. 진 값은 아래에 있어요. 확인했으면 "확인함".</p>
    <ul class="lint">${conflicts.map(({ c, r }) => `<li><b>${esc(KIND[c] || c)}</b> ${esc(r.title || r.name || r.id)} — ${(r._conflicts || []).map(x => `${esc(x.field)}: ${esc(JSON.stringify(x.value).slice(0, 120))} (${esc(x.by || '')} ${ago(x.at)})`).join(' / ')} <button class="btn sm" data-act="clear-conflict" data-col="${c}" data-id="${esc(r.id)}">확인함</button></li>`).join('')}</ul></section>` : ''}

  <section class="card" id="import">
    <header class="card-h"><h2>노션에서 옮긴 자료 가져오기</h2></header>
    ${src?.importedAt ? `<p class="muted">가져온 때: ${esc(fmtWhen(src.importedAt))} ${esc(src.importedBy || '')} · 원본 노션 페이지 ${esc(src.title || '')} (${esc(src.readAt || '')} 읽음)</p>` : ''}
    <form class="stack sm" data-form="import" autocomplete="off">
      <label class="fld"><span>seed.json</span><input type="file" name="seed" accept=".json,application/json" required></label>
      <label class="fld"><span>파일들 (seed 의 files 폴더 안 파일을 모두 고르세요)</span><input type="file" name="files" multiple accept=".pdf,.pptx"></label>
      <label class="chk"><input type="checkbox" name="overwrite"> 이미 있는 항목도 seed 내용으로 덮어쓰기 (지우지는 않아요)</label>
      <button class="btn primary">가져오기</button>
      <div id="import-progress" class="hint"></div>
    </form>
  </section>

  <section class="card" id="files">
    <header class="card-h"><h2>파일 ${docs.length}개 (PDF·PPTX)</h2></header>
    <form class="row" data-form="upload" autocomplete="off"><input type="file" name="file" accept=".pdf,.pptx" multiple required><button class="btn primary">올리기</button><span id="upload-progress" class="hint"></span></form>
    <p class="hint">파일마다 다른 열쇠로 암호화해 공개 저장소 files-N 에 올려요. 저장소가 900MB 쯤 차면 다음 저장소를 저절로 만들어요.
    ${usage.map(u => `${esc(u.name)} ${fmtSize(u.bytes)} (${u.pct}%)`).join(' · ')}</p>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>이름</th><th>크기</th><th>검색 글자</th><th></th></tr></thead>
    <tbody>${docs.map(d => `<tr><td><a href="#/file/${esc(d.id)}">${esc(d.name)}</a><br><small class="muted">${esc(d.updatedBy || '')} ${ago(d.updatedAt)} · files-${d.repo}</small></td><td class="nowrap">${fmtSize(d.size)}</td><td>${d.text ? `${d.text.length.toLocaleString()}자` : '<span class="muted">없음</span>'}</td>
      <td class="nowrap"><button class="btn sm" data-act="rename-doc" data-id="${esc(d.id)}">이름</button><button class="btn sm ghost" data-act="del" data-col="docs" data-id="${esc(d.id)}">휴지통</button></td></tr>`).join('')}</tbody></table></div>
  </section>

  <section class="card" id="trash">
    <header class="card-h"><h2>휴지통 ${trash.length}</h2></header>
    <p class="hint">지우기는 모두 휴지통이에요. 되살릴 수 있고, 저장소에서는 아무것도 지우지 않아요.</p>
    ${trash.length ? `<ul class="lint">${trash.map(({ c, r }) => `<li><span class="tag">${esc(KIND[c] || c)}</span> ${esc(r.code ? `[${r.code}] ` : '')}${esc(r.title || r.name || r.date || r.id)} <small class="muted">${esc(r.deletedBy || '')} ${ago(r.deletedAt)}</small> <button class="btn sm" data-act="restore" data-col="${c}" data-id="${esc(r.id)}">되살리기</button></li>`).join('')}</ul>` : '<p class="muted">비어 있어요.</p>'}
  </section>

  <section class="card" id="device">
    <header class="card-h"><h2>이 기기 · 계정</h2></header>
    <div class="grid-2">
      <form class="stack sm" data-form="user-name"><label class="fld"><span>내 이름 (변경 기록에 남아요)</span><input name="user" value="${esc(s.user || '')}" required></label><button class="btn sm">이름 저장</button></form>
      ${A.me?.id ? '<div class="stack sm"><b>내 로그인 코드</b><a class="btn sm" href="#/account">비밀문장으로 바꾸기</a></div>' : ''}
      ${isAdmin ? `
      <form class="stack sm" data-form="admin-pw" autocomplete="off"><b>데이터 저장소 비밀번호 바꾸기</b><input type="password" name="pw" placeholder="새 비밀번호 (8자 이상)" minlength="8" required autocomplete="new-password"><button class="btn sm">바꾸기</button></form>
      <div class="stack sm"><b>복구 코드</b><button class="btn sm" data-act="new-recovery">데이터 저장소 복구 코드 새로</button><button class="btn sm" data-act="new-roster-recovery">명단 복구 코드 새로</button></div>
      <form class="stack sm" data-form="rotate-token" autocomplete="off"><b>GitHub 토큰 바꾸기</b><input type="password" name="token" placeholder="새 토큰" required autocomplete="off"><button class="btn sm">바꾸고 게시</button><small class="muted">데이터 저장소 토큰과 작성자·관리자 꾸러미의 쓰기 토큰을 함께 바꿔요.</small></form>
      <div class="stack sm"><b>백업</b><button class="btn sm" data-act="backup">암호화된 백업 내려받기</button><button class="btn sm ghost" data-act="forget-device">이 기기 연결 끊기</button></div>` : '<p class="muted">작성자는 글·파일을 고치고 게시할 수 있어요. 사람·권한과 계정 설정은 관리자만.</p>'}
    </div>
    <p class="hint">인수인계: 사이트 저장소의 <code>js/core/HANDOVER.md</code></p>
  </section>`;
}

function viewPeople() {
  const weak = core().collection('settings').get('customerWeak')?.pids || [];
  return `
  <section class="card" id="people">
    <header class="card-h"><h2>사람 · 권한</h2></header>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>역할</th><th>로그인 (아이디 + 코드)</th><th>볼 수 있는 것</th></tr></thead><tbody>
      <tr><td><b>공개</b></td><td>로그인 없음</td><td>기술공지: 번호·제목·기술공지 링크·대상 제품(매트릭스)·패치 버전, 패치 확인(필요 여부만)</td></tr>
      <tr><td><b>유지보수고객</b></td><td>고객 ID + 인증번호 (회사 DB)</td><td>+ 다운로드 링크, 고객 가이드 문서, 고객 FAQ, 공통 FAQ, 최신 패치 파일. CSV 에 제품이 하나 있으면 그 제품의 패치만</td></tr>
      <tr><td><b>컨설팅팀원</b></td><td>@${TEAM_DOMAIN} 주소 + 발급 코드</td><td>+ 대응이력, 컨설팅 참고, 참고 문서, 호환성, 파일 서명, 최근 변경 (보기만)</td></tr>
      <tr><td><b>작성자</b></td><td>주소 + 발급 코드</td><td>+ 편집·파일 올리기·게시 (꾸러미에 쓰기 토큰, 작성자 등급에 데이터 저장소 열쇠)</td></tr>
      <tr><td><b>관리자</b></td><td>oz@ 주소 + 발급 코드</td><td>+ 사람·권한</td></tr>
    </tbody></table></div>

    <h3 class="sub">컨설팅팀원 · 작성자 · 관리자 추가</h3>
    <form class="grid-3" data-form="add-person" autocomplete="off">
      <label class="fld"><span>아이디 = 이메일 (@${TEAM_DOMAIN})</span><input type="email" name="email" required placeholder="name@${TEAM_DOMAIN}"></label>
      <label class="fld"><span>이름</span><input name="name" placeholder="홍길동" required></label>
      <label class="fld"><span>역할</span><select name="role"><option value="staff">컨설팅팀원 (보기)</option><option value="writer">작성자 (편집)</option><option value="admin">관리자</option></select></label>
      <div class="row"><button class="btn primary">코드 발급</button></div>
    </form>
    <p class="hint">주소마다 코드(60비트, 예: K7QX-M2PA-9TRD)를 하나 만들고 초대 글을 보여 줘요. 그 글을 <b>그 사람의 @${TEAM_DOMAIN} 메일로</b> 보내야 해요 — 그 메일함을 가진 사람만 코드를 받으니 그것이 확인이에요. 화면에서 주소 끝자리를 보는 것은 보안이 아니에요. 이메일 OTP · Google Workspace(hd=${TEAM_DOMAIN}) 로그인은 작은 인증 서버가 있어야 해요 (access.js 의 provider 자리).</p>

    <h3 class="sub">유지보수고객 인증번호 (회사 DB 에서 내보낸 CSV)</h3>
    <form class="stack sm" data-form="import-customers" autocomplete="off">
      <label class="fld"><span>CSV — 머리글: 고객ID(필수, 로그인 아이디), 인증번호(필수), 고객명(선택), 제품(선택, 하나)</span><input type="file" name="csv" accept=".csv,.txt,text/csv" required></label>
      <div id="csv-preview" class="hint"></div>
      <label class="chk"><input type="checkbox" name="acceptWeak"> 약한 번호(40비트 미만)도 받기 — 알고 쓰는 경우만</label>
      <button class="btn primary">가져와서 자리 만들기</button>
      <div id="csv-progress" class="hint"></div>
    </form>
    <p class="hint">인증번호 자체는 저장하지 않아요. 공개 저장소의 자리(keyring)는 누구나 받아 번호를 끝없이 맞혀 볼 수 있어서, <b>40비트(무작위 영숫자 8자, 숫자 12자리)보다 약한 번호</b>는 기본으로 거부하고 표시해요. 그런 번호는 회사 DB 에서 더 긴 번호로 바꾸는 것을 권해요. 아이디(고객 ID)는 해시로만 남지만, 맞히기 쉬운 ID 면 "명단에 있는지"는 알 수 있어요(내용은 못 봄).
    ${weak.length ? `<br><b class="err">지금 약한 번호로 받은 고객 ${weak.length}명</b>` : ''}</p>

    <h3 class="sub">명단</h3>
    <div id="people-list"><p class="muted">불러오는 중…</p></div>

    <h3 class="sub">비밀문장 바꾸기 요청</h3>
    <form class="row" data-form="apply-secret" autocomplete="off"><input name="request" placeholder="ACX1.… (팀원이 보낸 글자)" required class="grow"><button class="btn sm">요청 적용</button></form>
    <p class="hint">막으면 그 사람 자리를 빼고 그 사람이 가진 등급 열쇠를 바꿔 커밋 하나로 올려요. 그 뒤로 올리는 내용은 못 열지만, <b>이미 받아 간 내용(내려받은 파일, 그 기기에 남은 화면)은 막을 수 없어요.</b> 작성자·관리자를 막으면 쓰기 토큰이 노출된 것으로 보고 새 토큰을 받아요. "마지막 접속"은 알 수 없어요(서버가 없음).</p>
  </section>`;
}

export function peopleListHtml(people) {
  const weak = new Set(core().collection('settings').get('customerWeak')?.pids || []);
  const isCust = p => /^c_|^customer$|^cust$/.test(p.role);
  const team = people.filter(p => !isCust(p));
  const custs = people.filter(isCust);
  const teamRe = new RegExp(`@${TEAM_DOMAIN.replace('.', '\\.')}$`, 'i');
  const row = p => `<tr class="${p.status === 'active' ? '' : 'muted'}"><td><b>${esc(p.name)}</b><br><small>${esc(p.identifier)}</small>${!isCust(p) && !teamRe.test(p.identifier) ? ` <span class="tag warn">@${TEAM_DOMAIN} 아님</span>` : ''}${p.secret === 'passphrase' ? ' <span class="tag">비밀문장</span>' : ''}${weak.has(p.id) ? ' <span class="tag warn">약한 번호</span>' : ''}</td>
    <td>${esc(p.roleLabel)}</td><td>${p.status === 'active' ? `발급 ${esc(fmtWhen(p.issuedAt).slice(0, 10))}` : `막음 ${esc(fmtWhen(p.revokedAt).slice(0, 10))}`}</td>
    <td class="nowrap">${isCust(p) ? '' : `<button class="btn sm" data-act="reissue" data-id="${esc(p.id)}">${p.status === 'active' ? '새 코드' : '다시 허용'}</button>`}${p.status === 'active' && p.id !== A.me?.id ? `<button class="btn sm ghost" data-act="revoke" data-id="${esc(p.id)}" data-name="${esc(p.name)}" data-write="${p.canWrite ? 1 : ''}">막기</button>` : ''}</td></tr>`;
  const table = list => `<div class="table-wrap"><table class="tbl"><thead><tr><th>사람</th><th>역할</th><th>상태</th><th></th></tr></thead><tbody>${list.map(row).join('') || '<tr><td colspan="4" class="muted">없음</td></tr>'}</tbody></table></div>`;
  return `<b class="small">컨설팅팀 · 작성자 · 관리자 ${team.filter(p => p.status === 'active').length}</b>${table(team)}
    <details ${custs.length < 20 ? 'open' : ''}><summary><b class="small">유지보수고객 ${custs.filter(p => p.status === 'active').length}</b></summary>${table(custs)}</details>`;
}

export function csvPreviewHtml(parsed) {
  const est = estimateBits(parsed.rows.map(r => r.number));
  const weak = parsed.rows.filter(r => codeBits(normAccessCode(r.number)) < MIN_CODE_BITS).length;
  const multi = parsed.rows.filter(r => r.products.length > 1).length;
  const scoped = parsed.rows.filter(r => r.products.length === 1).length;
  return `${parsed.rows.length}명 · 번호 하나씩 본 강도: <b class="${weak ? 'err' : 'ok'}">40비트 미만 ${weak}개</b> · 목록 전체로 본 강도 ${est.bits}비트${est.sequential ? ' <b class="err">(순서대로 발급된 번호로 보여요 — 실제로는 더 약해요)</b>' : ''}${parsed.hasProducts ? ` · 제품 하나로 범위 ${scoped}명${multi ? `, 여러 제품 ${multi}명은 모든 제품으로` : ''}` : ''}${parsed.errors.length ? `<br><span class="err">${parsed.errors.slice(0, 5).map(esc).join(' / ')}${parsed.errors.length > 5 ? ' …' : ''}</span>` : ''}`;
}

export async function hydrateAdmin() {
  const el = document.getElementById('pub-state');
  if (el && A.pub) {
    let st;
    try { st = await A.pub.state(); } catch (e) { el.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
    if (document.body.contains(el)) {
      el.innerHTML = `<p>${st.dirty ? `<b class="st st-missing">게시 안 된 변경 있음</b> 바뀐 묶음 ${st.todo.length}개 · 변경 기록 ${st.pendingChanges}건` : '<b class="st st-ok">게시된 화면과 같아요</b>'}
        · 마지막 게시 ${st.publishedAt ? `${esc(fmtWhen(st.publishedAt))} ${esc(st.publishedBy)}` : '없음'}</p>
        <button class="btn primary" data-act="publish" ${st.dirty ? '' : 'disabled'}>게시</button>`;
    }
  }
  const pl = document.getElementById('people-list');
  if (pl && A.adm) {
    try { pl.innerHTML = peopleListHtml(await A.adm.people()); } catch (e) { pl.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }
}
