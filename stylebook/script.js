const DB_KEY = 'kimikea_stylebook_gallery_db_v1';
const SESSION_KEY = 'kimikea_stylebook_current_user_v1';
const SCROLL_KEY = 'kimikea_stylebook_scroll_y_v1';
const PAGE_SIZE = 18;
const DEBUG_STYLEBOOK = false;

// Google Apps ScriptのWebアプリURLを設定すると、投稿・下書き・保存が本番DBへ保存されます。
// 未設定の場合は、画面確認用としてブラウザ内保存で動作します。
const STYLEBOOK_API_URL = 'https://script.google.com/macros/s/AKfycbwPJPYIHNtVXh8I1CCs7SAZT-Ow6JeHNnazz_YRrK4m_Rr_jjy7UYPJCJx19RcklLam/exec';

const roles = {
  member: 'member',
  contributor: 'contributor',
  shop_admin: 'shop_admin',
  headquarters_admin: 'headquarters_admin',
};

const EXTENSION_COLOR_CATEGORIES = new Set(['ダークカラー', 'ライトカラー', '原色']);

const state = {
  db: null,
  currentUserId: localStorage.getItem(SESSION_KEY) || 'user-member',
  selectedColorIds: new Set(),
  selectedStyleTypeIds: new Set(),
  selectedShopIds: new Set(),
  selectedStaffIds: new Set(),
  savedOnly: false,
  sort: 'new',
  visibleCount: PAGE_SIZE,
  currentView: 'menu',
  currentDetailId: '',
  currentEditId: '',
  currentImageData: '',
  currentAdditionalImageData: [],
  backendMode: 'local',
  isLoading: false,
  adminTab: 'posts',
  actionEventCount: 0,
  pendingActionName: '',
  historyReady: false,
  appHistory: [],
  isRestoringAppHistory: false,
  immediateActionUntil: 0,
};

const el = {
  userSelect: document.getElementById('userSelect'),
  filterToggle: document.getElementById('filterToggle'),
  filterPanel: document.getElementById('filterPanel'),
  colorFilters: document.getElementById('colorFilters'),
  styleFilters: document.getElementById('styleFilters'),
  shopFilter: document.getElementById('shopFilter'),
  staffFilter: document.getElementById('staffFilter'),
  savedOnlyToggle: document.getElementById('savedOnlyToggle'),
  sortSelect: document.getElementById('sortSelect'),
  activeChips: document.getElementById('activeChips'),
  clearFiltersButton: document.getElementById('clearFiltersButton'),
  resultCount: document.getElementById('resultCount'),
  stylebookPostCount: document.getElementById('stylebookPostCount'),
  galleryGrid: document.getElementById('galleryGrid'),
  savedGrid: document.getElementById('savedGrid'),
  draftsGrid: document.getElementById('draftsGrid'),
  mineGrid: document.getElementById('mineGrid'),
  menuAdminCard: document.getElementById('menuAdminCard'),
  infiniteSentinel: document.getElementById('infiniteSentinel'),
  galleryView: document.getElementById('galleryView'),
  detailView: document.getElementById('detailView'),
  postView: document.getElementById('postView'),
  savedView: document.getElementById('savedView'),
  adminView: document.getElementById('adminView'),
  adminDenied: document.getElementById('adminDenied'),
  adminContent: document.getElementById('adminContent'),
  adminStats: document.getElementById('adminStats'),
  adminTable: document.getElementById('adminTable'),
  openAdminButton: document.getElementById('openAdminButton'),
  postForm: document.getElementById('postForm'),
  postFormTitle: document.getElementById('postFormTitle'),
  postId: document.getElementById('postId'),
  imageInput: document.getElementById('imageInput'),
  imagePreview: document.getElementById('imagePreview'),
  additionalImagesInput: document.getElementById('additionalImagesInput'),
  additionalImageFiles: document.getElementById('additionalImageFiles'),
  titleInput: document.getElementById('titleInput'),
  descriptionInput: document.getElementById('descriptionInput'),
  colorSearchInput: document.getElementById('colorSearchInput'),
  colorChoiceList: document.getElementById('colorChoiceList'),
  selectedColorSummary: document.getElementById('selectedColorSummary'),
  colorSelect: document.getElementById('colorSelect'),
  styleTypeSelect: document.getElementById('styleTypeSelect'),
  extensionCountInput: document.getElementById('extensionCountInput'),
  statusInput: document.getElementById('statusInput'),
  salonNameInput: document.getElementById('salonNameInput'),
  staffNameInput: document.getElementById('staffNameInput'),
  shopNameOptions: document.getElementById('shopNameOptions'),
  staffNameOptions: document.getElementById('staffNameOptions'),
  shopSelect: document.getElementById('shopSelect'),
  staffSelect: document.getElementById('staffSelect'),
  cancelEditButton: document.getElementById('cancelEditButton'),
  formMessage: document.getElementById('formMessage'),
};

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function todayIso(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() - offset);
  return date.toISOString();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function debugStylebook(label, data = {}) {
  if (!DEBUG_STYLEBOOK) return;
  try {
    console.info(`[Kimikea Stylebook DEBUG] ${label}`, data);
  } catch (error) {
    console.info(`[Kimikea Stylebook DEBUG] ${label}`);
  }
}

function driveFileIdFromUrl(url) {
  const value = String(url || '');
  const patterns = [
    /[?&]id=([^&]+)/,
    /\/d\/([^/=]+)/,
    /\/file\/d\/([^/]+)/,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match && match[1]) return decodeURIComponent(match[1]);
  }
  return '';
}

function normalizeImageUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (value.startsWith('data:image/')) return value;
  if (value.includes('drive.google.com') || value.includes('drive.usercontent.google.com') || value.includes('googleusercontent.com/d/')) {
    const fileId = driveFileIdFromUrl(value);
    if (fileId) return `https://lh3.googleusercontent.com/d/${fileId}=w1600`;
  }
  return value;
}

function imageUrlFromPost(post) {
  const primary = normalizeImageUrl(post?.imageUrl || '');
  if (primary) return primary;
  const fileId = post?.imageFileId || post?.imageFileID || post?.fileId || '';
  return fileId ? normalizeImageUrl(`https://drive.google.com/file/d/${fileId}/view`) : '';
}

function imageTag(url, alt, className = '') {
  const src = normalizeImageUrl(url);
  const classAttr = className ? ` class="${escapeHtml(className)}"` : '';
  return `<img${classAttr} src="${escapeHtml(src)}" alt="${escapeHtml(alt || 'スタイル写真')}" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.gallery-item,.manage-card,.detail-card,td')?.classList.add('image-load-error'); this.alt='画像を読み込めません';">`;
}

function displaySalonName(post) {
  return post.salonName || getById('shops', post.shopId)?.name || '';
}

function displayStaffName(post) {
  return post.staffName || getById('staff', post.staffId)?.name || '';
}

