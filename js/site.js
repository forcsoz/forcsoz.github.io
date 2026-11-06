// 사이트를 읽는 쪽 — 공용 access (core/access.js) 로 공개 항목과 로그인한 사람의 등급 항목을 받아 화면 모델 원본으로 묶는다.
// 로그인·이 기기 기억·열쇠가 바뀌면 꾸러미 새로 받기·막히면 로그아웃은 모두 access 가 한다.

import { assemble } from './tiers.js';

export function createSite({ access }) {
  const st = { open: {}, at: {}, offline: false, sig: '', preSetup: false };

  async function readAll() {
    const open = {};
    const at = {};
    for (const t of access.tiers()) {
      let list;
      try {
        list = await access.list(t);
      } catch (e) {
        if (e.code === 'offline') { st.offline = true; return false; }
        if (e.code === 'no-access' || e.code === 'stale') continue;
        throw e;
      }
      for (const it of list) { open[`${t}/${it.id}`] = it.data; at[`${t}/${it.id}`] = it.at; }
    }
    st.offline = false;
    const sig = JSON.stringify(Object.entries(at).sort());
    const changed = sig !== st.sig;
    st.open = open;
    st.at = at;
    st.sig = sig;
    return changed;
  }

  // → 'none'(아직 게시된 것 없음) | 'ok'. 기억해 둔 로그인이 있으면 다시 들어간다 (access.resume)
  // 공개 항목만 (GitHub Pages 에서 바로, 이 기기 저장소 IndexedDB 는 쓰지 않음 → 첫 화면을 먼저 그릴 수 있다).
  // 게시된 것이 없으면 keyring.json 도 본다: 없으면(404) 처음 설정 전 → 공개 화면에 관리자용 «처음 설정»
  async function loadPublic() {
    await readAll();
    if (st.open['public/pub']) { st.preSetup = false; return 'ok'; }
    try { st.preSetup = !(await access.keyring()); } catch (e) { if (e.code !== 'offline') console.warn(e); }
    return 'none';
  }

  // skipPublic: 방금 loadPublic 으로 받았고 기억한 로그인이 없으면 다시 받지 않는다
  async function load({ skipPublic = false } = {}) {
    try { await access.resume(); } catch {}
    try {
      if (!(skipPublic && !access.me())) await readAll();
    } catch (e) {
      if (e.code === 'revoked') { await access.logout(); await readAll(); } else throw e;
    }
    return st.open['public/pub'] ? 'ok' : 'none';
  }

  async function login(identifier, secret, { remember = true } = {}) {
    const info = await access.login(identifier, secret, { remember });
    await readAll();
    return info;
  }

  async function logout() {
    await access.logout();
    await readAll();
  }

  // 새로 게시된 것이 있으면 true. 막혔으면 access 가 로그아웃하고 AccessError('revoked')
  async function refresh() {
    return readAll();
  }

  function source() {
    const times = Object.values(st.at).filter(Boolean).sort();
    return assemble(st.open, { publishedAt: times[times.length - 1] || '' });
  }

  return {
    load, loadPublic, login, logout, refresh, source,
    get info() { return access.me(); },
    get preSetup() { return !!st.preSetup; },
    get sig() { return st.sig; },
    get offline() { return st.offline; },
    get published() { return !!st.open['public/pub']; },
    get opened() { return st.open; },
  };
}
