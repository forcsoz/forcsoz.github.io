// 관리자 쪽 저장 — 고칠 때마다 "최근 변경" 기록을 남기고, 지우기는 휴지통(softDelete)만 쓴다.
// 노션에서 옮긴 자료(seed.json + 파일들) 가져오기도 여기.

import { uid } from './core/core.js';
import { createFiles } from './files.js';
import { extractText } from './textract.js';
import { parseRuleText } from './rules.js';
import { allLinks, buildModel, sourceFromCore } from './model.js';

export const KIND = { products: '제품', patches: '패치', notes: '참고 문서', compat: '호환성', refs: '자료', settings: '설정', docs: '파일', links: '링크', people: '사람' };

const FIELD = {
  title: '제목', short: '짧은 이름', code: '번호', noticeUrl: '기술공지', noticeDate: '공지일', products: '대상 제품', productsText: '대상 제품(글)',
  ruleText: '패치 버전', rules: '패치 버전 규칙', ruleDetails: '패치 버전 상세', extras: '권장 빌드', downloads: '다운로드', guides: '가이드 문서',
  guideNote: '가이드 메모', history: '대응이력', faq: '고객 FAQ', notes: '컨설팅 참고사항', notePages: '참고 문서', checks: '확인 필요', order: '순서',
  name: '이름', group: '분류', versionKind: '버전 종류', aliases: '다른 이름', hints: '도움말', body: '내용', date: '날짜', version: '버전',
  latest: '최신 패치 파일', files: '파일', links: '링크', kind: '종류', patch: '패치', tier: '보이는 범위', slot: '로그인 코드', status: '상태',
};
const META = new Set(['id', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'deletedAt', 'deletedBy', '_conflicts']);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function diffFields(prev, next) {
  const keys = new Set([...Object.keys(prev || {}), ...Object.keys(next || {})]);
  return [...keys].filter(k => !META.has(k) && !same(prev?.[k], next?.[k]));
}

const titleOf = (col, r) => {
  if (!r) return '';
  if (col === 'patches') return `[${r.code || r.id}] ${r.title || ''}`;
  if (col === 'compat') return `호환성 ${r.date || ''}`;
  if (col === 'settings' && r.id === 'home') return '홈 · 최신 패치 파일';
  return r.title || r.name || r.label || r.id;
};