function colorSwatchStyle(color) {
  const value = color.imageUrl || '#efe9df';
  if (/^#|rgb|hsl|linear-gradient/.test(value)) return `background:${escapeHtml(value)}`;
  return `background-image:url('${escapeHtml(normalizeImageUrl(value))}')`;
}

function activeColors() {
  return (state.db.extensionColors || [])
    .filter(color => color.isActive)
    .filter(color => EXTENSION_COLOR_CATEGORIES.has(String(color.category || '').trim()))
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
}

function colorDisplayLabel(color) {
  return [color?.colorCode, color?.colorName].filter(Boolean).join(' ');
}

function buildImageSvg(seed, title, a, b, c) {
  const safeTitle = escapeHtml(title).slice(0, 18);
  const wave = 80 + (seed % 30);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="${a}" offset="0"/>
          <stop stop-color="${b}" offset="0.58"/>
          <stop stop-color="${c}" offset="1"/>
        </linearGradient>
        <filter id="shadow"><feDropShadow dx="0" dy="24" stdDeviation="22" flood-color="#3b2e29" flood-opacity=".22"/></filter>
      </defs>
      <rect width="900" height="1200" fill="url(#bg)"/>
      <circle cx="${180 + seed * 17 % 520}" cy="${150 + seed * 23 % 660}" r="${180 + seed % 90}" fill="#fff" opacity=".18"/>
      <path d="M${120 + seed % 90} 1040 C 250 ${760 - seed % 120}, 470 ${820 + seed % 80}, 620 550 C 760 300, 820 420, 700 780 C 650 930, 520 1030, 390 1100" fill="none" stroke="#fff" stroke-width="${wave}" stroke-linecap="round" opacity=".68" filter="url(#shadow)"/>
      <path d="M150 980 C 350 760, 560 850, 750 620" fill="none" stroke="${c}" stroke-width="28" stroke-linecap="round" opacity=".74"/>
      <text x="54" y="108" fill="#ffffff" opacity=".95" font-size="44" font-family="Arial, sans-serif" font-weight="700">${safeTitle}</text>
      <text x="56" y="166" fill="#ffffff" opacity=".72" font-size="26" font-family="Arial, sans-serif">Kimikea recipe</text>
    </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function seedData() {
  const extensionColors = [
    ['color-001', 'N-1', 'ナチュラルブラック', 'ダークカラー', '#171312'],
    ['color-002', 'N-2', 'ダークブラウン', 'ダークカラー', '#30231f'],
    ['color-003', 'N-3', 'ショコラブラウン', 'ダークカラー', '#4a3129'],
    ['color-004', 'N-4', 'モカブラウン', 'ダークカラー', '#61453a'],
    ['color-005', 'N-5', 'アッシュブラウン', 'ダークカラー', '#5b554e'],
    ['color-006', 'L-8', 'ベージュブラウン', 'ライトカラー', '#b9926d'],
    ['color-007', 'L-10', 'ミルクティー', 'ライトカラー', '#d8c4a8'],
    ['color-008', 'L-12', 'シルバーグレージュ', 'ライトカラー', '#c7c4bd'],
    ['color-009', 'L-14', 'ホワイトベージュ', 'ライトカラー', '#eadfca'],
    ['color-010', 'L-18', 'ライトグレー', 'ライトカラー', '#d2d4d6'],
    ['color-011', 'P-01', 'ホワイト', '原色', '#f9f8f2'],
    ['color-012', 'P-02', 'ピンク', '原色', '#f3a7c3'],
    ['color-013', 'P-03', 'チェリーピンク', '原色', '#df467c'],
    ['color-014', 'P-04', 'レッド', '原色', '#c92f35'],
    ['color-015', 'P-05', 'パープル', '原色', '#7755a6'],
    ['color-016', 'P-06', 'ラベンダー', '原色', '#b8a1d8'],
    ['color-017', 'P-07', 'ブルー', '原色', '#438ac9'],
    ['color-018', 'P-08', 'スカイブルー', '原色', '#8ec8df'],
    ['color-019', 'P-09', 'グリーン', '原色', '#49966d'],
    ['color-020', 'P-10', 'イエロー', '原色', '#e5c84d'],
    ['color-021', 'P-11', 'オレンジ', '原色', '#df8842'],
    ['color-022', 'P-12', 'グレージュ', 'ライトカラー', '#b7aaa0'],
  ].map(([id, colorCode, colorName, category, imageUrl], index) => ({
    id, colorId: id, colorCode, colorName, category, imageUrl, isActive: true,
    sortOrder: index + 1, createdAt: todayIso(60), updatedAt: todayIso(5),
  }));

  const styleTypes = [
    'イヤリングカラー', 'インナーカラー', 'ハイライト', 'メッシュ',
    'グラデーション', '長さ出し', 'ボリュームアップ', '前髪エクステ',
    'ポイントエクステ', '原色デザイン', 'その他',
  ].map((name, index) => ({ id: `type-${String(index + 1).padStart(2, '0')}`, name, isActive: true, sortOrder: index + 1 }));

  const shops = [
    { id: 'shop-team', name: 'TEAM hair', address: '静岡県富士市横割2丁目2-27', imageUrl: '', isActive: true },
    { id: 'shop-fuji', name: 'エクステランド富士店', address: '静岡県富士市', imageUrl: '', isActive: true },
    { id: 'shop-yoshida', name: 'エクステランド吉田店', address: '静岡県榛原郡吉田町', imageUrl: '', isActive: true },
  ];

  const staff = [
    ['staff-boss', 'BOSS', 'shop-team'],
    ['staff-kana', '神田 加奈', 'shop-team'],
    ['staff-ai', '松本 藍', 'shop-team'],
    ['staff-chisa', '松下 千紗', 'shop-team'],
    ['staff-fuji-a', '富士店 担当A', 'shop-fuji'],
    ['staff-yoshida-a', '吉田店 担当A', 'shop-yoshida'],
  ].map(([id, name, shopId]) => ({ id, name, shopId, profileImageUrl: '', isActive: true }));

  const users = [
    { id: 'user-member', name: '一般ユーザー', email: 'member@example.com', role: roles.member, shopId: 'shop-team', staffId: '' },
    { id: 'user-contributor', name: '投稿スタッフ', email: 'contributor@example.com', role: roles.contributor, shopId: 'shop-team', staffId: 'staff-ai' },
    { id: 'user-shop-admin', name: '店舗管理者', email: 'shopadmin@example.com', role: roles.shop_admin, shopId: 'shop-team', staffId: 'staff-boss' },
    { id: 'user-hq', name: '本部管理者', email: 'admin@example.com', role: roles.headquarters_admin, shopId: '', staffId: '' },
  ];

  return {
    stylePosts: [],
    savedStyles: [],
    saveSummaries: [],
    extensionColors,
    styleTypes,
    shops,
    staff,
    users,
  };
}

function hasRemoteApi() {
  return Boolean(STYLEBOOK_API_URL && STYLEBOOK_API_URL.startsWith('https://'));
}

function requestJson(url, options = {}) {
  if (typeof fetch === 'function') {
    return fetch(url, options).then(response => response.json());
  }
  if (typeof XMLHttpRequest === 'function') {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(options.method || 'GET', url, true);
      if (options.headers) {
        Object.entries(options.headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
      }
      xhr.onload = () => {
        try {
          resolve(JSON.parse(xhr.responseText || '{}'));
        } catch (error) {
          reject(error);
        }
      };
      xhr.onerror = () => reject(new Error('スタイル図鑑APIへ接続できませんでした。'));
      xhr.send(options.body || null);
    });
  }
  return Promise.reject(new Error('このブラウザでは通信機能を利用できません。'));
}

async function apiRequest(action, payload = {}) {
  if (!hasRemoteApi()) throw new Error('STYLEBOOK_API_URL is not configured.');
  debugStylebook('API POST request', {
    action,
    userId: currentUser()?.id || state.currentUserId,
  });
  const data = await requestJson(STYLEBOOK_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action,
      userId: currentUser()?.id || state.currentUserId,
      ...payload,
    }),
  });
  debugStylebook('API POST response', {
    action,
    ok: data.ok,
    message: data.message || '',
    colorCount: data.database?.extensionColors?.length,
  });
  if (!data.ok) throw new Error(data.message || '処理に失敗しました。');
  return data;
}

async function loadRemoteDb() {
  debugStylebook('API database request', {
    url: STYLEBOOK_API_URL,
    userId: state.currentUserId,
  });
  const data = await requestJson(`${STYLEBOOK_API_URL}?action=database&userId=${encodeURIComponent(state.currentUserId)}&t=${Date.now()}`, {
    cache: 'no-store',
  });
  if (!data.ok || !data.database) throw new Error(data.message || 'スタイル図鑑データを取得できませんでした。');
  state.db = normalizeDatabase(data.database);
  state.backendMode = 'remote';
  debugStylebook('API database response counts', {
    posts: state.db.stylePosts?.length || 0,
    colorsFromApi: state.db.extensionColors?.length || 0,
    activeColorsFromApi: (state.db.extensionColors || []).filter(color => color.isActive).length,
    types: state.db.styleTypes?.length || 0,
    shops: state.db.shops?.length || 0,
    staff: state.db.staff?.length || 0,
    users: state.db.users?.length || 0,
    firstColors: (state.db.extensionColors || []).slice(0, 12).map(color => ({
      id: color.id,
      productCode: color.productCode,
      category: color.category,
      colorCode: color.colorCode,
      colorName: color.colorName,
      productColor: color.productColor,
    })),
  });
}

function normalizeDatabase(database) {
  const db = database || seedData();
  db.stylePosts = Array.isArray(db.stylePosts) ? db.stylePosts : [];
  db.savedStyles = Array.isArray(db.savedStyles) ? db.savedStyles : [];
  db.saveSummaries = Array.isArray(db.saveSummaries) ? db.saveSummaries : buildSaveSummariesFromSaves(db.stylePosts, db.savedStyles);
  db.extensionColors = Array.isArray(db.extensionColors) ? db.extensionColors : [];
  db.styleTypes = Array.isArray(db.styleTypes) ? db.styleTypes : [];
  db.shops = Array.isArray(db.shops) ? db.shops : [];
  db.staff = Array.isArray(db.staff) ? db.staff : [];
  db.users = Array.isArray(db.users) ? db.users : [];
  return db;
}

function buildSaveSummariesFromSaves(posts = [], saves = []) {
  return posts.map(post => {
    const postSaves = saves.filter(save => saveStyleId(save) === post.id);
    const lastSavedAt = postSaves.map(save => save.createdAt).filter(Boolean).sort().pop() || '';
    return {
      styleId: post.id,
      saveCount: postSaves.length || Number(post.saveCount || 0),
      lastSavedAt,
      isPublished: post.isPublished,
      salonName: displaySalonNameForDb(post, posts),
      staffName: post.staffName || '',
      createdAt: post.createdAt || '',
    };
  });
}

function displaySalonNameForDb(post) {
  return post.salonName || '';
}

async function fetchOwnPostsFromApi({ draftsOnly = false } = {}) {
  if (!hasRemoteApi()) throw new Error('STYLEBOOK_API_URL is not configured.');
  const userId = normalizeUserId(currentUser()?.id || state.currentUserId);
  if (!userId) return [];
  const url = `${STYLEBOOK_API_URL}?action=myPosts&userId=${encodeURIComponent(userId)}&draftsOnly=${draftsOnly ? 'true' : 'false'}&t=${Date.now()}`;
  const data = await requestJson(url, { cache: 'no-store' });
  if (!data.ok) throw new Error(data.message || '自分の投稿を取得できませんでした。');
  return Array.isArray(data.posts) ? data.posts : [];
}

async function loadDb() {
  if (hasRemoteApi()) {
    try {
      await loadRemoteDb();
      return;
    } catch (error) {
      console.warn('Stylebook remote API failed. Local display only.', error);
      state.db = seedData();
      state.backendMode = 'local';
      return;
    }
  }
  const saved = localStorage.getItem(DB_KEY);
  if (saved) {
    state.db = normalizeDatabase(JSON.parse(saved));
    const posts = state.db.stylePosts || [];
    const hasOnlyOldDemoPosts = posts.length && posts.every(post => /^post-\d{3}$/.test(String(post.id || '')));
    if (hasOnlyOldDemoPosts) {
      state.db.stylePosts = [];
      state.db.savedStyles = [];
      state.db.saveSummaries = [];
      localStorage.setItem(DB_KEY, JSON.stringify(state.db));
    }
    state.backendMode = 'local';
    return;
  }
  state.db = seedData();
  state.backendMode = 'local';
  saveDb();
}

