// PDF·PPTX 저장 — 공개 파일 저장소 forcsoz/files-1, -2, … (jayangchoir-site 의 js/media.js 를 복사해 고친 것)
//
// - 파일마다 무작위 키로 암호화해서 올린다(tier.js). 키는 관리자 데이터(docs 목록, 비공개·암호화)와
//   팀원용 묶음(팀 비밀번호로 암호화)에만 있다. 저장소는 공개라 토큰 없이 raw.githubusercontent.com 으로 읽는다.
// - 저장소 하나가 약 900MB 가 되면 다음 저장소를 토큰으로 자동으로 만든다 (GitHub 권장: 저장소 1GB 이하).
// - 파일은 8MB 씩 나눠 조각마다 따로 암호화한다. 경로: d/<yyyy-mm>/<파일id>/<조각 번호>
// - 지우는 함수는 없다. 휴지통에 넣으면 팀원용 묶음에서 빠질 뿐 파일은 그대로다.
//
// docs 기록(관리자 데이터, core 의 'docs' 목록):
//   { id, name, type, size, stored, parts, repo, path, key, sha256, text?, pages? }

import { encPart, decPart, fileKey, newFileKey } from './tier.js';
import { isConflict } from './core/github.js';
import { uid } from './core/core.js';

export const OWNER = 'forcsoz';
export const PREFIX = 'files-';
export const REPO_LIMIT = 900e6;
export const CHUNK = 8 * 1024 * 1024;
export const FILE_MAX = 95e6;
const OVERHEAD = 28; // 조각마다 iv 12 + 태그 16

export const repoName = n => `${PREFIX}${n}`;
export const rawUrl = (n, path) => `https://raw.githubusercontent.com/${OWNER}/${repoName(n)}/main/${path}`;

export const isPdf = f => /pdf/i.test(f?.type || '') || /\.pdf$/i.test(f?.name || '');
export const isPptx = f => /presentationml|powerpoint/i.test(f?.type || '') || /\.pptx?$/i.test(f?.name || '');

