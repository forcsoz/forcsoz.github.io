// 화면이 쓰는 모델 — 팀원 묶음(bundle) 이든 관리자 데이터(collections) 든 같은 모양으로 만든다
//
// model = { products, patches, notes, compat, refs, home, files: { id: { n,t,s,r,p,c,k, name, type, size, text, pages } },
//           changes, links: { url: { ok, at, by, note } }, publishedAt, publishedBy, rev,
//           productById, patchById, noteById }

const byOrder = (a, b) => (a.order ?? 999) - (b.order ?? 999) || String(a.id).localeCompare(String(b.id));

export function buildModel(src) {
  const m = {
    products: [...(src.products || [])].sort(byOrder),
    patches: [...(src.patches || [])].sort(byOrder),
    notes: [...(src.notes || [])],
    compat: [...(src.compat || [])].sort(byOrder),
    refs: [...(src.refs || [])].sort(byOrder),
    home: src.home || {},
    files: src.files || {},
    changes: [...(src.changes || [])].sort((a, b) => (b.at || '').localeCompare(a.at || '')),
    links: src.links || {},
    publishedAt: src.publishedAt || '',
    publishedBy: src.publishedBy || '',
    rev: src.rev || '',
  };
  m.productById = new Map(m.products.map(p => [p.id, p]));
  m.patchById = new Map(m.patches.map(p => [p.id, p]));
  m.noteById = new Map(m.notes.map(n => [n.id, n]));
  return m;
}

// 묶음/모델에 넣지 않는 관리용 칸
const STRIP = ['createdAt', 'createdBy', 'deletedAt', 'deletedBy', '_conflicts'];
export function publicRec(r) {
  const o = {};
  for (const [k, v] of Object.entries(r)) if (!STRIP.includes(k)) o[k] = v;
  return o;
}

// 관리자 데이터(core) → 묶음과 같은 모양의 원본
export function sourceFromCore(core, { changesLimit = 300 } = {}) {
  const L = name => core.collection(name).list().map(publicRec);
  const files = {};
  for (const d of core.collection('docs').list()) {
    files[d.id] = { n: d.name, t: d.type, s: d.size, r: d.repo, p: d.path, c: d.parts, k: d.key, name: d.name, type: d.type, size: d.size, text: d.text || '', pages: d.pages || 0, updatedAt: d.updatedAt, updatedBy: d.updatedBy };
  }
  const links = {};
  for (const l of core.collection('links').list()) links[l.url] = { ok: l.ok, at: l.at, by: l.by, note: l.note || '' };
  const home = core.collection('settings').get('home');
  const team = core.collection('settings').get('team');
  const changes = core.collection('changes').list().sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, changesLimit).map(c => ({ id: c.id, at: c.at, by: c.by, kind: c.kind, target: c.target, title: c.title, summary: c.summary, fields: c.fields || [] }));
  return {
    products: L('products'), patches: L('patches'), notes: L('notes'), compat: L('compat'), refs: L('refs'),
    home: home ? publicRec(home) : {}, files, changes, links,
    publishedAt: team?.publishedAt || '', publishedBy: team?.publishedBy || '', rev: team?.publishedHash || '',
  };
}

// ---------- 모든 바깥 링크 모으기 (링크 점검·검색에 씀) ----------
export function allLinks(m) {
  const out = [];
  const add = (l, where, route, section) => { if (l?.url) out.push({ url: l.url, label: l.label || l.url, icon: !!l.icon, where, route, section }); };
  const md = (text, where, route, section) => {
    for (const x of String(text || '').matchAll(/\[([^\]]*)\]\(([^)\s]+)\)/g)) add({ label: x[1], url: x[2] }, where, route, section);
  };
  for (const p of m.patches) {
    const w = `[${p.code}]`;
    const r = `#/patch/${p.id}`;
    add({ label: '기술공지', url: p.noticeUrl }, w, r, '기술공지');
    if (p.downloads) {
      add(p.downloads.hub, w, r, '다운로드');
      for (const d of p.downloads.items || []) add(d, w, r, '다운로드');
    }
    for (const l of p.history || []) add(l, w, r, '대응이력');
    for (const l of p.faq || []) add(l, w, r, '고객 FAQ');
    for (const l of p.notes || []) add(l, w, r, '컨설팅 참고사항');
  }
  if (m.home?.latest) {
    add(m.home.latest.hub, '홈', '#/', m.home.latest.title || '최신 패치 파일');
    for (const d of m.home.latest.items || []) add(d, '홈', '#/', m.home.latest.title || '최신 패치 파일');
  }
  for (const c of m.compat) md(c.body, `호환성 ${c.date || ''}`, '#/docs', '서버, 뷰어 호환성');
  for (const r of m.refs) {
    for (const l of r.links || []) add(l, r.title, '#/docs', r.title);
    md(r.body, r.title, '#/docs', r.title);
  }
  for (const n of m.notes) md(n.body, n.title, `#/note/${n.id}`, '참고 문서');
  return out;
}