function primeDbForImmediateNavigation() {
  if (state.db) return;
  try {
    const saved = localStorage.getItem(DB_KEY);
    if (saved) {
      state.db = normalizeDatabase(JSON.parse(saved));
      state.backendMode = hasRemoteApi() ? 'loading' : 'local';
      return;
    }
  } catch (error) {
    // 壊れた一時データは使わず、即時操作用の初期データへ進む。
  }
  state.db = seedData();
  state.backendMode = hasRemoteApi() ? 'loading' : 'local';
}

function saveDb() {
  if (state.db) state.db.saveSummaries = buildSaveSummariesFromSaves(state.db.stylePosts, state.db.savedStyles);
  localStorage.setItem(DB_KEY, JSON.stringify(state.db));
}

async function refreshRemoteDb() {
  if (!hasRemoteApi()) return;
  await loadRemoteDb();
  renderUserSelect();
  renderFilterControls();
  renderSelectOptions();
}

function currentUser() {
  return state.db?.users?.find(user => user.id === state.currentUserId) || null;
}

function canPost() {
  return Boolean(currentUser());
}

function canManageAll() {
  return currentUser()?.role === roles.headquarters_admin;
}

function postAuthorId(post) {
  return String(post?.authorId || post?.createdByUserId || post?.userId || '').trim();
}

function normalizeUserId(value) {
  return String(value ?? '').trim();
}

function isSameUserId(left, right) {
  const a = normalizeUserId(left);
  const b = normalizeUserId(right);
  return Boolean(a && b && a === b);
}

function saveStyleId(save) {
  return String(save?.styleId || save?.stylePostId || save?.postId || '').trim();
}

function isPostAuthor(post) {
  const user = currentUser();
  if (!user) return false;
  return isSameUserId(postAuthorId(post), user.id);
}

function canEditPost(post) {
  const user = currentUser();
  if (!user) return false;
  if (isPostAuthor(post)) return true;
  // 店舗管理者・本部管理者の代行編集は将来拡張用。現時点では投稿者本人のみ編集できます。
  return false;
}

function canDeletePost(post) {
  return isPostAuthor(post);
}

function canManagePost(post) {
  return canEditPost(post);
}

function getById(collection, id) {
  return state.db[collection].find(item => item.id === id);
}

function activePosts({ includePrivate = false, includeDeleted = false } = {}) {
  return state.db.stylePosts.filter(post => {
    if (!includeDeleted && post.deletedAt) return false;
    if (includePrivate) return true;
    return post.isPublished && post.status === 'published';
  });
}

function savedPostIds() {
  const userId = currentUser()?.id;
  if (!userId) return new Set();
  return new Set(state.db.savedStyles.filter(save => isSameUserId(save.userId, userId)).map(saveStyleId).filter(Boolean));
}

function isSaved(postId) {
  return savedPostIds().has(postId);
}

function saveSummaryForPost(postId) {
  const id = String(postId || '').trim();
  if (!id) return null;
  return (state.db.saveSummaries || []).find(summary => String(summary.styleId || '').trim() === id) || null;
}

function saveCountForPost(post) {
  const summary = saveSummaryForPost(post.id);
  if (summary) return Number(summary.saveCount || 0);
  return state.db.savedStyles.filter(save => saveStyleId(save) === post.id).length || Number(post.saveCount || 0);
}

function latestSaveAtForPost(post) {
  const summary = saveSummaryForPost(post.id);
  if (summary?.lastSavedAt) return summary.lastSavedAt;
  return state.db.savedStyles
    .filter(save => saveStyleId(save) === post.id)
    .map(save => save.createdAt)
    .filter(Boolean)
    .sort()
    .pop() || '';
}

function stableCreatedTime(post) {
  return new Date(post.createdAt || post.updatedAt || 0).getTime() || 0;
}

function compareNewest(a, b) {
  const timeDiff = stableCreatedTime(b) - stableCreatedTime(a);
  if (timeDiff) return timeDiff;
  return String(b.id || '').localeCompare(String(a.id || ''), 'ja');
}

function compareSalon(a, b) {
  const salonDiff = displaySalonName(a).localeCompare(displaySalonName(b), 'ja');
  if (salonDiff) return salonDiff;
  return compareNewest(a, b);
}

function filteredPosts() {
  const savedIds = savedPostIds();
  let posts = activePosts().filter(post => {
    if (state.savedOnly && !savedIds.has(post.id)) return false;
    if (state.selectedColorIds.size && !(post.extensionColorIds || []).some(id => state.selectedColorIds.has(id))) return false;
    if (state.selectedStyleTypeIds.size && !(post.styleTypeIds || []).some(id => state.selectedStyleTypeIds.has(id))) return false;
    if (state.selectedShopIds.size && !state.selectedShopIds.has(post.shopId)) return false;
    if (state.selectedStaffIds.size && !state.selectedStaffIds.has(post.staffId)) return false;
    return true;
  });

  posts = posts.sort((a, b) => {
    if (state.sort === 'salon') return compareSalon(a, b);
    if (state.sort === 'saved') {
      const saveDiff = saveCountForPost(b) - saveCountForPost(a);
      if (saveDiff) return saveDiff;
      return compareNewest(a, b);
    }
    return compareNewest(a, b);
  });
  return posts;
}

function renderUserSelect() {
  if (!el.userSelect) {
    updateRoleVisibility();
    return;
  }
  const userId = currentUser()?.id || '';
  el.userSelect.innerHTML = state.db.users.map(user => (
    `<option value="${user.id}" ${user.id === userId ? 'selected' : ''}>${escapeHtml(user.name)} / ${user.role}</option>`
  )).join('');
  updateRoleVisibility();
}

function updateRoleVisibility() {
  const isAdmin = canManageAll();
  if (el.openAdminButton) el.openAdminButton.hidden = !isAdmin;
  if (el.menuAdminCard) el.menuAdminCard.hidden = !isAdmin;
}

