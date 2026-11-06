// 패치 버전 규칙 · 패치 확인 (순수 함수, 화면·저장과 무관)
//
// 버전: OZ 제품은 51·60·70·80·90 (노션의 "80이상" 과 같은 꼴), WebLauncher·WebAgent 는 10.
//   입력은 "8.0" "8" "80" "9.0" "1.0" "10" 모두 받는다. "80.2026.0315.100" 처럼 버전과 빌드를 붙여 써도 된다.
// 빌드: "2026.0315" 또는 "2026.0315.100". "20260315" "2026-03-15" "2026.3.15" 도 받는다.
// 규칙: [{ min, max, build }] — min ≤ 버전 ≤ max(없으면 끝없음) 인 고객은 build "이후"(같은 빌드 포함) 이면 적용됨.
//   글 "80이상 2026.0101 이후" → [{ min: 80, max: null, build: '2026.0101' }]
//   "80 2026.1002 이후 / 90 2026.1006 이후" → [{ min: 80, max: 80, build: '2026.1002' }, { min: 90, max: 90, build: '2026.1006' }]

// ---------- 버전 ----------
export function parseVersion(s) {
  const t = String(s ?? '').trim().replace(/^v/i, '');
  if (!t) return null;
  let m = /^(\d)\.(\d)$/.exec(t);
  if (m) return Number(m[1]) * 10 + Number(m[2]);
  m = /^(\d)$/.exec(t);
  if (m) return Number(m[1]) * 10;
  m = /^(\d{2})$/.exec(t);
  if (m) return Number(m[1]);
  return null;
}

export function fmtVer(v, kind = 'oz') {
  if (v == null) return '';
  if (kind === 'oz') return `${Math.floor(v / 10)}.${v % 10}`;
  return String(v);
}

// ---------- 빌드 ----------
// → { y, md, sub, text } | null    md = 월*100+일, sub = 뒤의 번호(.100) 또는 null
export function parseBuild(s) {
  const t = String(s ?? '').trim();
  if (!t) return null;
  let m = /^(\d{4})[.\-/ ]?(\d{2})(\d{2})(?:[.\-](\d{1,6}))?$/.exec(t);
  if (!m) m = /^(\d{4})[.\-/ ](\d{1,2})[.\-/ ](\d{1,2})(?:[.\-](\d{1,6}))?$/.exec(t);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 2000 || y > 2099 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const sub = m[4] != null ? Number(m[4]) : null;
  const text = `${y}.${String(mo).padStart(2, '0')}${String(d).padStart(2, '0')}${sub != null ? '.' + m[4] : ''}`;
  return { y, md: mo * 100 + d, sub, text };
}

// a 와 b(기준) 비교 → -1 | 0 | 1 | null (같은 날인데 a 에 뒤 번호가 없어 정할 수 없음)
export function cmpBuild(a, b) {
  if (a.y !== b.y) return a.y < b.y ? -1 : 1;
  if (a.md !== b.md) return a.md < b.md ? -1 : 1;
  if (b.sub == null) return 0;
  if (a.sub == null) return null;
  return a.sub === b.sub ? 0 : a.sub < b.sub ? -1 : 1;
}

// "80.2026.0315.100" · "8.0 2026.0315" · "10.2026.0714.100" → { ver, build } (못 읽으면 null)
export function parseFull(s) {
  const t = String(s ?? '').trim();
  let m = /^(\d{2})\.(\d{4}\.\d{4}(?:\.\d+)?)$/.exec(t);
  if (!m) m = /^(\d(?:\.\d)?|\d{2})\s+(\S+)$/.exec(t);
  if (!m) return null;
  const ver = parseVersion(m[1]);
  const build = parseBuild(m[2]);
  return ver != null && build ? { ver, build } : null;
}

// ---------- 규칙 글 읽기 ----------
// → { rules: [{min,max,build}], errors: [글자] }
export function parseRuleText(text) {
  const rules = [];
  const errors = [];
  const parts = String(text || '').split(/\s*\/\s*|\s*,\s*(?=\d{2}\s*(?:이상|이하)?\s+\d{4})|\n/).map(s => s.trim()).filter(Boolean);
  for (const p of parts) {
    const m = /^(\d(?:\.\d)?|\d{2})\s*(이상|이하)?\s*(?:버전)?\s*[:：]?\s*(\d{4}[.\-]?\d{2}[.\-]?\d{2}(?:\.\d+)?)\s*(이후|부터)?/.exec(p);
    if (!m) { errors.push(p); continue; }
    const v = parseVersion(m[1]);
    const b = parseBuild(m[3]);
    if (v == null || !b) { errors.push(p); continue; }
    rules.push({ min: m[2] === '이하' ? null : v, max: m[2] === '이상' ? null : v, build: b.text });
  }
  return { rules, errors };
}

export const inRange = (v, r) => r == null || ((r.min == null || v >= r.min) && (r.max == null || v <= r.max));