// 링크 종류 (사내망·구글 문서·공개 기술지원 등)
export function linkKind(url) {
  let u;
  try { u = new URL(url); } catch { return { kind: 'bad', label: '주소 오류' }; }
  const h = u.hostname;
  if (/(^|\.)oz4cs\.com$/.test(h)) return { kind: 'internal', label: '사내망', probe: false };
  if (u.protocol === 'http:') return { kind: 'http', label: 'http (보안 연결 아님)', probe: false };
  if (h === 'docs.google.com' || h === 'drive.google.com') return { kind: 'google', label: 'Google 문서 (권한 필요)', probe: true };
  if (h === 'oztn.net' || h.endsWith('.oztn.net')) return { kind: 'oztn', label: 'oztn 기술지원', probe: true };
  return { kind: 'other', label: h, probe: false };
}

// ---------- 검색 ----------
const norm = s => String(s || '').normalize('NFC').toLowerCase();

export function searchDocs(m) {
  const docs = [];
  const prodNames = ids => (ids || []).map(id => m.productById.get(id)?.name || id).join(' ');
  for (const p of m.patches) {
    const parts = [
      p.code, p.title, p.short, p.productsText, prodNames(p.products), p.ruleText, ...(p.ruleDetails || []), p.guideNote,
      p.downloads?.note, ...(p.downloads?.items || []).map(d => d.label + ' ' + d.url),
      ...(p.guides || []).flatMap(g => [g.title, ...(g.items || []).map(i => `${i.label} ${m.files[i.file]?.name || ''}`)]),
      ...['history', 'faq', 'notes'].flatMap(k => (p[k] || []).map(l => l.label)),
      ...(p.checks || []).map(c => c.text),
    ];
    docs.push({ type: '패치', id: p.id, title: `[${p.code}] ${p.title}`, text: parts.filter(Boolean).join('\n'), route: `#/patch/${p.id}` });
  }
  for (const pr of m.products) docs.push({ type: '제품', id: pr.id, title: pr.name, text: [pr.name, pr.group, ...(pr.aliases || []), ...(pr.hints || []).map(h => h.text)].join('\n'), route: `#/product/${pr.id}` });
  for (const n of m.notes) docs.push({ type: '참고', id: n.id, title: n.title, text: `${n.title}\n${n.body || ''}`, route: `#/note/${n.id}` });
  for (const c of m.compat) docs.push({ type: '호환성', id: c.id, title: `호환성 ${c.date || ''}`, text: `${c.body}\n${c.version || ''}`, route: '#/docs' });
  for (const r of m.refs) docs.push({ type: '자료', id: r.id, title: r.title, text: `${r.title}\n${r.body || ''}\n${(r.links || []).map(l => l.label).join(' ')}`, route: '#/docs' });
  for (const [id, f] of Object.entries(m.files)) docs.push({ type: f.type?.includes('pdf') ? 'PDF' : '문서', id, title: f.name, text: `${f.name}\n${f.text || ''}`, route: `#/file/${id}`, file: id });
  for (const d of docs) d.ntext = norm(d.text);
  return docs;
}

// → [{ doc, score, snippet: [앞, 맞은 글자, 뒤] }]
export function search(docs, q, { limit = 60 } = {}) {
  const terms = norm(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const out = [];
  for (const d of docs) {
    if (!terms.every(t => d.ntext.includes(t))) continue;
    const nt = norm(d.title);
    let score = 0;
    for (const t of terms) {
      if (nt.includes(t)) score += 10;
      score += Math.min(5, d.ntext.split(t).length - 1);
    }
    if (d.type === '패치') score += 3;
    const at = d.ntext.indexOf(terms[0]);
    const s = Math.max(0, at - 40);
    const raw = d.text.normalize('NFC');
    const snippet = [(s > 0 ? '…' : '') + raw.slice(s, at).replace(/\s+/g, ' '), raw.slice(at, at + terms[0].length), raw.slice(at + terms[0].length, at + 120).replace(/\s+/g, ' ') + '…'];
    out.push({ doc: d, score, snippet });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