function renderFilterControls() {
  const activeColorList = activeColors();
  debugStylebook('renderFilterControls color counts', {
    apiColors: state.db.extensionColors?.length || 0,
    activeColors: activeColorList.length,
  });
  const colorGroups = activeColorList
    .map(color => `<button type="button" class="chip ${state.selectedColorIds.has(color.id) ? 'active' : ''}" data-filter-color="${color.id}">
      <span class="swatch" style="${colorSwatchStyle(color)}"></span>${escapeHtml(colorDisplayLabel(color))}
    </button>`).join('');
  el.colorFilters.innerHTML = colorGroups;
  debugStylebook('renderFilterControls rendered colors', {
    renderedFilterButtons: el.colorFilters.querySelectorAll('[data-filter-color]').length,
  });

  el.styleFilters.innerHTML = state.db.styleTypes
    .filter(type => type.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(type => `<button type="button" class="chip ${state.selectedStyleTypeIds.has(type.id) ? 'active' : ''}" data-filter-style="${type.id}">${escapeHtml(type.name)}</button>`)
    .join('');

  el.shopFilter.innerHTML = state.db.shops
    .filter(shop => shop.isActive)
    .map(shop => `<option value="${shop.id}">${escapeHtml(shop.name)}</option>`)
    .join('');
  el.staffFilter.innerHTML = state.db.staff
    .filter(person => person.isActive && (!state.selectedShopIds.size || state.selectedShopIds.has(person.shopId)))
    .map(person => `<option value="${person.id}">${escapeHtml(person.name)}</option>`)
    .join('');
}

function renderSelectOptions() {
  const activeColorList = activeColors();
  debugStylebook('renderSelectOptions color counts', {
    apiColors: state.db.extensionColors?.length || 0,
    activeColors: activeColorList.length,
  });
  if (el.colorSelect) {
    el.colorSelect.innerHTML = activeColorList
      .map(color => `<option value="${color.id}">${escapeHtml(color.category)} / ${escapeHtml(colorDisplayLabel(color))}</option>`)
      .join('');
  }
  debugStylebook('renderSelectOptions rendered colors', {
    colorSelectOptions: el.colorSelect?.options.length || 0,
  });
  renderColorChoiceList();
  el.styleTypeSelect.innerHTML = state.db.styleTypes
    .filter(type => type.isActive)
    .map(type => `<option value="${type.id}">${escapeHtml(type.name)}</option>`)
    .join('');
  el.shopSelect.innerHTML = state.db.shops
    .filter(shop => shop.isActive)
    .map(shop => `<option value="${shop.id}">${escapeHtml(shop.name)}</option>`)
    .join('');
  el.shopNameOptions.innerHTML = state.db.shops
    .filter(shop => shop.isActive)
    .map(shop => `<option value="${escapeHtml(shop.name)}"></option>`)
    .join('');
  el.staffNameOptions.innerHTML = state.db.staff
    .filter(person => person.isActive)
    .map(person => `<option value="${escapeHtml(person.name)}"></option>`)
    .join('');
  renderStaffSelectForForm();
}

function renderColorChoiceList() {
  if (!el.colorChoiceList || !el.selectedColorSummary || !el.colorSelect) return;
  const query = (el.colorSearchInput?.value || '').trim().toLowerCase();
  const selected = new Set(selectedValues(el.colorSelect));
  const categories = ['ダークカラー', 'ライトカラー', '原色'];
  const activeColorList = activeColors();
  const colors = activeColorList.filter(color => {
    if (!query) return true;
    return [color.colorCode, color.colorName, color.category].join(' ').toLowerCase().includes(query);
  });
  debugStylebook('renderColorChoiceList counts before render', {
    query,
    apiColors: state.db.extensionColors?.length || 0,
    activeColors: activeColorList.length,
    filteredColors: colors.length,
  });
  const categoryHtml = categories.map(category => {
    const list = colors.filter(color => color.category === category);
    if (!list.length) return '';
    return `<section class="color-category"><h3>${escapeHtml(category)}</h3><div class="color-choice-grid">${list.map(color => `
      <button type="button" class="color-choice ${selected.has(color.id) ? 'active' : ''}" data-color-choice="${escapeHtml(color.id)}" aria-pressed="${selected.has(color.id) ? 'true' : 'false'}">
        <span class="color-choice-swatch" style="${colorSwatchStyle(color)}"></span>
        <span><strong>${escapeHtml(color.colorCode)}</strong>${escapeHtml(color.colorName)}</span>
        <small>${escapeHtml(color.category)}</small>
      </button>
    `).join('')}</div></section>`;
  }).join('');
  const otherColors = colors.filter(color => !categories.includes(color.category));
  const otherHtml = otherColors.length ? `<section class="color-category"><h3>その他</h3><div class="color-choice-grid">${otherColors.map(color => `
    <button type="button" class="color-choice ${selected.has(color.id) ? 'active' : ''}" data-color-choice="${escapeHtml(color.id)}" aria-pressed="${selected.has(color.id) ? 'true' : 'false'}">
      <span class="color-choice-swatch" style="${colorSwatchStyle(color)}"></span>
      <span><strong>${escapeHtml(color.colorCode)}</strong>${escapeHtml(color.colorName)}</span>
      <small>${escapeHtml(color.category)}</small>
    </button>
  `).join('')}</div></section>` : '';
  el.colorChoiceList.innerHTML = categoryHtml + otherHtml || '<p class="empty-state compact">該当する色がありません。</p>';
  debugStylebook('renderColorChoiceList rendered colors', {
    renderedColorChoiceButtons: el.colorChoiceList.querySelectorAll('[data-color-choice]').length,
    byCategory: categories.reduce((result, category) => {
      result[category] = colors.filter(color => color.category === category).length;
      return result;
    }, {}),
  });
  const selectedLabels = activeColors()
    .filter(color => selected.has(color.id))
    .map(colorDisplayLabel);
  el.selectedColorSummary.innerHTML = selectedLabels.length
    ? `<strong>${selectedLabels.length}色選択中</strong><span>${selectedLabels.map(label => `<em>${escapeHtml(label)}</em>`).join('')}</span>`
    : '<small>選択中の色はありません。</small>';
}

function renderStaffSelectForForm() {
  const shopId = el.shopSelect.value || '';
  el.staffSelect.innerHTML = state.db.staff
    .filter(person => person.isActive && (!shopId || person.shopId === shopId))
    .map(person => `<option value="${person.id}">${escapeHtml(person.name)}</option>`)
    .join('');
}

function findShopByName(name) {
  const normalized = String(name || '').trim();
  return state.db.shops.find(shop => shop.isActive && shop.name === normalized) || null;
}

function findStaffByName(name, shopId = '') {
  const normalized = String(name || '').trim();
  return state.db.staff.find(person => person.isActive && person.name === normalized && (!shopId || person.shopId === shopId))
    || state.db.staff.find(person => person.isActive && person.name === normalized)
    || null;
}

function colorLabels(post) {
  return (post.extensionColorIds || []).map(id => {
    const color = getById('extensionColors', id);
    return color ? colorDisplayLabel(color) : '';
  }).filter(Boolean);
}

function typeLabels(post) {
  return post.styleTypeIds.map(id => getById('styleTypes', id)?.name).filter(Boolean);
}

function renderGalleryItem(post) {
  const salonName = displaySalonName(post);
  const staffName = displayStaffName(post);
  const photoUrl = imageUrlFromPost(post);
  return `
    <article class="gallery-item" data-id="${post.id}">
      <button class="photo-button" type="button" data-action="detail" data-id="${post.id}">
        ${imageTag(photoUrl, post.title || 'スタイル写真')}
        <span class="photo-meta">${escapeHtml(salonName)}<br>${escapeHtml(staffName)}</span>
      </button>
      <button class="save-button ${isSaved(post.id) ? 'saved' : ''}" type="button" data-action="save" data-id="${post.id}" aria-label="保存">
        ${isSaved(post.id) ? '●' : '○'}
      </button>
    </article>`;
}

function renderManageItem(post, mode = 'mine') {
  const salonName = displaySalonName(post);
  const staffName = displayStaffName(post);
  const title = post.title || 'スタイル名未入力';
  const isDraft = post.status === 'draft' || post.status === 'private' || !post.isPublished;
  const dateLabel = new Date(post.updatedAt || post.createdAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const photoUrl = imageUrlFromPost(post);
  const editButton = canEditPost(post) ? `<button type="button" class="ghost-button" data-action="edit" data-id="${post.id}">編集</button>` : '';
  const deleteButton = canDeletePost(post) ? `<button type="button" class="danger-button" data-action="delete" data-id="${post.id}">削除</button>` : '';
  return `
    <article class="manage-card">
      <button type="button" class="manage-thumb" data-action="detail" data-id="${post.id}">
        ${imageTag(photoUrl, title)}
      </button>
      <div class="manage-body">
        <span class="manage-status ${isDraft ? 'draft' : 'published'}">${isDraft ? '下書き' : '公開中'}</span>
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(salonName)} / ${escapeHtml(staffName)}</small>
        <small>${mode === 'drafts' ? '保存日時' : '更新'}：${dateLabel}</small>
        <div class="manage-actions">
          ${editButton}
          ${isDraft ? `<button type="button" class="primary-button" data-action="publish" data-id="${post.id}">投稿する</button>` : ''}
          ${deleteButton}
        </div>
      </div>
    </article>`;
}

function renderActiveChips() {
  const chips = [];
  state.selectedColorIds.forEach(id => {
    const color = getById('extensionColors', id);
    if (color) chips.push({ label: colorDisplayLabel(color), type: 'color', id });
  });
  state.selectedStyleTypeIds.forEach(id => {
    const type = getById('styleTypes', id);
    if (type) chips.push({ label: type.name, type: 'style', id });
  });
  state.selectedShopIds.forEach(id => {
    const shop = getById('shops', id);
    if (shop) chips.push({ label: shop.name, type: 'shop', id });
  });
  state.selectedStaffIds.forEach(id => {
    const person = getById('staff', id);
    if (person) chips.push({ label: person.name, type: 'staff', id });
  });
  if (state.savedOnly) chips.push({ label: '保存済み', type: 'saved', id: 'saved' });
  el.activeChips.innerHTML = chips.map(chip => (
    `<button type="button" class="active-chip" data-chip-type="${chip.type}" data-chip-id="${chip.id}">${escapeHtml(chip.label)} ×</button>`
  )).join('');
}

function renderGallery() {
  const posts = filteredPosts();
  const visible = posts.slice(0, state.visibleCount);
  el.galleryGrid.innerHTML = visible.map(renderGalleryItem).join('');
  el.resultCount.textContent = `${posts.length}件`;
  if (el.stylebookPostCount) el.stylebookPostCount.textContent = `${activePosts().length}件`;
  if (!posts.length) {
    const hasPublishedPosts = activePosts().length > 0;
    el.galleryGrid.innerHTML = hasPublishedPosts
      ? '<div class="empty-state"><strong>条件に合うスタイルが見つかりません</strong><span>検索条件を減らしてもう一度お試しください。</span></div>'
      : `<div class="empty-state empty-gallery-state">
          <strong>まだ投稿されたスタイルはありません</strong>
          <span>最初のスタイルを投稿してみましょう</span>
          <button class="primary-button" type="button" data-action="show-post">投稿する</button>
        </div>`;
  }
  renderActiveChips();
  renderFilterControls();
}

function stylebookUrlFor(name, id = '') {
  const url = new URL(window.location.href);
  if (name === 'menu') {
    url.searchParams.delete('view');
    url.searchParams.delete('id');
  } else {
    url.searchParams.set('view', name);
    if (id) url.searchParams.set('id', id);
    else url.searchParams.delete('id');
  }
  return url;
}

function replaceStylebookHistory(name = state.currentView, id = state.currentDetailId || '') {
  if (!window.history?.replaceState) return;
  const url = stylebookUrlFor(name, id);
  window.history.replaceState({ kimikeaStylebook: true, view: name, id }, '', url);
  state.historyReady = true;
}

function pushStylebookHistory(name, id = '') {
  if (!window.history?.pushState) return;
  const current = window.history.state;
  const normalizedId = id || '';
  if (current?.kimikeaStylebook && current.view === name && (current.id || '') === normalizedId) return;
  const url = stylebookUrlFor(name, normalizedId);
  window.history.pushState({ kimikeaStylebook: true, view: name, id: normalizedId }, '', url);
}

function notifyStylebookNavigationState() {
  window.dispatchEvent(new CustomEvent('kimikea:navigation-state'));
}

function stylebookRouteId(route) {
  return `${route?.name || 'menu'}:${route?.id || ''}`;
}

function currentStylebookRoute() {
  return {
    name: state.currentView || 'menu',
    id: state.currentView === 'detail' ? state.currentDetailId : (state.currentView === 'post' ? state.currentEditId : ''),
  };
}

function rememberStylebookRoute(nextName, nextId = '') {
  if (state.isRestoringAppHistory) return;
  const current = currentStylebookRoute();
  const next = { name: nextName || 'menu', id: nextId || '' };
  if (stylebookRouteId(current) === stylebookRouteId(next)) {
    notifyStylebookNavigationState();
    return;
  }
  const previous = state.appHistory[state.appHistory.length - 1];
  if (!previous || stylebookRouteId(previous) !== stylebookRouteId(current)) {
    state.appHistory.push(current);
    if (state.appHistory.length > 30) state.appHistory.shift();
  }
  notifyStylebookNavigationState();
}

function canStylebookGoBack() {
  return state.appHistory.length > 0;
}

function restoreStylebookAppRoute(route) {
  state.isRestoringAppHistory = true;
  try {
    if (!route || route.name === 'menu') {
      showView('menu', { push: false });
      replaceStylebookHistory('menu');
    } else if (route.name === 'gallery') {
      showView('gallery', { push: false });
      replaceStylebookHistory('gallery');
    } else if (route.name === 'detail' && route.id) {
      showDetail(route.id, { push: false });
      replaceStylebookHistory('detail', route.id);
    } else if (route.name === 'post') {
      showPostForm(route.id || '', { push: false });
      replaceStylebookHistory('post', route.id || '');
    } else if (route.name === 'saved') {
      showSaved({ push: false });
      replaceStylebookHistory('gallery');
    } else if (route.name === 'drafts') {
      showDrafts({ push: false });
      replaceStylebookHistory('drafts');
    } else if (route.name === 'mine') {
      showMine({ push: false });
      replaceStylebookHistory('mine');
    } else if (route.name === 'admin') {
      renderAdmin({ push: false });
      replaceStylebookHistory('admin');
    } else {
      showView('menu', { push: false });
      replaceStylebookHistory('menu');
    }
  } finally {
    state.isRestoringAppHistory = false;
    notifyStylebookNavigationState();
  }
}

function goStylebookBackFromNav() {
  const route = state.appHistory.pop();
  if (!route) {
    notifyStylebookNavigationState();
    return true;
  }
  restoreStylebookAppRoute(route);
  return true;
}

function showStylebookMenuEntry() {
  state.appHistory.length = 0;
  showView('menu', { push: false });
  replaceStylebookHistory('menu');
  notifyStylebookNavigationState();
}

function showView(name, options = {}) {
  const { push = true, id = '' } = options;
  if (push) rememberStylebookRoute(name, id);
  state.currentView = name;
  ['menuView', 'galleryView', 'detailView', 'postView', 'savedView', 'draftsView', 'mineView', 'adminView'].forEach(key => {
    const view = document.getElementById(key);
    if (view) view.hidden = key !== `${name}View`;
  });
  updateRoleVisibility();
  if (push && state.historyReady) pushStylebookHistory(name, id);
  if (!push && state.historyReady) replaceStylebookHistory(name, id);
  if (name === 'gallery') {
    renderGallery();
    window.requestAnimationFrame(() => window.scrollTo(0, Number(sessionStorage.getItem(SCROLL_KEY) || 0)));
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  notifyStylebookNavigationState();
}

function showDetail(postId, options = {}) {
  const { push = true } = options;
  sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
  const post = state.db.stylePosts.find(item => item.id === postId);
  if (!post || post.deletedAt) return;
  state.currentDetailId = postId;
  const salonName = displaySalonName(post);
  const staffName = displayStaffName(post);
  const creator = getById('users', postAuthorId(post));
  const canEdit = canEditPost(post);
  const canDelete = canDeletePost(post);
  el.detailView.innerHTML = `
    <article class="detail-card">
      <div class="detail-photo-wrap">
        ${imageTag(imageUrlFromPost(post), post.title, 'detail-photo')}
      </div>
      ${(post.additionalImages || []).length ? `<div class="detail-subphotos">${post.additionalImages.map((url, index) => imageTag(url, `${post.title || '追加写真'} ${index + 1}`)).join('')}</div>` : ''}
      <div class="detail-body">
        <div class="detail-title-row">
          <h2>${escapeHtml(post.title)}</h2>
          <button class="save-pill ${isSaved(post.id) ? 'saved' : ''}" type="button" data-action="save" data-id="${post.id}">
            ${isSaved(post.id) ? '保存済み' : '保存'}
          </button>
        </div>
        <p>${escapeHtml(post.description)}</p>
        <dl class="recipe-spec">
          <div><dt>使用色</dt><dd>${colorLabels(post).map(label => `<button data-action="filter-label" data-kind="color" data-label="${escapeHtml(label)}">${escapeHtml(label)}</button>`).join('')}</dd></div>
          <div><dt>施術スタイル</dt><dd>${typeLabels(post).map(label => `<button data-action="filter-label" data-kind="type" data-label="${escapeHtml(label)}">${escapeHtml(label)}</button>`).join('')}</dd></div>
          <div><dt>使用本数</dt><dd>${post.extensionCount}本</dd></div>
          <div><dt>サロン</dt><dd>${post.shopId ? `<button data-action="filter-shop" data-id="${post.shopId}">${escapeHtml(salonName)}</button>` : escapeHtml(salonName)}</dd></div>
          <div><dt>担当者</dt><dd>${post.staffId ? `<button data-action="filter-staff" data-id="${post.staffId}">${escapeHtml(staffName)}</button>` : escapeHtml(staffName)}</dd></div>
          <div><dt>投稿日</dt><dd>${new Date(post.createdAt).toLocaleDateString('ja-JP')}</dd></div>
          <div><dt>保存数</dt><dd>${saveCountForPost(post)}</dd></div>
          <div><dt>投稿者</dt><dd>${escapeHtml(creator?.name || '')}</dd></div>
        </dl>
        <div class="detail-actions">
          <button type="button" class="ghost-button" data-action="share" data-id="${post.id}">共有</button>
          <button type="button" class="ghost-button" data-action="similar" data-id="${post.id}">似ているスタイルを見る</button>
          ${canEdit ? `<button type="button" class="ghost-button" data-action="edit" data-id="${post.id}">編集</button>` : ''}
          ${canDelete ? `<button type="button" class="danger-button" data-action="delete" data-id="${post.id}">削除</button>` : ''}
        </div>
      </div>
    </article>`;
  showView('detail', { id: postId, push });
}

async function toggleSave(postId) {
  const userId = currentUser()?.id;
  if (!userId) {
    alert('保存するにはログインユーザーが必要です。');
    return;
  }
  const existingIndex = state.db.savedStyles.findIndex(save => isSameUserId(save.userId, userId) && saveStyleId(save) === postId);
  const existing = existingIndex >= 0 ? state.db.savedStyles[existingIndex] : null;
  const post = state.db.stylePosts.find(item => item.id === postId);
  if (!post) return;
  try {
    if (state.backendMode === 'remote') {
      await apiRequest('toggleSave', { postId });
      await refreshRemoteDb();
    } else if (existing) {
      state.db.savedStyles.splice(existingIndex, 1);
      post.saveCount = Math.max(0, Number(post.saveCount || 0) - 1);
      saveDb();
    } else {
      state.db.savedStyles.push({ id: uid('save'), userId, styleId: postId, stylePostId: postId, createdAt: new Date().toISOString() });
      post.saveCount = Number(post.saveCount || 0) + 1;
      saveDb();
    }
  } catch (error) {
    alert(error.message || '保存状態を変更できませんでした。');
    return;
  }
  if (state.currentView === 'detail') showDetail(postId);
  else if (state.currentView === 'saved') renderSaved();
  else renderGallery();
}

function renderSaved() {
  const ids = savedPostIds();
  const savedMap = new Map(state.db.savedStyles
    .filter(save => isSameUserId(save.userId, currentUser()?.id))
    .map(save => [saveStyleId(save), save.createdAt]));
  const posts = activePosts()
    .filter(post => ids.has(post.id))
    .sort((a, b) => {
      const savedDiff = new Date(savedMap.get(b.id) || 0) - new Date(savedMap.get(a.id) || 0);
      if (savedDiff) return savedDiff;
      return compareNewest(a, b);
    });
  el.savedGrid.innerHTML = posts.length ? posts.map(renderGalleryItem).join('') : '<p class="empty-state">保存したスタイルはまだありません。</p>';
}

function showSaved(options = {}) {
  const { push = true } = options;
  renderSaved();
  showView('saved', { push });
}

function ownPosts({ draftsOnly = false } = {}) {
  const user = currentUser();
  if (!user) return [];
  return state.db.stylePosts
    .filter(post => !post.deletedAt && isSameUserId(postAuthorId(post), user.id))
    .filter(post => {
      const isDraft = post.status === 'draft' || post.status === 'private' || !post.isPublished;
      return draftsOnly ? isDraft : true;
    })
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
}

function renderDrafts(posts = ownPosts({ draftsOnly: true })) {
  el.draftsGrid.innerHTML = posts.length ? posts.map(post => renderManageItem(post, 'drafts')).join('') : '<p class="empty-state">下書きはまだありません。</p>';
}

async function showDrafts(options = {}) {
  const { push = true } = options;
  showView('drafts', { push });
  el.draftsGrid.innerHTML = '<p class="empty-state">下書きを読み込んでいます...</p>';
  try {
    const posts = state.backendMode === 'remote'
      ? await fetchOwnPostsFromApi({ draftsOnly: true })
      : ownPosts({ draftsOnly: true });
    renderDrafts(posts);
  } catch (error) {
    el.draftsGrid.innerHTML = `<p class="empty-state">${escapeHtml(error.message || '下書きを取得できませんでした。')}</p>`;
  }
}

function renderMine(posts = ownPosts()) {
  const published = posts.filter(post => post.isPublished && post.status === 'published');
  const drafts = posts.filter(post => post.status === 'draft' || post.status === 'private' || !post.isPublished);
  el.mineGrid.innerHTML = posts.length ? `
    <div class="manage-section-title">公開中 ${published.length}件</div>
    ${published.map(post => renderManageItem(post, 'mine')).join('') || '<p class="empty-state compact">公開中の投稿はありません。</p>'}
    <div class="manage-section-title">下書き ${drafts.length}件</div>
    ${drafts.map(post => renderManageItem(post, 'drafts')).join('') || '<p class="empty-state compact">下書きはありません。</p>'}
  ` : '<p class="empty-state">自分の投稿はまだありません。</p>';
}

async function showMine(options = {}) {
  const { push = true } = options;
  showView('mine', { push });
  el.mineGrid.innerHTML = '<p class="empty-state">自分の投稿を読み込んでいます...</p>';
  try {
    const posts = state.backendMode === 'remote'
      ? await fetchOwnPostsFromApi({ draftsOnly: false })
      : ownPosts();
    renderMine(posts);
  } catch (error) {
    el.mineGrid.innerHTML = `<p class="empty-state">${escapeHtml(error.message || '自分の投稿を取得できませんでした。')}</p>`;
  }
}

function selectedValues(select) {
  if (!select) return [];
  return Array.from(select.selectedOptions).map(option => option.value);
}

function resetGalleryViewState() {
  state.savedOnly = false;
  state.sort = 'new';
  state.visibleCount = PAGE_SIZE;
  if (el.savedOnlyToggle) el.savedOnlyToggle.checked = false;
  if (el.sortSelect) el.sortSelect.value = 'new';
}

function restoreViewFromHistory(historyState) {
  const view = historyState?.view || 'menu';
  const id = historyState?.id || '';
  if (view === 'detail' && id) {
    showDetail(id, { push: false });
    return;
  }
  if (view === 'gallery') {
    showView('gallery', { push: false });
    return;
  }
  if (view === 'post') {
    showPostForm('', { push: false });
    return;
  }
  if (view === 'drafts') {
    showDrafts({ push: false });
    return;
  }
  if (view === 'mine') {
    showMine({ push: false });
    return;
  }
  if (view === 'admin') {
    renderAdmin({ push: false });
    return;
  }
  showView('menu', { push: false });
}

function handleActionElement(action) {
  if (!action) return false;
  const id = action.dataset.id;
  const actionName = action.dataset.action;
  if (!actionName) return false;
  debugStylebook('handleActionElement', {
    actionName,
    id,
    currentView: state.currentView,
    actionEventCount: state.actionEventCount,
  });
  if (actionName === 'detail') showDetail(id);
  else if (actionName === 'save') toggleSave(id);
  else if (actionName === 'edit') showPostForm(id);
  else if (actionName === 'delete') logicalDeletePost(id);
  else if (actionName === 'publish') publishPost(id);
  else if (actionName === 'restore') restorePost(id);
  else if (actionName === 'hard-delete') hardDeletePost(id);
  else if (actionName === 'show-menu') showStylebookMenuEntry();
  else if (actionName === 'open-gallery') {
    resetGalleryViewState();
    showView('gallery');
  }
  else if (actionName === 'show-gallery' || actionName === 'back-gallery') showView('gallery');
  else if (actionName === 'show-post') showPostForm();
  else if (actionName === 'show-saved') showSaved();
  else if (actionName === 'show-drafts') showDrafts();
  else if (actionName === 'show-mine') showMine();
  else if (actionName === 'show-admin') renderAdmin();
  else if (actionName === 'share') navigator.share?.({ title: document.title, url: location.href }).catch(() => {});
  else if (actionName === 'similar') {
    const post = state.db.stylePosts.find(item => item.id === id);
    if (post) {
      state.selectedStyleTypeIds = new Set(post.styleTypeIds);
      showView('gallery');
    }
  }
  else if (actionName === 'filter-shop') {
    state.selectedShopIds = new Set([id]);
    showView('gallery');
  }
  else if (actionName === 'filter-staff') {
    state.selectedStaffIds = new Set([id]);
    showView('gallery');
  }
  else if (actionName === 'filter-label') {
    const label = action.dataset.label || '';
    const kind = action.dataset.kind;
    if (kind === 'color') {
      const color = state.db.extensionColors.find(item => label.includes(item.colorCode) || label.includes(item.colorName) || label.includes(item.productCode));
      if (color) state.selectedColorIds = new Set([color.id]);
    }
    if (kind === 'type') {
      const type = state.db.styleTypes.find(item => item.name === label);
      if (type) state.selectedStyleTypeIds = new Set([type.id]);
    }
    showView('gallery');
  } else {
    return false;
  }
  return true;
}

function runActionNow(action, event) {
  if (!action) return false;
  event?.preventDefault?.();
  event?.stopPropagation?.();
  state.immediateActionUntil = Date.now() + 450;
  action.classList.add('is-pressing');
  window.setTimeout(() => action.classList.remove('is-pressing'), 110);
  return handleActionElement(action);
}

function closestFromEvent(event, selector) {
  const target = event?.target;
  if (target?.closest) return target.closest(selector);
  const path = typeof event?.composedPath === 'function' ? event.composedPath() : [];
  return path.find(node => node?.matches?.(selector)) || null;
}

window.__kimikeaStylebookRunAction = function runStylebookAction(actionName, id = '') {
  return handleActionElement({ dataset: { action: actionName, id } });
};

window.KimikeaConnectNav = {
  back: goStylebookBackFromNav,
  home() {
    state.appHistory.length = 0;
    notifyStylebookNavigationState();
    window.location.href = '../index.html';
  },
  search() {
    window.location.href = '../index.html?view=search';
  },
  mypage() {
    window.location.href = '../index.html?view=mypage';
  },
  canGoBack: canStylebookGoBack,
};

async function resizeImage(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => {
      const maxWidth = 900;
      const scale = Math.min(1, maxWidth / image.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    image.src = dataUrl;
  });
}

async function resizeImages(files) {
  const list = Array.from(files || []);
  const resized = [];
  for (const file of list) {
    resized.push(await resizeImage(file));
  }
  return resized;
}

function clearPostForm() {
  state.currentEditId = '';
  state.currentImageData = '';
  state.currentAdditionalImageData = [];
  el.postForm.reset();
  el.postId.value = '';
  el.additionalImagesInput.value = '';
  el.salonNameInput.value = '';
  el.staffNameInput.value = '';
  el.shopSelect.value = '';
  el.staffSelect.value = '';
  el.imagePreview.innerHTML = '写真プレビュー';
  el.cancelEditButton.hidden = true;
  el.postFormTitle.textContent = 'スタイル投稿';
  renderSelectOptions();
}

function fillPostForm(post) {
  state.currentEditId = post.id;
  state.currentImageData = imageUrlFromPost(post);
  el.postId.value = post.id;
  el.postFormTitle.textContent = 'スタイル編集';
  el.titleInput.value = post.title;
  el.descriptionInput.value = post.description;
  el.additionalImagesInput.value = (post.additionalImages || []).join(', ');
  state.currentAdditionalImageData = [];
  el.extensionCountInput.value = post.extensionCount;
  el.statusInput.value = post.status;
  el.salonNameInput.value = displaySalonName(post);
  el.staffNameInput.value = displayStaffName(post);
  el.shopSelect.value = post.shopId || '';
  renderStaffSelectForForm();
  el.staffSelect.value = post.staffId || '';
  if (el.colorSelect) {
    Array.from(el.colorSelect.options).forEach(option => { option.selected = post.extensionColorIds.includes(option.value); });
  }
  renderColorChoiceList();
  Array.from(el.styleTypeSelect.options).forEach(option => { option.selected = post.styleTypeIds.includes(option.value); });
  el.imagePreview.innerHTML = imageTag(imageUrlFromPost(post), post.title || '写真プレビュー');
  el.cancelEditButton.hidden = false;
}

function showPostForm(postId = '', options = {}) {
  const { push = true } = options;
  if (!canPost()) {
    alert('ログイン中のユーザーは投稿できます。ユーザーを選択してください。');
    return;
  }
  clearPostForm();
  if (postId) {
    const post = state.db.stylePosts.find(item => item.id === postId);
    if (!post || !canManagePost(post)) return;
    fillPostForm(post);
  }
  showView('post', { push });
}

async function submitPost(event) {
  event.preventDefault();
  if (!canPost()) return;
  const editing = state.currentEditId ? state.db.stylePosts.find(post => post.id === state.currentEditId) : null;
  if (editing && !canManagePost(editing)) {
    alert('この投稿を編集する権限がありません。');
    return;
  }
  let imageUrl = state.currentImageData || imageUrlFromPost(editing) || '';
  const submitter = event.submitter;
  const requestedStatus = submitter?.dataset?.submitStatus || el.statusInput.value || 'published';
  el.statusInput.value = requestedStatus;
  if (!imageUrl && requestedStatus === 'draft') {
    imageUrl = buildImageSvg(Date.now() % 100, '下書き', '#efe6d6', '#e2eef0', '#d8c5d8');
  }
  if (!imageUrl) {
    el.formMessage.textContent = '写真を選択してください。';
    el.formMessage.classList.add('error');
    return;
  }
  const additionalImages = [
    ...el.additionalImagesInput.value.split(',').map(value => value.trim()).filter(Boolean),
    ...state.currentAdditionalImageData,
  ].filter(Boolean);
  const selectedColorIds = selectedValues(el.colorSelect);
  const salonName = el.salonNameInput.value.trim();
  const matchedShop = findShopByName(salonName);
  const staffName = el.staffNameInput.value.trim();
  const matchedStaff = findStaffByName(staffName, matchedShop?.id || '');
  const post = {
    id: editing?.id || uid('post'),
    title: el.titleInput.value.trim(),
    description: el.descriptionInput.value.trim(),
    imageUrl,
    additionalImages,
    extensionColorIds: selectedColorIds.length ? selectedColorIds : (editing?.extensionColorIds || []),
    styleTypeIds: selectedValues(el.styleTypeSelect),
    extensionCount: Number(el.extensionCountInput.value || 0),
    shopId: matchedShop?.id || '',
    staffId: matchedStaff?.id || '',
    salonName,
    staffName,
    authorId: editing ? postAuthorId(editing) : currentUser().id,
    createdByUserId: editing?.createdByUserId || editing?.authorId || currentUser().id,
    createdAt: editing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    saveCount: editing?.saveCount || 0,
    status: requestedStatus,
    isPublished: requestedStatus === 'published',
    deletedAt: editing?.deletedAt || '',
    deletedByUserId: editing?.deletedByUserId || '',
    deleteReason: editing?.deleteReason || '',
  };
  if (requestedStatus === 'published' && (!imageUrl || !post.styleTypeIds.length || !post.extensionCount || !post.salonName || !post.staffName)) {
    el.formMessage.textContent = '公開するには、写真、本数、施術、サロン名、担当者名を入力してください。';
    el.formMessage.classList.add('error');
    return;
  }
  el.formMessage.classList.remove('error');
  el.formMessage.textContent = requestedStatus === 'draft' ? '下書きを保存しています...' : '投稿を保存しています...';
  try {
    if (state.backendMode === 'remote') {
      const result = await apiRequest('savePost', { post });
      await refreshRemoteDb();
      clearPostForm();
      showDetail(result.id || post.id);
      return;
    }
    const index = state.db.stylePosts.findIndex(item => item.id === post.id);
    if (index >= 0) state.db.stylePosts[index] = post;
    else state.db.stylePosts.unshift(post);
    saveDb();
    clearPostForm();
    showDetail(post.id);
  } catch (error) {
    el.formMessage.textContent = error.message || '保存できませんでした。';
    el.formMessage.classList.add('error');
  }
}


async function publishPost(postId) {
  const post = state.db.stylePosts.find(item => item.id === postId);
  if (!post || !canManagePost(post)) {
    alert('この投稿を公開する権限がありません。');
    return;
  }
  try {
    if (state.backendMode === 'remote') {
      await apiRequest('publishPost', { postId });
      await refreshRemoteDb();
    } else {
      post.status = 'published';
      post.isPublished = true;
      post.updatedAt = new Date().toISOString();
      saveDb();
    }
    showDetail(post.id);
  } catch (error) {
    alert(error.message || '公開できませんでした。');
  }
}

async function logicalDeletePost(postId) {
  const post = state.db.stylePosts.find(item => item.id === postId);
  if (!post || !canDeletePost(post)) {
    alert('この投稿を削除する権限がありません。');
    return;
  }
  if (!confirm('この投稿を削除します。よろしいですか？')) return;
  const reason = '投稿者本人による削除';
  try {
    if (state.backendMode === 'remote') {
      await apiRequest('deletePost', { postId, reason });
      await refreshRemoteDb();
    } else {
      post.deletedAt = new Date().toISOString();
      post.deletedByUserId = currentUser().id;
      post.deleteReason = reason;
      post.isPublished = false;
      post.status = 'deleted';
      saveDb();
    }
  } catch (error) {
    alert(error.message || '削除できませんでした。');
    return;
  }
  if (state.currentView === 'drafts') showDrafts();
  else if (state.currentView === 'mine') showMine();
  else showView('gallery');
}

async function restorePost(postId) {
  if (!canManageAll()) return;
  const post = state.db.stylePosts.find(item => item.id === postId);
  if (!post) return;
  try {
    if (state.backendMode === 'remote') {
      await apiRequest('restorePost', { postId });
      await refreshRemoteDb();
    } else {
      post.deletedAt = '';
      post.deletedByUserId = '';
      post.deleteReason = '';
      post.status = 'published';
      post.isPublished = true;
      saveDb();
    }
    renderAdmin();
  } catch (error) {
    alert(error.message || '復元できませんでした。');
  }
}

async function hardDeletePost(postId) {
  if (!canManageAll()) return;
  if (!confirm('完全削除します。元に戻せません。')) return;
  try {
    if (state.backendMode === 'remote') {
      await apiRequest('hardDeletePost', { postId });
      await refreshRemoteDb();
    } else {
      state.db.stylePosts = state.db.stylePosts.filter(post => post.id !== postId);
      state.db.savedStyles = state.db.savedStyles.filter(save => saveStyleId(save) !== postId);
      saveDb();
    }
    renderAdmin();
  } catch (error) {
    alert(error.message || '完全削除できませんでした。');
  }
}

function renderAdminStats() {
  const posts = state.db.stylePosts;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const stats = [
    ['総投稿数', posts.length],
    ['公開中', posts.filter(post => post.isPublished && !post.deletedAt).length],
    ['非公開', posts.filter(post => post.status === 'private' && !post.deletedAt).length],
    ['削除済み', posts.filter(post => post.deletedAt).length],
    ['今月の投稿', posts.filter(post => post.createdAt.slice(0, 7) === thisMonth).length],
    ['総保存数', posts.reduce((sum, post) => sum + saveCountForPost(post), 0)],
    ['登録店舗数', state.db.shops.length],
    ['登録担当者数', state.db.staff.length],
    ['登録ユーザー数', state.db.users.length],
  ];
  el.adminStats.innerHTML = stats.map(([label, value]) => `<article><span>${label}</span><strong>${value}</strong></article>`).join('');
}

function adminRowsFor(tab) {
  if (tab === 'posts') {
    return activePosts({ includePrivate: true }).map(post => {
      const salonName = displaySalonName(post);
      const staffName = displayStaffName(post);
      const creator = getById('users', postAuthorId(post));
      const deleteButton = canDeletePost(post) ? `<button data-action="delete" data-id="${post.id}">削除</button>` : '';
      const editButton = canEditPost(post) ? `<button data-action="edit" data-id="${post.id}">編集</button>` : '';
      return `<tr><td>${imageTag(imageUrlFromPost(post), post.title || '投稿写真')}</td><td>${escapeHtml(post.title)}</td><td>${escapeHtml(salonName)}</td><td>${escapeHtml(staffName)}</td><td>${escapeHtml(creator?.name || '')}</td><td>${new Date(post.createdAt).toLocaleDateString('ja-JP')}</td><td>${post.status}</td><td>${saveCountForPost(post)}</td><td>${editButton}${deleteButton}</td></tr>`;
    }).join('');
  }
  if (tab === 'saves') {
    return activePosts({ includePrivate: true }).map(post => {
      const summary = saveSummaryForPost(post.id) || {};
      return `<tr><td>${escapeHtml(post.id)}</td><td>${saveCountForPost(post)}</td><td>${summary.lastSavedAt ? new Date(summary.lastSavedAt).toLocaleString('ja-JP') : '-'}</td><td>${post.isPublished ? '公開' : '非公開'}</td><td>${escapeHtml(displaySalonName(post))}</td><td>${escapeHtml(displayStaffName(post))}</td><td>${post.createdAt ? new Date(post.createdAt).toLocaleDateString('ja-JP') : '-'}</td></tr>`;
    }).join('');
  }
  if (tab === 'colors') {
    return state.db.extensionColors.map(color => `<tr><td><span class="admin-swatch" style="background:${escapeHtml(color.imageUrl)}"></span></td><td>${escapeHtml(color.productCode || color.id)}</td><td>${escapeHtml(color.category)}</td><td>${escapeHtml(colorDisplayLabel(color))}</td><td>${color.isActive ? '表示' : '非表示'}</td><td>${color.sortOrder}</td><td>商品マスタで管理</td></tr>`).join('');
  }
  if (tab === 'types') return state.db.styleTypes.map(type => `<tr><td>${escapeHtml(type.name)}</td><td>${type.isActive ? '公開' : '非公開'}</td><td>${type.sortOrder}</td><td><button data-admin-action="toggle-type" data-id="${type.id}">切替</button></td></tr>`).join('');
  if (tab === 'shops') return state.db.shops.map(shop => `<tr><td>${escapeHtml(shop.name)}</td><td>${escapeHtml(shop.address)}</td><td>${shop.isActive ? '公開' : '非公開'}</td><td>${state.db.staff.filter(person => person.shopId === shop.id).length}名</td></tr>`).join('');
  if (tab === 'staff') return state.db.staff.map(person => `<tr><td>${escapeHtml(person.name)}</td><td>${escapeHtml(getById('shops', person.shopId)?.name || '')}</td><td>${person.isActive ? '公開' : '非公開'}</td></tr>`).join('');
  if (tab === 'users') return state.db.users.map(user => `<tr><td>${escapeHtml(user.name)}</td><td>${escapeHtml(user.email)}</td><td>
    <select data-admin-action="change-role" data-id="${user.id}">
      ${Object.values(roles).map(role => `<option value="${role}" ${user.role === role ? 'selected' : ''}>${role}</option>`).join('')}
    </select>
  </td><td>${escapeHtml(getById('shops', user.shopId)?.name || '')}</td></tr>`).join('');
  if (tab === 'deleted') return state.db.stylePosts.filter(post => post.deletedAt).map(post => `<tr><td>${imageTag(imageUrlFromPost(post), post.title || '削除済み投稿')}</td><td>${escapeHtml(post.title)}</td><td>${escapeHtml(post.deleteReason || '')}</td><td>${new Date(post.deletedAt).toLocaleString('ja-JP')}</td><td><button data-action="restore" data-id="${post.id}">復元</button><button data-action="hard-delete" data-id="${post.id}">完全削除</button></td></tr>`).join('');
  return '';
}

function adminHeaders(tab) {
  const headers = {
    posts: ['写真', 'スタイル名', '店舗', '担当者', '投稿者', '投稿日', '状態', '保存数', '操作'],
    saves: ['styleId', '保存総数', '最終保存日時', '公開状態', 'サロン名', '担当者名', '投稿日'],
    colors: ['色', '商品コード', 'カテゴリ', '表示名', '状態', '順番', '管理'],
    types: ['施術スタイル', '状態', '順番', '操作'],
    shops: ['店舗', '住所', '状態', '担当者数'],
    staff: ['担当者', '店舗', '状態'],
    users: ['ユーザー', 'メール', '権限', '店舗'],
    deleted: ['写真', 'スタイル名', '削除理由', '削除日時', '操作'],
  };
  return headers[tab] || [];
}

function renderAdmin(options = {}) {
  const { push = true } = options;
  if (!canManageAll()) {
    el.adminDenied.hidden = false;
    el.adminContent.hidden = true;
    showView('admin', { push });
    return;
  }
  el.adminDenied.hidden = true;
  el.adminContent.hidden = false;
  renderAdminStats();
  document.querySelectorAll('[data-admin-tab]').forEach(button => button.classList.toggle('active', button.dataset.adminTab === state.adminTab));
  const headers = adminHeaders(state.adminTab).map(header => `<th>${header}</th>`).join('');
  el.adminTable.innerHTML = `<table><thead><tr>${headers}</tr></thead><tbody>${adminRowsFor(state.adminTab) || '<tr><td colspan="9">データがありません。</td></tr>'}</tbody></table>`;
  showView('admin', { push });
}

function toggleAdminActive(collection, id) {
  if (!canManageAll()) return;
  const item = state.db[collection].find(entry => entry.id === id);
  if (!item) return;
  item.isActive = !item.isActive;
  item.updatedAt = new Date().toISOString();
  saveDb();
  renderAdmin();
  renderFilterControls();
  renderSelectOptions();
}

function clearFilters() {
  state.selectedColorIds.clear();
  state.selectedStyleTypeIds.clear();
  state.selectedShopIds.clear();
  state.selectedStaffIds.clear();
  state.savedOnly = false;
  state.sort = 'new';
  state.visibleCount = PAGE_SIZE;
  el.savedOnlyToggle.checked = false;
  el.sortSelect.value = 'new';
  renderGallery();
}

function bindEvents() {
  debugStylebook('bindEvents start', {
    menuCards: document.querySelectorAll('.menu-card[data-action]').length,
    dataActionElements: document.querySelectorAll('[data-action]').length,
    bottomNav: document.querySelectorAll('.kc-bottom-nav, .shared-bottom-nav, [data-kc-bottom-nav]').length,
    menuCardPointerEvents: Array.from(document.querySelectorAll('.menu-card[data-action]')).map(card => ({
      action: card.dataset.action,
      pointerEvents: window.getComputedStyle(card).pointerEvents,
      zIndex: window.getComputedStyle(card).zIndex,
      position: window.getComputedStyle(card).position,
    })),
  });
  if (el.userSelect) {
    el.userSelect.addEventListener('change', async () => {
      state.currentUserId = el.userSelect.value;
      localStorage.setItem(SESSION_KEY, state.currentUserId);
      localStorage.removeItem(DB_KEY);
      state.selectedColorIds.clear();
      state.selectedStyleTypeIds.clear();
      state.selectedShopIds.clear();
      state.selectedStaffIds.clear();
      state.savedOnly = false;
      if (state.backendMode === 'remote') {
        await refreshRemoteDb();
      } else {
        renderUserSelect();
      }
      renderGallery();
    });
  }
  el.filterToggle.addEventListener('click', () => { el.filterPanel.hidden = !el.filterPanel.hidden; });
  el.sortSelect.addEventListener('change', event => { state.sort = event.target.value; renderGallery(); });
  el.savedOnlyToggle.addEventListener('change', event => { state.savedOnly = event.target.checked; renderGallery(); });
  el.clearFiltersButton.addEventListener('click', clearFilters);
  if (el.colorSearchInput) el.colorSearchInput.addEventListener('input', renderColorChoiceList);
  el.shopFilter.addEventListener('change', () => {
    state.selectedShopIds = new Set(selectedValues(el.shopFilter));
    state.selectedStaffIds.clear();
    renderGallery();
  });
  el.staffFilter.addEventListener('change', () => {
    state.selectedStaffIds = new Set(selectedValues(el.staffFilter));
    renderGallery();
  });
  el.shopSelect.addEventListener('change', renderStaffSelectForForm);
  el.imageInput.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    state.currentImageData = await resizeImage(file);
    el.imagePreview.innerHTML = imageTag(state.currentImageData, '写真プレビュー');
  });
  el.additionalImageFiles.addEventListener('change', async event => {
    const files = event.target.files;
    if (!files || !files.length) {
      state.currentAdditionalImageData = [];
      return;
    }
    state.currentAdditionalImageData = await resizeImages(files);
    const existing = el.additionalImagesInput.value.split(',').map(value => value.trim()).filter(Boolean);
    const total = existing.length + state.currentAdditionalImageData.length;
    const currentPreview = (state.currentImageData || state.currentEditId) ? el.imagePreview.innerHTML.replace(/<small class="additional-count">.*?<\/small>/, '') : '写真プレビュー';
    el.imagePreview.innerHTML = `${currentPreview}<small class="additional-count">追加写真 ${total}枚</small>`;
  });
  el.postForm.addEventListener('submit', submitPost);
  el.cancelEditButton.addEventListener('click', clearPostForm);
  if (el.openAdminButton) el.openAdminButton.addEventListener('click', renderAdmin);
  document.addEventListener('pointerdown', event => {
    const immediateAction = closestFromEvent(event, '.menu-card[data-action], .empty-gallery-state [data-action]');
    if (immediateAction) {
      runActionNow(immediateAction, event);
      return;
    }
    const action = closestFromEvent(event, '[data-action]');
    if (action) action.classList.add('is-pressing');
  }, { passive: false, capture: true });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(eventName => {
    document.addEventListener(eventName, event => {
      const action = closestFromEvent(event, '[data-action]');
      if (action) action.classList.remove('is-pressing');
    }, { passive: true });
  });
  document.addEventListener('click', event => {
    if (Date.now() < state.immediateActionUntil) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    state.actionEventCount += 1;
    const actionCandidate = closestFromEvent(event, '[data-action]');
    if (actionCandidate) {
      debugStylebook('document click action candidate', {
        eventType: event.type,
        action: actionCandidate.dataset.action,
        targetTag: event.target.tagName,
        targetClass: event.target.className,
        currentTargetTag: actionCandidate.tagName,
        defaultPreventedBefore: event.defaultPrevented,
        pointerEvents: window.getComputedStyle(actionCandidate).pointerEvents,
        zIndex: window.getComputedStyle(actionCandidate).zIndex,
        path: event.composedPath ? event.composedPath().slice(0, 6).map(node => node.id || node.className || node.tagName).join(' > ') : '',
      });
    }
    const colorButton = closestFromEvent(event, '[data-filter-color]');
    if (colorButton) {
      const id = colorButton.dataset.filterColor;
      state.selectedColorIds.has(id) ? state.selectedColorIds.delete(id) : state.selectedColorIds.add(id);
      renderGallery();
      return;
    }
    const styleButton = closestFromEvent(event, '[data-filter-style]');
    if (styleButton) {
      const id = styleButton.dataset.filterStyle;
      state.selectedStyleTypeIds.has(id) ? state.selectedStyleTypeIds.delete(id) : state.selectedStyleTypeIds.add(id);
      renderGallery();
      return;
    }
    const chip = closestFromEvent(event, '[data-chip-type]');
    if (chip) {
      const { chipType, chipId } = chip.dataset;
      if (chipType === 'color') state.selectedColorIds.delete(chipId);
      if (chipType === 'style') state.selectedStyleTypeIds.delete(chipId);
      if (chipType === 'shop') state.selectedShopIds.delete(chipId);
      if (chipType === 'staff') state.selectedStaffIds.delete(chipId);
      if (chipType === 'saved') { state.savedOnly = false; el.savedOnlyToggle.checked = false; }
      renderGallery();
      return;
    }
    const colorChoice = closestFromEvent(event, '[data-color-choice]');
    if (colorChoice) {
      const id = colorChoice.dataset.colorChoice;
      const option = Array.from(el.colorSelect?.options || []).find(item => item.value === id);
      if (option) {
        option.selected = !option.selected;
        renderColorChoiceList();
      }
      return;
    }
    const action = closestFromEvent(event, '[data-action]');
    if (!action) return;
    runActionNow(action, event);
  });
  document.querySelectorAll('[data-admin-tab]').forEach(button => {
    button.addEventListener('click', () => {
      state.adminTab = button.dataset.adminTab;
      renderAdmin();
    });
  });
  el.adminTable.addEventListener('click', event => {
    const button = closestFromEvent(event, '[data-admin-action]');
    if (!button) return;
    if (button.dataset.adminAction === 'toggle-type') toggleAdminActive('styleTypes', button.dataset.id);
  });
  el.adminTable.addEventListener('change', event => {
    const field = closestFromEvent(event, '[data-admin-action="change-role"]');
    if (!field || !canManageAll()) return;
    const user = state.db.users.find(item => item.id === field.dataset.id);
    if (!user) return;
    user.role = field.value;
    saveDb();
    renderAdmin();
  });
  const observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      const total = filteredPosts().length;
      if (state.visibleCount < total) {
        state.visibleCount += PAGE_SIZE;
        renderGallery();
      }
    }
  }, { rootMargin: '800px 0px' });
  observer.observe(el.infiniteSentinel);
  window.addEventListener('beforeunload', () => {
    if (state.currentView === 'gallery') sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
  });
  window.addEventListener('popstate', event => {
    if (event.state?.kimikeaStylebook) restoreViewFromHistory(event.state);
  });
}

async function init() {
  if (!state.db) {
    state.backendMode = hasRemoteApi() ? 'loading' : 'local';
  }
  primeDbForImmediateNavigation();
  bindEvents();
  showView('menu', { push: false });
  replaceStylebookHistory('menu');
  notifyStylebookNavigationState();
  if (window.__kimikeaStylebookQueuedAction) {
    state.pendingActionName = window.__kimikeaStylebookQueuedAction;
    window.__kimikeaStylebookQueuedAction = '';
  }
  await loadDb();
  if (!currentUser()) state.currentUserId = state.db.users[0]?.id || '';
  renderUserSelect();
  renderFilterControls();
  renderSelectOptions();
  renderGallery();
  if (state.pendingActionName) {
    const queuedAction = state.pendingActionName;
    state.pendingActionName = '';
    debugStylebook('running queued action after database load', { queuedAction });
    handleActionElement({ dataset: { action: queuedAction } });
  }
}

init();
