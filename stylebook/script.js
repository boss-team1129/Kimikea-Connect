const DB_KEY = 'kimikea_stylebook_gallery_db_v1';
const SESSION_KEY = 'kimikea_stylebook_current_user_v1';
const SCROLL_KEY = 'kimikea_stylebook_scroll_y_v1';
const PAGE_SIZE = 18;

const roles = {
  member: 'member',
  contributor: 'contributor',
  shop_admin: 'shop_admin',
  headquarters_admin: 'headquarters_admin',
};

const state = {
  db: null,
  currentUserId: localStorage.getItem(SESSION_KEY) || 'user-member',
  query: '',
  selectedColorIds: new Set(),
  selectedStyleTypeIds: new Set(),
  selectedShopIds: new Set(),
  selectedStaffIds: new Set(),
  savedOnly: false,
  sort: 'recommended',
  visibleCount: PAGE_SIZE,
  currentView: 'menu',
  currentDetailId: '',
  currentEditId: '',
  currentImageData: '',
  adminTab: 'posts',
};

const el = {
  userSelect: document.getElementById('userSelect'),
  keywordInput: document.getElementById('keywordInput'),
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
  galleryGrid: document.getElementById('galleryGrid'),
  savedGrid: document.getElementById('savedGrid'),
  draftsGrid: document.getElementById('draftsGrid'),
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
  titleInput: document.getElementById('titleInput'),
  descriptionInput: document.getElementById('descriptionInput'),
  colorSelect: document.getElementById('colorSelect'),
  styleTypeSelect: document.getElementById('styleTypeSelect'),
  extensionCountInput: document.getElementById('extensionCountInput'),
  statusInput: document.getElementById('statusInput'),
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

  const titleWords = ['ホワイトベージュ', 'ピンクイヤリング', 'ナチュラル長さ出し', 'ブルーインナー', 'グレージュメッシュ', '推し色ポイント', 'ラベンダーデザイン', '大人ハイライト'];
  const posts = Array.from({ length: 36 }, (_, index) => {
    const colorA = extensionColors[index % extensionColors.length];
    const colorB = extensionColors[(index + 7) % extensionColors.length];
    const type = styleTypes[index % styleTypes.length];
    const shop = shops[index % shops.length];
    const shopStaff = staff.filter(item => item.shopId === shop.id);
    const stylist = shopStaff[index % shopStaff.length] || staff[0];
    const owner = users[(index % 3) + 1];
    const count = [4, 6, 8, 10, 12, 20, 40, 60, 80][index % 9];
    const id = `post-${String(index + 1).padStart(3, '0')}`;
    const isPrivate = index % 17 === 0;
    return {
      id,
      title: `${titleWords[index % titleWords.length]} ${index + 1}`,
      description: `${type.name}の提案レシピ。${colorA.colorName}を中心に、顔まわりと全体のバランスを見ながら自然に仕上げます。`,
      imageUrl: buildImageSvg(index + 1, titleWords[index % titleWords.length], colorA.imageUrl, colorB.imageUrl, ['#f7efe3', '#d9e8eb', '#ead6df'][index % 3]),
      additionalImages: [],
      extensionColorIds: index % 4 === 0 ? [colorA.id, colorB.id] : [colorA.id],
      styleTypeIds: [type.id],
      extensionCount: count,
      shopId: shop.id,
      staffId: stylist.id,
      createdByUserId: owner.id,
      createdAt: todayIso(index),
      updatedAt: todayIso(index % 5),
      saveCount: (index * 7) % 41,
      status: isPrivate ? 'private' : 'published',
      isPublished: !isPrivate,
      deletedAt: '',
      deletedByUserId: '',
      deleteReason: '',
    };
  });

  return {
    stylePosts: posts,
    savedStyles: [
      { id: 'save-001', userId: 'user-member', stylePostId: 'post-002', createdAt: todayIso(1) },
      { id: 'save-002', userId: 'user-member', stylePostId: 'post-006', createdAt: todayIso(2) },
    ],
    extensionColors,
    styleTypes,
    shops,
    staff,
    users,
  };
}

function loadDb() {
  const saved = localStorage.getItem(DB_KEY);
  if (saved) {
    state.db = JSON.parse(saved);
    return;
  }
  state.db = seedData();
  saveDb();
}

