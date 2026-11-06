// 화면 전체가 함께 쓰는 상태 (app.js 가 채운다)
export const A = {
  env: null,
  mode: 'loading', // loading | none | site | admin | login | admin-connect
  role: 'public', // 지금 로그인한 역할 (public · customer · team · writer · admin)
  preview: '', // 관리자 미리 보기 역할 ('' 이면 그대로)
  previewScope: [],
  model: null,
  docs: null, // 검색 색인
  admin: null, // createAdmin
  pub: null, // createPublisher
  blobs: new Map(), // 파일 id → Blob (이 탭에서만)
  health: {}, // url → { ok, at } (이 기기에서 점검한 결과)
  lastSeen: '',
  check: { rows: [{ product: '', ver: '', build: '' }], oz: '', customer: '', format: 'mail', internal: false },
  mx: { prods: [], patches: [], hitOnly: false, edit: false, group: '' },
  pf: { product: '', q: '' },
  edit: null, // { col, id, draft, isNew }
  render: () => {},
};

// 화면이 따르는 역할 (관리자 미리 보기면 그 역할)
export const viewRole = () => A.preview || A.role;
const RANK = { public: 0, customer: 1, team: 2, writer: 3, admin: 4 };
export const can = need => (RANK[viewRole()] ?? 0) >= RANK[need];
