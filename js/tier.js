// 파일 암호화 도우미 · 약한 비밀번호 검사 (권한 단계 자체는 core/access.js 와 tiers.js)

import * as C from './core/crypto.js';

// ---------- 파일(PDF·PPTX) 하나의 암호화 ----------
// 파일마다 무작위 키. 조각(8MB)마다 따로 암호화, AAD = '<파일id>:<조각 번호>'. 키는 암호화된 항목(index.json) 안에만 있다
export const newFileKey = () => C.b64(crypto.getRandomValues(new Uint8Array(32)));
export const fileKey = b64 => crypto.subtle.importKey('raw', C.unb64(b64), 'AES-GCM', false, ['encrypt', 'decrypt']);
export const encPart = async (key, id, part, bytes) => C.encryptBytes(key, bytes, `${id}:${part}`);
export const decPart = async (key, id, part, bytes) => C.decryptBytes(key, bytes, `${id}:${part}`);

// ---------- 약한 비밀번호 (작성자가 코드 대신 직접 정하는 문장) ----------
const COMMON = [
  'password', 'passw0rd', 'qwerty', 'asdf', 'zxcv', 'admin', 'letmein', 'welcome', 'iloveyou', 'abc', 'love', 'test',
  'forcs', 'ozs', 'oz4cs', 'ozreport', 'oztn', 'consult', 'security', 'patch', 'secure', 'team', 'guest', 'manager', 'server',
  '포시에스', '오즈', '컨설팅', '보안', '패치', '비밀번호', '관리자', '사랑', '감사',
];

export function weakReasons(pw) {
  const s = String(pw || '');
  const low = s.toLowerCase();
  const out = [];
  if ([...s].length < 10) out.push('10자보다 짧아요.');
  if (/^\d+$/.test(s)) out.push('숫자만으로 되어 있어요.');
  if (/^[a-z]+$/i.test(s) && s.length < 14) out.push('영어 글자만으로 되어 있어요.');
  if (/(.)\1{2,}/.test(s)) out.push('같은 글자가 3번 넘게 이어져요.');
  const seqs = ['0123456789', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '9876543210'];
  if (seqs.some(q => { for (let i = 0; i + 4 <= q.length; i++) if (low.includes(q.slice(i, i + 4))) return true; return false; })) out.push('1234·abcd·qwer 같은 이어지는 글자가 있어요.');
  const hit = COMMON.find(w => low.includes(w));
  if (hit) out.push(`흔한 낱말(“${hit}”)이 들어 있어요.`);
  if (/(19|20)\d{2}/.test(s) && s.replace(/(19|20)\d{2}/g, '').length < 8) out.push('연도를 빼면 너무 짧아요.');
  if (new Set(s).size < 5) out.push('쓴 글자 종류가 너무 적어요.');
  return out;
}