function saveDb() {
  localStorage.setItem(DB_KEY, JSON.stringify(state.db));
}

function currentUser() {
  return state.db.users.find(user => user.id === state.currentUserId) || state.db.users[0];
}

function canPost() {
  return Boolean(currentUser());
}

function canManageAll() {
  return currentUser().role === roles.headquarters_admin;
}

function canManagePost(post) {
  const user = currentUser();
  if (user.role === roles.headquarters_admin) return true;
  if (post.createdByUserId === user.id) return true;
  // 店舗管理者の店舗内管理は将来拡張用。現時点では本人投稿のみ編集できます。
  return false;
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
  const userId = currentUser().id;
  return new Set(state.db.savedStyles.filter(save => save.userId === userId).map(save => save.stylePostId));
}

function isSaved(postId) {
  return savedPostIds().has(postId);
}

function postSearchText(post) {
  const shop = getById('shops', post.shopId);
  const staff = getById('staff', post.staffId);
  const colors = post.extensionColorIds.map(id => getById('extensionColors', id)).filter(Boolean);
  const types = post.styleTypeIds.map(id => getById('styleTypes', id)).filter(Boolean);
  return [
    post.title, post.description, post.extensionCount,
    shop?.name, staff?.name,
    ...colors.flatMap(color => [color.colorCode, color.colorName, color.category]),
    ...types.map(type => type.name),
  ].join(' ').toLowerCase();
}

function filteredPosts() {
  const savedIds = savedPostIds();
  const query = state.query.toLowerCase();
  let posts = activePosts().filter(post => {
    if (state.savedOnly && !savedIds.has(post.id)) return false;
    if (query && !postSearchText(post).includes(query)) return false;
    if (state.selectedColorIds.size && !post.extensionColorIds.some(id => state.selectedColorIds.has(id))) return false;
    if (state.selectedStyleTypeIds.size && !post.styleTypeIds.some(id => state.selectedStyleTypeIds.has(id))) return false;
    if (state.selectedShopIds.size && !state.selectedShopIds.has(post.shopId)) return false;
    if (state.selectedStaffIds.size && !state.selectedStaffIds.has(post.staffId)) return false;
    return true;
  });

  posts = posts.sort((a, b) => {
    if (state.sort === 'popular') return (b.saveCount + b.extensionCount) - (a.saveCount + a.extensionCount);
    if (state.sort === 'new') return new Date(b.createdAt) - new Date(a.createdAt);
    if (state.sort === 'saved') return b.saveCount - a.saveCount;
    return (b.saveCount * 2 + new Date(b.createdAt).getTime() / 1000000000) - (a.saveCount * 2 + new Date(a.createdAt).getTime() / 1000000000);
  });
  return posts;
}

function renderUserSelect() {
  el.userSelect.innerHTML = state.db.users.map(user => (
    `<option value="${user.id}" ${user.id === currentUser().id ? 'selected' : ''}>${escapeHtml(user.name)} / ${user.role}</option>`
  )).join('');
  updateRoleVisibility();
}

function updateRoleVisibility() {
  const isAdmin = canManageAll();
  if (el.openAdminButton) el.openAdminButton.hidden = !isAdmin;
  if (el.menuAdminCard) el.menuAdminCard.hidden = !isAdmin;
}

