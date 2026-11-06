// 가져온 인증번호 목록 전체를 보고 강도를 어림한다 (공용 access.codeBits 는 번호 하나만 본다).
// 한 자리마다 실제로 나온 글자 수와 글자 종류로 어림하고, 숫자 부분이 이어지는(순서대로 발급) 목록은 크게 깎는다.
// → { bits, sequential, charset }

const norm = s => String(s ?? '').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function estimateBits(list) {
  const codes = list.map(norm).filter(Boolean);
  if (!codes.length) return { bits: 0, sequential: false, charset: 0 };
  const all = codes.join('');
  const charset = /^[0-9]+$/.test(all) ? 10 : /^[0-9A-F]+$/.test(all) ? 16 : 36;
  const maxLen = Math.max(...codes.map(c => c.length));
  const minLen = Math.min(...codes.map(c => c.length));
  let positional = 0;
  for (let i = 0; i < maxLen; i++) {
    const seen = new Set(codes.map(c => c[i]).filter(Boolean));
    // 목록이 작으면 나온 글자 수가 적게 나오므로 글자 종류로 본다. 많은데 한 글자만 나오면(고정 머리) 0비트
    const alpha = codes.length >= 64 ? Math.min(charset, Math.max(1, seen.size)) : seen.size <= 1 && codes.length >= 8 ? 1 : charset;
    positional += Math.log2(alpha);
  }
  if (minLen !== maxLen) positional += Math.log2(maxLen - minLen + 1);
  const nums = codes.map(c => c.replace(/\D/g, '')).filter(x => x.length >= 3).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  let sequential = false;
  if (nums.length >= 5) {
    const span = nums[nums.length - 1] - nums[0];
    if (span / nums.length < 1000) sequential = true;
  }
  const bits = sequential ? Math.min(positional, Math.log2(Math.max(2, (nums[nums.length - 1] - nums[0]) * 4))) : positional;
  return { bits: Math.round(bits * 10) / 10, sequential, charset };
}