// 공개 저장소 파일 읽기 (토큰 없음). raw 가 아직 모르면(막 올린 파일) API 로 한 번 더
export async function fetchPublic(n, path) {
  let r;
  try {
    r = await fetch(rawUrl(n, path), { cache: 'force-cache' });
  } catch {
    throw Object.assign(new Error('인터넷에 연결되어 있지 않아요.'), { status: 0 });
  }
  if (r.status === 404) {
    try {
      r = await fetch(`https://api.github.com/repos/${OWNER}/${repoName(n)}/contents/${path}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
    } catch {
      throw Object.assign(new Error('인터넷에 연결되어 있지 않아요.'), { status: 0 });
    }
  }
  if (!r.ok) throw Object.assign(new Error(r.status === 404 ? '아직 올라가지 않은 파일이에요. 잠시 뒤 다시 열어 주세요.' : `파일을 받지 못했어요 (${r.status})`), { status: r.status });
  return new Uint8Array(await r.arrayBuffer());
}

// docs 기록 → 묶음 안의 짧은 칸 { n: 이름, t: 형식, s: 크기, r: 저장소 번호, p: 경로, c: 조각 수, k: 키 }
export const toEntry = m => ({ n: m.name, t: m.type, s: m.size, r: m.repo, p: m.path, c: m.parts, k: m.key });

// 내용 전체 → Blob. read(n, path) 는 공개 저장소 읽기 (시험에서는 가짜)
export async function readEntry(id, e, read = fetchPublic, onProgress) {
  const key = await fileKey(e.k);
  const parts = [];
  for (let i = 0; i < (e.c || 1); i++) {
    parts.push(await decPart(key, id, i, await read(e.r, `${e.p}/${i}`)));
    onProgress?.((i + 1) / (e.c || 1));
  }
  return new Blob(parts, { type: e.t || 'application/octet-stream' });
}

export async function sha256hex(bytes) {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function createFiles({ core, limit = REPO_LIMIT, chunk = CHUNK, read = fetchPublic } = {}) {
  const col = () => core.collection('docs');
  const settings = () => core.collection('settings');

  // 저장소마다 쓴 양 (휴지통에 있는 것도 저장소에는 그대로 있으므로 센다)
  function usage() {
    const known = settings().get('storage')?.repos || [];
    const map = new Map(known.map(n => [n, { n, name: repoName(n), bytes: 0, count: 0 }]));
    for (const m of col().list({ deleted: 'all' })) {
      if (!m.repo) continue;
      if (!map.has(m.repo)) map.set(m.repo, { n: m.repo, name: repoName(m.repo), bytes: 0, count: 0 });
      const u = map.get(m.repo);
      u.bytes += m.stored || m.size || 0;
      u.count++;
    }
    return [...map.values()].sort((a, b) => a.n - b.n).map(u => ({ ...u, limit, pct: Math.min(100, Math.round((u.bytes / limit) * 1000) / 10) }));
  }

  // 이 크기를 넣을 저장소 번호. 지금 것이 차면 다음 것을 만든다
  async function pickRepo(size) {
    const u = usage();
    const cur = u[u.length - 1];
    if (cur && cur.bytes + size <= limit) return cur.n;
    if (cur && cur.bytes === 0) return cur.n; // 빈 저장소에는 큰 파일 하나라도 넣는다
    const n = cur ? cur.n + 1 : 1;
    await core.account().createRepo(repoName(n), { description: 'FORCS OZ 컨설팅팀 자료 (암호화되어 있음)', private: false });
    const st = settings().get('storage') || { id: 'storage', repos: [] };
    await settings().put({ ...st, id: 'storage', repos: [...new Set([...(st.repos || []), n])].sort((a, b) => a - b) });
    return n;
  }

  // 조각 하나 올리기. 이미 있으면(지난번에 올리고 끊김) 그대로 둔다 — 같은 키로 암호화한 것이라 열린다
  async function putPart(be, path, bytes) {
    try {
      await be.put(path, bytes, null, 'file');
    } catch (e) {
      if (!isConflict(e)) throw e;
      if (!(await be.get(path))) throw e;
    }
  }

  // 파일 올리기 → docs 기록. extra = { text, pages, ... } (검색용 글자 등)
  async function upload(file, { name, extra = {}, onProgress, id = uid() } = {}) {
    const data = new Uint8Array(await file.arrayBuffer());
    if (data.length > FILE_MAX) throw Object.assign(new Error(`파일이 너무 커요 (${Math.round(data.length / 1e6)}MB). 95MB 이하만 올릴 수 있어요.`), { code: 'too-big' });
    const sha = await sha256hex(data);
    const same = col().list().find(d => d.sha256 === sha);
    if (same) return { ...same, reused: true }; // 같은 파일이 이미 있으면 다시 올리지 않는다
    const n = Math.max(1, Math.ceil(data.length / chunk));
    const stored = data.length + n * OVERHEAD;
    const repo = await pickRepo(stored);
    const d = new Date();
    const path = `d/${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}/${id}`;
    const k = newFileKey();
    const key = await fileKey(k);
    const be = core.backend({ owner: OWNER, repo: repoName(repo) });
    for (let i = 0; i < n; i++) {
      await putPart(be, `${path}/${i}`, await encPart(key, id, i, data.subarray(i * chunk, (i + 1) * chunk)));
      onProgress?.((i + 1) / n);
    }
    const rec = {
      id, name: name || file.name || id, type: file.type || (isPdf(file) ? 'application/pdf' : 'application/octet-stream'),
      size: data.length, stored, parts: n, repo, path, key: k, sha256: sha, ...extra,
    };
    return col().put(rec);
  }

  const blob = (m, onProgress) => readEntry(m.id, toEntry(m), read, onProgress);
  return { usage, pickRepo, upload, blob, limit };
}