function renderFilterControls() {
  const colorGroups = state.db.extensionColors
    .filter(color => color.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(color => `<button type="button" class="chip ${state.selectedColorIds.has(color.id) ? 'active' : ''}" data-filter-color="${color.id}">
      <span class="swatch" style="background:${escapeHtml(color.imageUrl)}"></span>${escapeHtml(color.colorCode)} ${escapeHtml(color.colorName)}
    </button>`).join('');
  el.colorFilters.innerHTML = colorGroups;

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
  el.colorSelect.innerHTML = state.db.extensionColors
    .filter(color => color.isActive)
    .map(color => `<option value="${color.id}">${escapeHtml(color.category)} / ${escapeHtml(color.colorCode)} ${escapeHtml(color.colorName)}</option>`)
    .join('');
  el.styleTypeSelect.innerHTML = state.db.styleTypes
    .filter(type => type.isActive)
    .map(type => `<option value="${type.id}">${escapeHtml(type.name)}</option>`)
    .join('');
  el.shopSelect.innerHTML = state.db.shops
    .filter(shop => shop.isActive)
    .map(shop => `<option value="${shop.id}">${escapeHtml(shop.name)}</option>`)
    .join('');
  renderStaffSelectForForm();
}

function renderStaffSelectForForm() {
  const shopId = el.shopSelect.value || state.db.shops[0]?.id;
  el.staffSelect.innerHTML = state.db.staff
    .filter(person => person.isActive && person.shopId === shopId)
    .map(person => `<option value="${person.id}">${escapeHtml(person.name)}</option>`)
    .join('');
}

function colorLabels(post) {
  return post.extensionColorIds.map(id => {
    const color = getById('extensionColors', id);
    return color ? `${color.colorCode} ${color.colorName}` : '';
  }).filter(Boolean);
}

function typeLabels(post) {
  return post.styleTypeIds.map(id => getById('styleTypes', id)?.name).filter(Boolean);
}

function renderGalleryItem(post) {
  const shop = getById('shops', post.shopId);
  const person = getById('staff', post.staffId);
  return `
    <article class="gallery-item" data-id="${post.id}">
      <button class="photo-button" type="button" data-action="detail" data-id="${post.id}">
        <img src="${post.imageUrl}" alt="${escapeHtml(post.title)}" loading="lazy">
        <span class="photo-meta">${escapeHtml(shop?.name || '')}<br>${escapeHtml(person?.name || '')}</span>
      </button>
      <button class="save-button ${isSaved(post.id) ? 'saved' : ''}" type="button" data-action="save" data-id="${post.id}" aria-label="保存">
        ${isSaved(post.id) ? '●' : '○'}
      </button>
    </article>`;
}

function renderActiveChips() {
  const chips = [];
  state.selectedColorIds.forEach(id => {
    const color = getById('extensionColors', id);
    if (color) chips.push({ label: `${color.colorCode} ${color.colorName}`, type: 'color', id });
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
  if (!posts.length) {
    el.galleryGrid.innerHTML = '<p class="empty-state">条件を減らして検索してください。</p>';
  }
  renderActiveChips();
  renderFilterControls();
}

function showView(name) {
  state.currentView = name;
  ['menuView', 'galleryView', 'detailView', 'postView', 'savedView', 'draftsView', 'adminView'].forEach(key => {
    const view = document.getElementById(key);
    if (view) view.hidden = key !== `${name}View`;
  });
  updateRoleVisibility();
  if (name === 'gallery') {
    renderGallery();
    window.requestAnimationFrame(() => window.scrollTo(0, Number(sessionStorage.getItem(SCROLL_KEY) || 0)));
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function showDetail(postId) {
  sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
  const post = state.db.stylePosts.find(item => item.id === postId);
  if (!post || post.deletedAt) return;
  state.currentDetailId = postId;
  const shop = getById('shops', post.shopId);
  const person = getById('staff', post.staffId);
  const creator = getById('users', post.createdByUserId);
  const canEdit = canManagePost(post);
  el.detailView.innerHTML = `
    <button class="text-button" type="button" data-action="show-gallery">写真一覧へ戻る</button>
    <article class="detail-card">
      <div class="detail-photo-wrap">
        <img class="detail-photo" src="${post.imageUrl}" alt="${escapeHtml(post.title)}">
      </div>
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
          <div><dt>店舗</dt><dd><button data-action="filter-shop" data-id="${post.shopId}">${escapeHtml(shop?.name || '')}</button></dd></div>
          <div><dt>担当者</dt><dd><button data-action="filter-staff" data-id="${post.staffId}">${escapeHtml(person?.name || '')}</button></dd></div>
          <div><dt>投稿日</dt><dd>${new Date(post.createdAt).toLocaleDateString('ja-JP')}</dd></div>
          <div><dt>保存数</dt><dd>${post.saveCount}</dd></div>
          <div><dt>投稿者</dt><dd>${escapeHtml(creator?.name || '')}</dd></div>
        </dl>
        <div class="detail-actions">
          <button type="button" class="ghost-button" data-action="share" data-id="${post.id}">共有</button>
          <button type="button" class="ghost-button" data-action="similar" data-id="${post.id}">似ているスタイルを見る</button>
          ${canEdit ? `<button type="button" class="ghost-button" data-action="edit" data-id="${post.id}">編集</button>
          <button type="button" class="danger-button" data-action="delete" data-id="${post.id}">削除</button>` : ''}
        </div>
      </div>
    </article>`;
  showView('detail');
}

function toggleSave(postId) {
  const userId = currentUser().id;
  const existing = state.db.savedStyles.find(save => save.userId === userId && save.stylePostId === postId);
  const post = state.db.stylePosts.find(item => item.id === postId);
  if (!post) return;
  if (existing) {
    state.db.savedStyles = state.db.savedStyles.filter(save => save.id !== existing.id);
    post.saveCount = Math.max(0, Number(post.saveCount || 0) - 1);
  } else {
    state.db.savedStyles.push({ id: uid('save'), userId, stylePostId: postId, createdAt: new Date().toISOString() });
    post.saveCount = Number(post.saveCount || 0) + 1;
  }
  saveDb();
  if (state.currentView === 'detail') showDetail(postId);
  else if (state.currentView === 'saved') renderSaved();
  else renderGallery();
}

function renderSaved() {
  const ids = savedPostIds();
  const wasSavedOnly = state.savedOnly;
  state.savedOnly = true;
  const posts = filteredPosts().filter(post => ids.has(post.id));
  state.savedOnly = wasSavedOnly;
  el.savedGrid.innerHTML = posts.length ? posts.map(renderGalleryItem).join('') : '<p class="empty-state">保存したスタイルはまだありません。</p>';
}

function showSaved() {
  renderSaved();
  showView('saved');
}

function renderDrafts() {
  const user = currentUser();
  const posts = state.db.stylePosts.filter(post => (
    !post.deletedAt
    && post.createdByUserId === user.id
    && (post.status === 'private' || post.status === 'draft' || !post.isPublished)
  ));
  el.draftsGrid.innerHTML = posts.length ? posts.map(renderGalleryItem).join('') : '<p class="empty-state">下書きはまだありません。</p>';
}

function showDrafts() {
  renderDrafts();
  showView('drafts');
}

function selectedValues(select) {
  return Array.from(select.selectedOptions).map(option => option.value);
}

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

function clearPostForm() {
  state.currentEditId = '';
  state.currentImageData = '';
  el.postForm.reset();
  el.postId.value = '';
  el.imagePreview.innerHTML = '写真プレビュー';
  el.cancelEditButton.hidden = true;
  el.postFormTitle.textContent = 'スタイル投稿';
  renderSelectOptions();
}

function fillPostForm(post) {
  state.currentEditId = post.id;
  state.currentImageData = post.imageUrl;
  el.postId.value = post.id;
  el.postFormTitle.textContent = 'スタイル編集';
  el.titleInput.value = post.title;
  el.descriptionInput.value = post.description;
  el.additionalImagesInput.value = (post.additionalImages || []).join(', ');
  el.extensionCountInput.value = post.extensionCount;
  el.statusInput.value = post.status;
  el.shopSelect.value = post.shopId;
  renderStaffSelectForForm();
  el.staffSelect.value = post.staffId;
  Array.from(el.colorSelect.options).forEach(option => { option.selected = post.extensionColorIds.includes(option.value); });
  Array.from(el.styleTypeSelect.options).forEach(option => { option.selected = post.styleTypeIds.includes(option.value); });
  el.imagePreview.innerHTML = `<img src="${post.imageUrl}" alt="">`;
  el.cancelEditButton.hidden = false;
}

function showPostForm(postId = '') {
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
  showView('post');
}

function submitPost(event) {
  event.preventDefault();
  if (!canPost()) return;
  const editing = state.currentEditId ? state.db.stylePosts.find(post => post.id === state.currentEditId) : null;
  if (editing && !canManagePost(editing)) {
    alert('この投稿を編集する権限がありません。');
    return;
  }
  const imageUrl = state.currentImageData || editing?.imageUrl;
  if (!imageUrl) {
    el.formMessage.textContent = '写真を選択してください。';
    el.formMessage.classList.add('error');
    return;
  }
  const post = {
    id: editing?.id || uid('post'),
    title: el.titleInput.value.trim(),
    description: el.descriptionInput.value.trim(),
    imageUrl,
    additionalImages: el.additionalImagesInput.value.split(',').map(value => value.trim()).filter(Boolean),
    extensionColorIds: selectedValues(el.colorSelect),
    styleTypeIds: selectedValues(el.styleTypeSelect),
    extensionCount: Number(el.extensionCountInput.value || 0),
    shopId: el.shopSelect.value,
    staffId: el.staffSelect.value,
    createdByUserId: editing?.createdByUserId || currentUser().id,
    createdAt: editing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    saveCount: editing?.saveCount || 0,
    status: el.statusInput.value,
    isPublished: el.statusInput.value === 'published',
    deletedAt: editing?.deletedAt || '',
    deletedByUserId: editing?.deletedByUserId || '',
    deleteReason: editing?.deleteReason || '',
  };
  if (!post.title || !post.extensionColorIds.length || !post.styleTypeIds.length || !post.extensionCount || !post.shopId || !post.staffId) {
    el.formMessage.textContent = '必須項目を入力してください。';
    el.formMessage.classList.add('error');
    return;
  }
  const index = state.db.stylePosts.findIndex(item => item.id === post.id);
  if (index >= 0) state.db.stylePosts[index] = post;
  else state.db.stylePosts.unshift(post);
  saveDb();
  clearPostForm();
  showDetail(post.id);
}

function logicalDeletePost(postId) {
  const post = state.db.stylePosts.find(item => item.id === postId);
  if (!post || !canManagePost(post)) {
    alert('この投稿を削除する権限がありません。');
    return;
  }
  const reason = prompt('削除理由を入力してください。', '管理上の理由') || '';
  if (!confirm('この投稿を非表示にします。よろしいですか？')) return;
  post.deletedAt = new Date().toISOString();
  post.deletedByUserId = currentUser().id;
  post.deleteReason = reason;
  post.isPublished = false;
  post.status = 'deleted';
  saveDb();
  showView('gallery');
}

function restorePost(postId) {
  if (!canManageAll()) return;
  const post = state.db.stylePosts.find(item => item.id === postId);
  if (!post) return;
  post.deletedAt = '';
  post.deletedByUserId = '';
  post.deleteReason = '';
  post.status = 'published';
  post.isPublished = true;
  saveDb();
  renderAdmin();
}

function hardDeletePost(postId) {
  if (!canManageAll()) return;
  if (!confirm('完全削除します。元に戻せません。')) return;
  state.db.stylePosts = state.db.stylePosts.filter(post => post.id !== postId);
  state.db.savedStyles = state.db.savedStyles.filter(save => save.stylePostId !== postId);
  saveDb();
  renderAdmin();
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
    ['総保存数', posts.reduce((sum, post) => sum + Number(post.saveCount || 0), 0)],
    ['登録店舗数', state.db.shops.length],
    ['登録担当者数', state.db.staff.length],
    ['登録ユーザー数', state.db.users.length],
  ];
  el.adminStats.innerHTML = stats.map(([label, value]) => `<article><span>${label}</span><strong>${value}</strong></article>`).join('');
}

function adminRowsFor(tab) {
  if (tab === 'posts') {
    return activePosts({ includePrivate: true }).map(post => {
      const shop = getById('shops', post.shopId);
      const person = getById('staff', post.staffId);
      const creator = getById('users', post.createdByUserId);
      return `<tr><td><img src="${post.imageUrl}" alt=""></td><td>${escapeHtml(post.title)}</td><td>${escapeHtml(shop?.name || '')}</td><td>${escapeHtml(person?.name || '')}</td><td>${escapeHtml(creator?.name || '')}</td><td>${new Date(post.createdAt).toLocaleDateString('ja-JP')}</td><td>${post.status}</td><td>${post.saveCount}</td><td><button data-action="edit" data-id="${post.id}">編集</button><button data-action="delete" data-id="${post.id}">削除</button></td></tr>`;
    }).join('');
  }
  if (tab === 'colors') {
    return state.db.extensionColors.map(color => `<tr><td><span class="admin-swatch" style="background:${escapeHtml(color.imageUrl)}"></span></td><td>${escapeHtml(color.colorCode)}</td><td>${escapeHtml(color.colorName)}</td><td>${escapeHtml(color.category)}</td><td>${color.isActive ? '公開' : '非公開'}</td><td>${color.sortOrder}</td><td><button data-admin-action="toggle-color" data-id="${color.id}">切替</button></td></tr>`).join('');
  }
  if (tab === 'types') return state.db.styleTypes.map(type => `<tr><td>${escapeHtml(type.name)}</td><td>${type.isActive ? '公開' : '非公開'}</td><td>${type.sortOrder}</td><td><button data-admin-action="toggle-type" data-id="${type.id}">切替</button></td></tr>`).join('');
  if (tab === 'shops') return state.db.shops.map(shop => `<tr><td>${escapeHtml(shop.name)}</td><td>${escapeHtml(shop.address)}</td><td>${shop.isActive ? '公開' : '非公開'}</td><td>${state.db.staff.filter(person => person.shopId === shop.id).length}名</td></tr>`).join('');
  if (tab === 'staff') return state.db.staff.map(person => `<tr><td>${escapeHtml(person.name)}</td><td>${escapeHtml(getById('shops', person.shopId)?.name || '')}</td><td>${person.isActive ? '公開' : '非公開'}</td></tr>`).join('');
  if (tab === 'users') return state.db.users.map(user => `<tr><td>${escapeHtml(user.name)}</td><td>${escapeHtml(user.email)}</td><td>
    <select data-admin-action="change-role" data-id="${user.id}">
      ${Object.values(roles).map(role => `<option value="${role}" ${user.role === role ? 'selected' : ''}>${role}</option>`).join('')}
    </select>
  </td><td>${escapeHtml(getById('shops', user.shopId)?.name || '')}</td></tr>`).join('');
  if (tab === 'deleted') return state.db.stylePosts.filter(post => post.deletedAt).map(post => `<tr><td><img src="${post.imageUrl}" alt=""></td><td>${escapeHtml(post.title)}</td><td>${escapeHtml(post.deleteReason || '')}</td><td>${new Date(post.deletedAt).toLocaleString('ja-JP')}</td><td><button data-action="restore" data-id="${post.id}">復元</button><button data-action="hard-delete" data-id="${post.id}">完全削除</button></td></tr>`).join('');
  return '';
}

function adminHeaders(tab) {
  const headers = {
    posts: ['写真', 'スタイル名', '店舗', '担当者', '投稿者', '投稿日', '状態', '保存数', '操作'],
    colors: ['色', '色番号', '色名', 'カテゴリ', '状態', '順番', '操作'],
    types: ['施術スタイル', '状態', '順番', '操作'],
    shops: ['店舗', '住所', '状態', '担当者数'],
    staff: ['担当者', '店舗', '状態'],
    users: ['ユーザー', 'メール', '権限', '店舗'],
    deleted: ['写真', 'スタイル名', '削除理由', '削除日時', '操作'],
  };
  return headers[tab] || [];
}

function renderAdmin() {
  if (!canManageAll()) {
    el.adminDenied.hidden = false;
    el.adminContent.hidden = true;
    showView('admin');
    return;
  }
  el.adminDenied.hidden = true;
  el.adminContent.hidden = false;
  renderAdminStats();
  document.querySelectorAll('[data-admin-tab]').forEach(button => button.classList.toggle('active', button.dataset.adminTab === state.adminTab));
  const headers = adminHeaders(state.adminTab).map(header => `<th>${header}</th>`).join('');
  el.adminTable.innerHTML = `<table><thead><tr>${headers}</tr></thead><tbody>${adminRowsFor(state.adminTab) || '<tr><td colspan="9">データがありません。</td></tr>'}</tbody></table>`;
  showView('admin');
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
  state.query = '';
  state.selectedColorIds.clear();
  state.selectedStyleTypeIds.clear();
  state.selectedShopIds.clear();
  state.selectedStaffIds.clear();
  state.savedOnly = false;
  state.sort = 'recommended';
  state.visibleCount = PAGE_SIZE;
  el.keywordInput.value = '';
  el.savedOnlyToggle.checked = false;
  el.sortSelect.value = 'recommended';
  renderGallery();
}

function bindEvents() {
  el.userSelect.addEventListener('change', () => {
    state.currentUserId = el.userSelect.value;
    localStorage.setItem(SESSION_KEY, state.currentUserId);
    renderUserSelect();
    renderGallery();
  });
  el.keywordInput.addEventListener('input', event => {
    state.query = event.target.value.trim();
    state.visibleCount = PAGE_SIZE;
    renderGallery();
  });
  el.filterToggle.addEventListener('click', () => { el.filterPanel.hidden = !el.filterPanel.hidden; });
  el.sortSelect.addEventListener('change', event => { state.sort = event.target.value; renderGallery(); });
  el.savedOnlyToggle.addEventListener('change', event => { state.savedOnly = event.target.checked; renderGallery(); });
  el.clearFiltersButton.addEventListener('click', clearFilters);
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
    el.imagePreview.innerHTML = `<img src="${state.currentImageData}" alt="">`;
  });
  el.postForm.addEventListener('submit', submitPost);
  el.cancelEditButton.addEventListener('click', clearPostForm);
  el.openAdminButton.addEventListener('click', renderAdmin);
  document.addEventListener('click', event => {
    const colorButton = event.target.closest('[data-filter-color]');
    if (colorButton) {
      const id = colorButton.dataset.filterColor;
      state.selectedColorIds.has(id) ? state.selectedColorIds.delete(id) : state.selectedColorIds.add(id);
      renderGallery();
      return;
    }
    const styleButton = event.target.closest('[data-filter-style]');
    if (styleButton) {
      const id = styleButton.dataset.filterStyle;
      state.selectedStyleTypeIds.has(id) ? state.selectedStyleTypeIds.delete(id) : state.selectedStyleTypeIds.add(id);
      renderGallery();
      return;
    }
    const chip = event.target.closest('[data-chip-type]');
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
    const action = event.target.closest('[data-action]');
    if (!action) return;
    const id = action.dataset.id;
    const actionName = action.dataset.action;
    if (actionName === 'detail') showDetail(id);
    if (actionName === 'save') toggleSave(id);
    if (actionName === 'edit') showPostForm(id);
    if (actionName === 'delete') logicalDeletePost(id);
    if (actionName === 'restore') restorePost(id);
    if (actionName === 'hard-delete') hardDeletePost(id);
    if (actionName === 'show-menu') showView('menu');
    if (actionName === 'show-gallery' || actionName === 'back-gallery') showView('gallery');
    if (actionName === 'show-post') showPostForm();
    if (actionName === 'show-saved') showSaved();
    if (actionName === 'show-drafts') showDrafts();
    if (actionName === 'show-admin') renderAdmin();
    if (actionName === 'share') navigator.share?.({ title: document.title, url: location.href }).catch(() => {});
    if (actionName === 'similar') {
      const post = state.db.stylePosts.find(item => item.id === id);
      if (post) {
        state.selectedStyleTypeIds = new Set(post.styleTypeIds);
        showView('gallery');
      }
    }
    if (actionName === 'filter-shop') {
      state.selectedShopIds = new Set([id]);
      showView('gallery');
    }
    if (actionName === 'filter-staff') {
      state.selectedStaffIds = new Set([id]);
      showView('gallery');
    }
    if (actionName === 'filter-label') {
      const label = action.dataset.label || '';
      const kind = action.dataset.kind;
      if (kind === 'color') {
        const color = state.db.extensionColors.find(item => label.includes(item.colorCode) || label.includes(item.colorName));
        if (color) state.selectedColorIds = new Set([color.id]);
      }
      if (kind === 'type') {
        const type = state.db.styleTypes.find(item => item.name === label);
        if (type) state.selectedStyleTypeIds = new Set([type.id]);
      }
      showView('gallery');
    }
  });
  document.querySelectorAll('[data-admin-tab]').forEach(button => {
    button.addEventListener('click', () => {
      state.adminTab = button.dataset.adminTab;
      renderAdmin();
    });
  });
  el.adminTable.addEventListener('click', event => {
    const button = event.target.closest('[data-admin-action]');
    if (!button) return;
    if (button.dataset.adminAction === 'toggle-color') toggleAdminActive('extensionColors', button.dataset.id);
    if (button.dataset.adminAction === 'toggle-type') toggleAdminActive('styleTypes', button.dataset.id);
  });
  el.adminTable.addEventListener('change', event => {
    const field = event.target.closest('[data-admin-action="change-role"]');
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
}

function init() {
  loadDb();
  renderUserSelect();
  renderFilterControls();
  renderSelectOptions();
  bindEvents();
  renderGallery();
  showView('menu');
}

init();