export function fmtRange(r, kind = 'oz') {
  if (!r) return '모든 버전';
  if (r.min != null && r.max != null) return r.min === r.max ? fmtVer(r.min, kind) : `${fmtVer(r.min, kind)}~${fmtVer(r.max, kind)}`;
  if (r.min != null) return `${fmtVer(r.min, kind)} 이상`;
  if (r.max != null) return `${fmtVer(r.max, kind)} 이하`;
  return '모든 버전';
}

export const fmtRule = (r, kind = 'oz') => `${fmtRange(r, kind)} · ${r.build} 이후`;

// ---------- 패치 확인 ----------
export const STATUS = {
  missing: { label: '패치 필요', rank: 0 },
  unknown: { label: '확인 필요', rank: 1 },
  ok: { label: '적용됨', rank: 2 },
};

// rows: [{ product: id, ver: 80, build: parseBuild(...)|null }]
// opts.ozVer: 고객의 OZ 버전 (WebLauncher·WebAgent 처럼 제품 버전이 OZ 버전이 아닐 때 가이드·다운로드 고르는 데 씀)
// → { rows: [{ product, ver, build, docVer, items: [{ patch, status, reason, clause, downloads, guides, extras }] }], compat, latest, summary }
export function check(model, rows, opts = {}) {
  const ozVer = opts.ozVer ?? null;
  const out = [];
  const productsSeen = new Set();
  for (const row of rows) {
    const p = model.productById.get(row.product);
    if (!p) continue;
    productsSeen.add(p.id);
    const kind = p.versionKind || 'oz';
    const docVer = kind === 'oz' ? row.ver ?? ozVer : ozVer;
    const items = [];
    for (const patch of model.patches) {
      if (!patch.products?.includes(p.id)) continue;
      const it = { patch, status: 'unknown', reason: '', clause: null, extras: [] };
      const rules = patch.rules || [];
      if (row.ver == null) {
        it.reason = '버전을 넣으면 판정해요.';
      } else {
        const clause = rules.find(r => inRange(row.ver, r));
        it.clause = clause || null;
        if (!clause) {
          it.reason = rules.length
            ? `${fmtVer(row.ver, kind)} 은(는) 패치 버전 규칙(${patch.ruleText || rules.map(r => fmtRule(r, kind)).join(' / ')})에 없는 버전이에요. 담당자 확인이 필요해요.`
            : '패치 버전 규칙이 아직 없어요.';
        } else if (!row.build) {
          it.reason = `빌드를 넣으면 판정해요 (${clause.build} 이후면 적용됨).`;
        } else {
          const c = cmpBuild(row.build, parseBuild(clause.build));
          if (c == null) {
            it.reason = `빌드 날짜가 같아요. 뒤 번호까지 확인해 주세요 (${clause.build} 이후).`;
          } else if (c >= 0) {
            it.status = 'ok';
            it.reason = `${row.build.text} ≥ ${clause.build}`;
          } else {
            it.status = 'missing';
            it.reason = `${row.build.text} < ${clause.build}`;
          }
        }
        if (row.build) {
          for (const x of patch.extras || []) {
            if (!inRange(row.ver, x)) continue;
            const xb = parseBuild(x.build);
            const c = xb && cmpBuild(row.build, xb);
            if (xb && c != null && c < 0) it.extras.push({ ...x, need: true });
            else if (xb && c == null) it.extras.push({ ...x, need: null });
          }
        }
      }
      it.downloads = pickDownloads(patch, docVer);
      it.guides = pickGuides(patch, p.id, docVer);
      items.push(it);
    }
    items.sort((a, b) => STATUS[a.status].rank - STATUS[b.status].rank || (a.patch.order ?? 0) - (b.patch.order ?? 0));
    out.push({ product: p, ver: row.ver, build: row.build, docVer, items });
  }
  const compat = (model.compat || []).filter(c => (c.products || []).some(id => productsSeen.has(id)));
  const vers = new Set(out.map(r => r.docVer).filter(v => v != null));
  const latest = model.home?.latest ? { ...model.home.latest, items: (model.home.latest.items || []).filter(i => !vers.size || !i.ver || [...vers].some(v => inRange(v, i.ver))) } : null;
  const summary = { missing: 0, unknown: 0, ok: 0 };
  for (const r of out) for (const it of r.items) summary[it.status]++;
  return { rows: out, compat, latest, summary, ozVer };
}

export function pickDownloads(patch, docVer) {
  const d = patch.downloads;
  if (!d) return null;
  const items = (d.items || []).filter(i => docVer == null || !i.ver || inRange(docVer, i.ver));
  return { ...d, items, all: d.items || [] };
}