export function createAdmin({ core, files: filesOpt = {} }) {
  const files = createFiles({ core, ...filesOpt });
  const col = name => core.collection(name);

  async function log(colName, rec, kind, fields, summary) {
    const user = core.status().user || '';
    await col('changes').put({
      id: uid(), at: new Date().toISOString(), by: user, kind, col: colName, target: rec.id, title: titleOf(colName, rec),
      fields, summary: summary || (kind === 'deleted' ? '휴지통으로' : kind === 'restored' ? '되살림' : kind === 'created' ? '새로 만듦' : `${fields.map(f => FIELD[f] || f).join(', ')} 고침`),
    });
  }

  // 저장 + 변경 기록. 바뀐 것이 없으면 아무것도 안 함 → 돌려주는 값: { rec, fields }
  async function save(colName, rec, { summary, quiet = false } = {}) {
    const prev = rec.id ? col(colName).get(rec.id) : null;
    const fields = diffFields(prev, rec);
    if (prev && !fields.length) return { rec: prev, fields };
    const saved = await col(colName).put(rec);
    if (!quiet) await log(colName, saved, prev ? 'updated' : 'created', fields, summary);
    return { rec: saved, fields };
  }

  async function remove(colName, id) {
    const r = await col(colName).softDelete(id);
    await log(colName, r, 'deleted', [], '');
    return r;
  }

  async function restore(colName, id) {
    const r = await col(colName).restore(id);
    await log(colName, r, 'restored', [], '');
    return r;
  }

  // 매트릭스 칸 하나 (패치의 대상 제품)
  async function toggleCell(patchId, productId) {
    const p = col('patches').get(patchId);
    if (!p) throw new Error('패치를 찾을 수 없어요.');
    const on = (p.products || []).includes(productId);
    const order = col('products').list().map(x => x.id);
    const next = on ? p.products.filter(x => x !== productId) : [...(p.products || []), productId].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const pname = col('products').get(productId)?.name || productId;
    return save('patches', { ...p, products: next }, { summary: `매트릭스 ${pname} ${on ? 'O → 빈칸' : '빈칸 → O'}` });
  }

  // PDF·PPTX 올리기 → docs 기록 (검색용 글자도 뽑아 둔다)
  async function uploadDoc(file, { name, onProgress, id } = {}) {
    const { text, pages } = await extractText(file);
    const rec = await files.upload(file, { name: name || file.name, extra: { text, pages }, onProgress, id });
    if (!rec.reused) await log('docs', rec, 'created', ['name'], `파일 올림: ${rec.name}`);
    return rec;
  }

  async function renameDoc(id, name) {
    const d = col('docs').get(id);
    return save('docs', { ...d, name });
  }

  // 링크 확인 표시 (관리자가 직접 열어 보고)
  async function markLink(url, ok, note = '') {
    const id = 'l' + (await shortHash(url));
    const prev = col('links').get(id);
    const rec = { id, url, ok, note, at: new Date().toISOString(), by: core.status().user || '' };
    await col('links').put(rec);
    if (!prev || prev.ok !== ok) await log('links', { id, title: url }, 'updated', ['ok'], `링크 ${ok ? '정상' : '깨짐'} 표시: ${url}`);
    return rec;
  }

  // ---------- 노션에서 옮긴 자료 가져오기 ----------
  // seed: seed.json 내용, fileFor(src) → File|Blob (seed.files[].src 로 찾기). 이미 있는 id 는 overwrite 일 때만 바꾼다(지우지는 않음)
  async function importSeed(seed, fileFor, { overwrite = false, onProgress = () => {} } = {}) {
    if (seed?.kind !== 'forcsoz-seed') throw new Error('seed.json 이 아니에요 (kind: forcsoz-seed).');
    const counts = { files: 0, filesReused: 0, products: 0, patches: 0, notes: 0, compat: 0, refs: 0, settings: 0, skipped: 0, missingFiles: [] };
    const idMap = {};
    const list = seed.files || [];
    for (const [i, f] of list.entries()) {
      onProgress(`파일 ${i + 1}/${list.length}: ${f.name}`, i / Math.max(1, list.length));
      const have = col('docs').list({ deleted: 'all' }).find(d => d.sha256 === f.sha256);
      if (have) { idMap[f.id] = have.id; counts.filesReused++; continue; }
      const blob = await fileFor(f.src, f);
      if (!blob) { counts.missingFiles.push(f.name); continue; }
      const file = blob instanceof File ? blob : new File([blob], f.name, { type: f.type });
      const bytes = new Uint8Array(await file.arrayBuffer());
      const d = await crypto.subtle.digest('SHA-256', bytes);
      const hex = [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
      if (f.sha256 && hex !== f.sha256) throw new Error(`${f.name}: 파일 내용이 seed.json 과 달라요 (sha256).`);
      const rec = await uploadDoc(new File([bytes], f.name, { type: f.type }), { name: f.name });
      idMap[f.id] = rec.id;
      counts.files++;
    }
    const mapFile = id => idMap[id] || id;
    const fixPatch = p => ({ ...p, guides: (p.guides || []).map(g => ({ ...g, items: (g.items || []).map(it => ({ ...it, file: mapFile(it.file) })) })) });
    const fixRef = r => ({ ...r, files: (r.files || []).map(mapFile) });
    const groups = [['products', seed.products, x => x], ['patches', seed.patches, fixPatch], ['notes', seed.notes, x => x], ['compat', seed.compat, x => x], ['refs', seed.refs, fixRef], ['settings', seed.settings, x => x]];
    for (const [name, recs, fix] of groups) {
      onProgress(`${KIND[name] || name} 넣는 중`, 0.95);
      for (const r of recs || []) {
        if (col(name).get(r.id) && !overwrite) { counts.skipped++; continue; }
        const { fields } = await save(name, fix(r), { summary: '노션에서 가져옴' });
        if (fields.length) counts[name]++;
      }
    }
    const s = col('settings').get('source');
    await col('settings').put({ ...(s || {}), id: 'source', ...seed.source, importedAt: new Date().toISOString(), importedBy: core.status().user || '' });
    onProgress('끝', 1);
    return counts;
  }

  // ---------- 데이터 점검 ----------
  function lint() {
    const m = buildModel(sourceFromCore(core));
    const out = [];
    const fileIds = new Set(Object.keys(m.files));
    const used = new Set();
    for (const p of m.patches) {
      const w = `[${p.code}]`;
      if (!p.products?.length) out.push({ level: 'warn', where: w, route: `#/patch/${p.id}`, text: '대상 제품이 없어요 (매트릭스가 비어 있음).' });
      if (!p.rules?.length) out.push({ level: 'warn', where: w, route: `#/edit/patches/${p.id}`, text: '패치 버전 규칙이 없어서 패치 확인이 "확인 필요" 로만 나와요.' });
      const parsed = parseRuleText(p.ruleText);
      if (p.ruleText && (parsed.errors.length || JSON.stringify(parsed.rules.map(r => [r.min, r.max])) !== JSON.stringify((p.rules || []).map(r => [r.min, r.max])))) {
        out.push({ level: 'info', where: w, route: `#/edit/patches/${p.id}`, text: `패치 버전 글("${p.ruleText}")과 규칙 칸이 달라요. 의도한 것인지 확인해 주세요.` });
      }
      for (const g of p.guides || []) for (const it of g.items || []) {
        if (it.file) used.add(it.file);
        if (it.file && !fileIds.has(it.file)) out.push({ level: 'error', where: w, route: `#/edit/patches/${p.id}`, text: `가이드 "${it.label}" 의 파일이 없어요 (휴지통?).` });
      }
      for (const pid of p.products || []) if (!m.productById.has(pid)) out.push({ level: 'error', where: w, route: `#/edit/patches/${p.id}`, text: `없는 제품 "${pid}" 이 대상에 있어요.` });
      for (const c of p.checks || []) out.push({ level: 'info', where: w, route: `#/patch/${p.id}`, text: `확인 필요: ${c.text}` });
    }
    for (const r of m.refs) for (const f of r.files || []) used.add(f);
    for (const id of fileIds) if (!used.has(id)) out.push({ level: 'info', where: m.files[id].name, route: `#/file/${id}`, text: '어디에도 걸려 있지 않은 파일이에요.' });
    for (const pr of m.products) if (!m.patches.some(p => p.products?.includes(pr.id))) out.push({ level: 'info', where: pr.name, route: `#/product/${pr.id}`, text: '대상인 보안 패치가 없는 제품이에요.' });
    for (const l of allLinks(m)) if (!/^https?:\/\//.test(l.url)) out.push({ level: 'error', where: l.where, route: l.route, text: `링크 주소가 올바르지 않아요: ${l.url}` });
    return out;
  }

  return { files, save, remove, restore, toggleCell, uploadDoc, renameDoc, markLink, importSeed, lint, log };
}

async function shortHash(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}
