// 작은 마크다운 → HTML (안전하게: 글자는 모두 이스케이프, 링크는 http(s) 만)
// 지원: ### 제목, 문단(줄바꿈 유지), - 목록(2칸 들여쓰기로 겹침), 1. 번호 목록, > 상자(안에 다시 마크다운), ``` 코드 ```,
//       **굵게**, `코드`, [글](주소)

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function safeUrl(u) {
  const s = String(u || '').trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

export function inline(s) {
  const out = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]*)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m;
  const text = String(s ?? '');
  while ((m = re.exec(text))) {
    out.push(esc(text.slice(last, m.index)));
    if (m[1] != null) out.push(`<code>${esc(m[1])}</code>`);
    else if (m[2] != null) out.push(`<b>${esc(m[2])}</b>`);
    else {
      const u = safeUrl(m[4]);
      out.push(u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(m[3] || u)}</a>` : esc(m[0]));
    }
    last = re.lastIndex;
  }
  out.push(esc(text.slice(last)));
  return out.join('');
}

export function md(src) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      html.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    let m = /^(#{1,4})\s+(.*)$/.exec(line);
    if (m) {
      const lv = Math.min(6, m[1].length + 2);
      html.push(`<h${lv}>${inline(m[2])}</h${lv}>`);
      i++;
      continue;
    }
    if (/^>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      html.push(`<div class="callout">${md(buf.join('\n'))}</div>`);
      continue;
    }
    if (/^\s*([-*•]|\d+\.)\s+/.test(line)) {
      const buf = [];
      while (i < lines.length && (/^\s*([-*•]|\d+\.)\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && buf.length))) buf.push(lines[i++]);
      html.push(list(buf));
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|>|```|\s*([-*•]|\d+\.)\s+)/.test(lines[i])) buf.push(lines[i++]);
    html.push(`<p>${buf.map(inline).join('<br>')}</p>`);
  }
  return html.join('');
}

function list(lines) {
  const items = [];
  const ordered = /^\s*\d+\./.test(lines[0]);
  const base = lines[0].match(/^\s*/)[0].length;
  for (const l of lines) {
    const ind = l.match(/^\s*/)[0].length;
    const m = /^\s*([-*•]|\d+\.)\s+(.*)$/.exec(l);
    if (m && ind <= base) items.push({ text: m[2], sub: [] });
    else if (items.length) items[items.length - 1].sub.push(l.slice(Math.min(ind, base + 2)));
  }
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag}>${items.map(it => {
    const subList = it.sub.filter(s => /^\s*([-*•]|\d+\.)\s+/.test(s));
    const cont = it.sub.filter(s => !/^\s*([-*•]|\d+\.)\s+/.test(s));
    return `<li>${inline(it.text)}${cont.length ? '<br>' + cont.map(s => inline(s.trim())).join('<br>') : ''}${subList.length ? list(subList) : ''}</li>`;
  }).join('')}</${tag}>`;
}