export function pickGuides(patch, productId, docVer) {
  const out = [];
  for (const g of patch.guides || []) {
    if (g.products?.length && !g.products.includes(productId)) continue;
    for (const it of g.items || []) {
      if (it.products?.length && !it.products.includes(productId)) continue;
      if (docVer != null && it.ver && !inRange(docVer, it.ver)) continue;
      out.push({ ...it, group: g.title || '' });
    }
  }
  return out;
}

// ---------- 붙여 넣을 답 ----------
// format: 'mail' | 'chat'. internal: 대응이력·컨설팅 참고 같은 사내 링크도 넣기
export function answerText(model, res, { format = 'mail', internal = false, customer = '', today = new Date() } = {}) {
  const L = [];
  const fileName = id => model.files[id]?.name || id;
  const d = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const mail = format === 'mail';
  const env = r => `${r.product.name} ${r.ver != null ? fmtVer(r.ver, r.product.versionKind) : '(버전 모름)'}${r.build ? ' / ' + r.build.text : ''}`;
  if (mail) {
    L.push(`[OZ 보안 패치 확인] ${customer ? customer + ' · ' : ''}${d} 기준`);
    L.push('');
    L.push('확인한 환경: ' + res.rows.map(env).join(', '));
    L.push('');
  } else {
    L.push(`OZ 보안 패치 확인${customer ? ' (' + customer + ')' : ''} — ${d}`);
  }
  const need = [];
  for (const r of res.rows) {
    if (mail) L.push(`■ ${env(r)}`);
    else L.push(`▶ ${env(r)}`);
    if (!r.items.length) L.push(mail ? '  - 해당하는 보안 패치가 없습니다.' : '  해당 패치 없음');
    for (const it of r.items) {
      const p = it.patch;
      const head = `[${p.code}] ${p.title}`;
      if (it.status === 'ok') {
        L.push(mail ? `  - 적용됨: ${head}` : `  ✓ ${p.code} 적용됨`);
        continue;
      }
      if (it.status === 'missing') need.push(p.code);
      const tag = it.status === 'missing' ? '패치 필요' : '확인 필요';
      L.push(mail ? `  - ${tag}: ${head}` : `  ${it.status === 'missing' ? '✗' : '?'} ${p.code} ${tag} — ${p.short || p.title}`);
      L.push(`      패치 버전: ${p.ruleText || (p.rules || []).map(x => fmtRule(x, r.product.versionKind)).join(' / ')}${it.status === 'unknown' && it.reason ? ' (' + it.reason + ')' : ''}`);
      if (p.noticeUrl) L.push(`      기술공지: ${p.noticeUrl}`);
      for (const dl of it.downloads?.items || []) L.push(`      다운로드 ${dl.label}: ${dl.url}`);
      if (it.guides.length) L.push(`      가이드 문서: ${it.guides.map(g => fileName(g.file)).join(', ')}`);
      for (const x of it.extras) L.push(`      ${x.need ? '권장' : '확인'}: ${x.label} — ${x.build}${x.need ? ' 이후 버전' : ''}`);
      if (internal) {
        for (const h of (p.history || []).filter(x => !x.icon)) L.push(`      (사내) 대응이력: ${h.label} ${h.url}`);
        for (const n of (p.notes || []).filter(x => !x.icon)) L.push(`      (사내) 참고: ${n.label} ${n.url}`);
      }
    }
    if (mail) L.push('');
  }
  for (const c of res.compat) {
    L.push(`${mail ? '※ ' : '※ '}호환성 (${c.date}): ${stripMd(c.body)}${c.version ? ' — ' + c.version : ''}`);
  }
  if (res.latest?.items?.length) {
    L.push(`${mail ? '※ ' : '※ '}${res.latest.title || '최신 패치 파일'}: ${res.latest.items.map(i => `${i.label} ${i.url}`).join(' / ')}${res.latest.note ? ' ' + res.latest.note : ''}`);
  }
  if (!mail) L.push(need.length ? `→ 필요한 패치: ${[...new Set(need)].join(', ')}` : '→ 꼭 필요한 패치 없음 (확인 필요 항목은 위 참고)');
  return L.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function stripMd(s) {
  return String(s || '').replace(/\[([^\]]*)\]\(([^)]+)\)/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');
}

// 확인한 상황을 주소(#/check?r=...)로 — 고객 이름은 넣지 않는다
export function encodeRows(rows, ozVer) {
  const r = rows.map(x => [x.product, x.ver ?? '', x.build?.text ?? ''].join(':')).join(',');
  return `r=${encodeURIComponent(r)}${ozVer != null ? `&oz=${ozVer}` : ''}`;
}
export function decodeRows(q) {
  const sp = new URLSearchParams(q);
  const rows = (sp.get('r') || '').split(',').filter(Boolean).map(s => {
    const [product, v, b] = s.split(':');
    return { product, ver: v ? Number(v) : null, build: parseBuild(b) };
  });
  const oz = sp.get('oz');
  return { rows, ozVer: oz ? Number(oz) : null };
}
