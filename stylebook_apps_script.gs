/**
 * Kimikea Connect Stylebook backend
 *
 * 目的:
 * - スタイル投稿をGoogleスプレッドシートへ保存
 * - 画像をGoogle Driveへ保存
 * - 下書き、公開、保存、削除、復元、管理操作に対応
 *
 * 初期設定:
 * 1. Googleスプレッドシートを作成
 * 2. 拡張機能 > Apps Script を開き、このファイル内容をCode.gsへ貼り付け
 * 3. setupKimikeaStylebook() を手動実行
 * 4. Webアプリとしてデプロイ
 * 5. 発行URLを stylebook/script.js の STYLEBOOK_API_URL に設定
 */

const KC_STYLEBOOK = {
  SPREADSHEET_NAME: 'Kimikea Connect Order 管理表',
  POSTS: 'style_posts',
  SAVES: 'style_saves',
  PRODUCT_MASTER: '商品マスタ',
  TYPES: 'style_types',
  SHOPS: 'style_shops',
  STAFF: 'style_staff',
  USERS: 'style_users',
  IMAGE_FOLDER_NAME: 'Kimikea Connect Stylebook Images',
};

const KC_POST_HEADERS = [
  'id',
  'title',
  'description',
  'imageUrl',
  'imageFileId',
  'additionalImages',
  'additionalImageFileIds',
  'extensionColorIds',
  'styleTypeIds',
  'extensionCount',
  'shopId',
  'staffId',
  'salonName',
  'staffName',
  'createdByUserId',
  'createdAt',
  'updatedAt',
  'saveCount',
  'status',
  'isPublished',
  'deletedAt',
  'deletedByUserId',
  'deleteReason',
  'authorId',
];

const KC_SAVE_HEADERS = ['id', 'userId', 'stylePostId', 'createdAt', 'styleId'];
const KC_PRODUCT_MASTER_HEADERS = ['商品コード', '商品カテゴリー', 'カラー', '仕入価格', '販売価格', '在庫', '表示'];
const KC_TYPE_HEADERS = ['id', 'name', 'isActive', 'sortOrder'];
const KC_SHOP_HEADERS = ['id', 'name', 'address', 'imageUrl', 'isActive'];
const KC_STAFF_HEADERS = ['id', 'name', 'shopId', 'profileImageUrl', 'isActive'];
const KC_USER_HEADERS = ['id', 'name', 'email', 'role', 'shopId', 'staffId'];
const KC_EXTENSION_COLOR_CATEGORIES = ['ダークカラー', 'ライトカラー', '原色'];

function doGet(e) {
  const action = e.parameter.action || 'database';
  const userId = e.parameter.userId || 'user-member';
  logStylebookDebug_('doGet received', {
    action,
    userId,
    parameters: e && e.parameter ? e.parameter : {},
  });
  if (action === 'database' || action === 'list') {
    return json_({ ok: true, database: getStylebookDatabase_(userId) });
  }
  if (action === 'myPosts') {
    return json_({ ok: true, posts: getOwnStylebookPosts_(userId, e.parameter.draftsOnly === 'true') });
  }
  return json_({ ok: false, message: '未対応の処理です。' });
}

function doPost(e) {
  try {
    const payload = JSON.parse((e.postData && e.postData.contents) || '{}');
    const userId = payload.userId || 'user-member';
    const action = payload.action || '';
    if (action === 'savePost') return json_(savePost_(payload.post, userId));
    if (action === 'publishPost') return json_(publishPost_(payload.postId, userId));
    if (action === 'deletePost') return json_(deletePost_(payload.postId, userId, payload.reason || ''));
    if (action === 'restorePost') return json_(restorePost_(payload.postId, userId));
    if (action === 'hardDeletePost') return json_(hardDeletePost_(payload.postId, userId));
    if (action === 'toggleSave') return json_(toggleSave_(payload.postId, userId));
    return json_({ ok: false, message: '未対応の処理です。' });
  } catch (error) {
    return json_({ ok: false, message: error.message || String(error) });
  }
}

function setupKimikeaStylebook() {
  const ss = getKimikeaConnectSpreadsheet_();
  setHeaders_(getOrCreateSheet_(ss, KC_STYLEBOOK.POSTS), KC_POST_HEADERS);
  setHeaders_(getOrCreateSheet_(ss, KC_STYLEBOOK.SAVES), KC_SAVE_HEADERS);
  setHeaders_(getOrCreateSheet_(ss, KC_STYLEBOOK.PRODUCT_MASTER), KC_PRODUCT_MASTER_HEADERS);
  fillMissingProductCodes_(getOrCreateSheet_(ss, KC_STYLEBOOK.PRODUCT_MASTER));
  setHeaders_(getOrCreateSheet_(ss, KC_STYLEBOOK.TYPES), KC_TYPE_HEADERS);
  setHeaders_(getOrCreateSheet_(ss, KC_STYLEBOOK.SHOPS), KC_SHOP_HEADERS);
  setHeaders_(getOrCreateSheet_(ss, KC_STYLEBOOK.STAFF), KC_STAFF_HEADERS);
  setHeaders_(getOrCreateSheet_(ss, KC_STYLEBOOK.USERS), KC_USER_HEADERS);
  seedMastersIfEmpty_(ss);
  getOrCreateImageFolder_();
}

function getStylebookDatabase_(userId) {
  const ss = getKimikeaConnectSpreadsheet_();
  setupSheetsIfNeeded_(ss);
  const normalizedUserId = normalizeUserId_(userId);
  const posts = rowsToObjects_(getOrCreateSheet_(ss, KC_STYLEBOOK.POSTS)).map(normalizePost_);
  const allSaves = rowsToObjects_(getOrCreateSheet_(ss, KC_STYLEBOOK.SAVES)).map(normalizeSave_);
  const ownSaves = allSaves.filter(save => sameUserId_(save.userId, normalizedUserId));
  const saveSummaries = buildSaveSummaries_(posts, allSaves);
  const colors = getProductMasterColors_(ss);
  const types = rowsToObjects_(getOrCreateSheet_(ss, KC_STYLEBOOK.TYPES)).map(normalizeBooleans_);
  const shops = rowsToObjects_(getOrCreateSheet_(ss, KC_STYLEBOOK.SHOPS)).map(normalizeBooleans_);
  const staff = rowsToObjects_(getOrCreateSheet_(ss, KC_STYLEBOOK.STAFF)).map(normalizeBooleans_);
  const users = rowsToObjects_(getOrCreateSheet_(ss, KC_STYLEBOOK.USERS));
  if (!users.some(user => user.id === userId) && users.length) userId = users[0].id;
  logStylebookDebug_('database response counts', {
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    userId,
    posts: posts.length,
    saves: ownSaves.length,
    saveSummaries: saveSummaries.length,
    colors: colors.length,
    types: types.length,
    shops: shops.length,
    staff: staff.length,
    users: users.length,
  });
  return {
    stylePosts: posts,
    savedStyles: ownSaves,
    saveSummaries,
    extensionColors: colors,
    styleTypes: types,
    shops,
    staff,
    users,
  };
}

function getOwnStylebookPosts_(userId, draftsOnly) {
  const ss = getKimikeaConnectSpreadsheet_();
  setupSheetsIfNeeded_(ss);
  const normalizedUserId = normalizeUserId_(userId);
  if (!normalizedUserId) return [];
  return rowsToObjects_(getOrCreateSheet_(ss, KC_STYLEBOOK.POSTS))
    .map(normalizePost_)
    .filter(post => !post.deletedAt)
    .filter(post => sameUserId_(postAuthorId_(post), normalizedUserId))
    .filter(post => {
      const isDraft = post.status === 'draft' || post.status === 'private' || !post.isPublished;
      return draftsOnly ? isDraft : true;
    })
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
}

function buildSaveSummaries_(posts, saves) {
  return posts.map(post => {
    const postSaves = saves.filter(save => saveStyleId_(save) === post.id);
    const lastSavedAt = postSaves
      .map(save => save.createdAt)
      .filter(Boolean)
      .sort()
      .pop() || '';
    return {
      styleId: post.id,
      saveCount: postSaves.length,
      lastSavedAt,
      isPublished: post.isPublished,
      salonName: post.salonName || getShopName_(post.shopId) || '',
      staffName: post.staffName || getStaffName_(post.staffId) || '',
      createdAt: post.createdAt || '',
    };
  });
}

function savePost_(post, userId) {
  const ss = getKimikeaConnectSpreadsheet_();
  setupSheetsIfNeeded_(ss);
  const user = getUser_(userId);
  if (!user) throw new Error('ログインユーザーが見つかりません。');
  const sheet = getOrCreateSheet_(ss, KC_STYLEBOOK.POSTS);
  const existing = post.id ? findRowObject_(sheet, 'id', post.id) : null;
  if (existing && !canManagePost_(existing.object, user)) {
    throw new Error('この投稿を編集する権限がありません。');
  }

  const id = post.id || `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const existingImageUrl = existing ? String(existing.object.imageUrl || '') : '';
  const existingImageFileId = existing ? String(existing.object.imageFileId || '') : '';
  const incomingImage = post.imageUrl || post.photo || existingImageUrl || '';
  const image = saveImageIfNeeded_(id, incomingImage, existingImageFileId);
  const existingAdditionalImages = existing ? splitArray_(existing.object.additionalImages) : [];
  const incomingAdditionalImages = Array.isArray(post.additionalImages) ? post.additionalImages : existingAdditionalImages;
  const additional = saveAdditionalImages_(id, incomingAdditionalImages, existing && existing.object.additionalImageFileIds);
  const status = post.status === 'published' ? 'published' : 'draft';
  const row = {
    id,
    title: post.title || '',
    description: post.description || '',
    imageUrl: image.url || existingImageUrl || post.imageUrl || '',
    imageFileId: image.fileId || existingImageFileId || '',
    additionalImages: additional.urls.join('\n'),
    additionalImageFileIds: additional.fileIds.join('\n'),
    extensionColorIds: arrayString_(post.extensionColorIds),
    styleTypeIds: arrayString_(post.styleTypeIds),
    extensionCount: Number(post.extensionCount || 0),
    shopId: post.shopId || '',
    staffId: post.staffId || '',
    salonName: post.salonName || getShopName_(post.shopId) || '',
    staffName: post.staffName || getStaffName_(post.staffId) || '',
    createdByUserId: existing ? (existing.object.createdByUserId || existing.object.authorId || user.id) : user.id,
    createdAt: existing ? existing.object.createdAt : now,
    updatedAt: now,
    saveCount: existing ? Number(existing.object.saveCount || 0) : 0,
    status,
    isPublished: status === 'published',
    deletedAt: existing ? existing.object.deletedAt : '',
    deletedByUserId: existing ? existing.object.deletedByUserId : '',
    deleteReason: existing ? existing.object.deleteReason : '',
    authorId: existing ? postAuthorId_(existing.object) : user.id,
  };
  upsertObject_(sheet, KC_POST_HEADERS, row, 'id');
  return { ok: true, id, database: getStylebookDatabase_(user.id) };
}

function publishPost_(postId, userId) {
  const sheet = getOrCreateSheet_(getKimikeaConnectSpreadsheet_(), KC_STYLEBOOK.POSTS);
  const user = getUser_(userId);
  const found = findRowObject_(sheet, 'id', postId);
  if (!found) throw new Error('投稿が見つかりません。');
  if (!canManagePost_(found.object, user)) throw new Error('この投稿を公開する権限がありません。');
  found.object.status = 'published';
  found.object.isPublished = true;
  found.object.updatedAt = new Date().toISOString();
  upsertObject_(sheet, KC_POST_HEADERS, found.object, 'id');
  return { ok: true, id: postId };
}

function deletePost_(postId, userId, reason) {
  const sheet = getOrCreateSheet_(getKimikeaConnectSpreadsheet_(), KC_STYLEBOOK.POSTS);
  const user = getUser_(userId);
  const found = findRowObject_(sheet, 'id', postId);
  if (!found) throw new Error('投稿が見つかりません。');
  if (!canDeletePost_(found.object, user)) throw new Error('この投稿を削除する権限がありません。');
  found.object.status = 'deleted';
  found.object.isPublished = false;
  found.object.deletedAt = new Date().toISOString();
  found.object.deletedByUserId = user.id;
  found.object.deleteReason = reason || '';
  found.object.updatedAt = new Date().toISOString();
  upsertObject_(sheet, KC_POST_HEADERS, found.object, 'id');
  return { ok: true, id: postId };
}

function restorePost_(postId, userId) {
  const user = getUser_(userId);
  if (!isHeadquartersAdmin_(user)) throw new Error('本部管理者のみ復元できます。');
  const sheet = getOrCreateSheet_(getKimikeaConnectSpreadsheet_(), KC_STYLEBOOK.POSTS);
  const found = findRowObject_(sheet, 'id', postId);
  if (!found) throw new Error('投稿が見つかりません。');
  found.object.status = 'published';
  found.object.isPublished = true;
  found.object.deletedAt = '';
  found.object.deletedByUserId = '';
  found.object.deleteReason = '';
  found.object.updatedAt = new Date().toISOString();
  upsertObject_(sheet, KC_POST_HEADERS, found.object, 'id');
  return { ok: true, id: postId };
}

function hardDeletePost_(postId, userId) {
  const user = getUser_(userId);
  if (!isHeadquartersAdmin_(user)) throw new Error('本部管理者のみ完全削除できます。');
  const ss = getKimikeaConnectSpreadsheet_();
  deleteRowsByValue_(getOrCreateSheet_(ss, KC_STYLEBOOK.POSTS), 'id', postId);
  deleteRowsBySaveStyleId_(getOrCreateSheet_(ss, KC_STYLEBOOK.SAVES), postId);
  return { ok: true, id: postId };
}

function toggleSave_(postId, userId) {
  const ss = getKimikeaConnectSpreadsheet_();
  const saveSheet = getOrCreateSheet_(ss, KC_STYLEBOOK.SAVES);
  const postSheet = getOrCreateSheet_(ss, KC_STYLEBOOK.POSTS);
  setHeaders_(saveSheet, KC_SAVE_HEADERS);
  const normalizedUserId = normalizeUserId_(userId);
  const existing = rowsToObjects_(saveSheet).map(normalizeSave_).find(save => sameUserId_(save.userId, normalizedUserId) && saveStyleId_(save) === postId);
  const post = findRowObject_(postSheet, 'id', postId);
  if (!post) throw new Error('投稿が見つかりません。');
  if (existing) {
    deleteRowsByValue_(saveSheet, 'id', existing.id);
    post.object.saveCount = Math.max(0, Number(post.object.saveCount || 0) - 1);
  } else {
    appendObjectByHeaders_(saveSheet, {
      id: `save-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: normalizedUserId,
      stylePostId: postId,
      styleId: postId,
      createdAt: new Date().toISOString(),
    });
    post.object.saveCount = Number(post.object.saveCount || 0) + 1;
  }
  upsertObject_(postSheet, KC_POST_HEADERS, post.object, 'id');
  return { ok: true, id: postId };
}

function setupSheetsIfNeeded_(ss) {
  setHeaders_(getOrCreateSheet_(ss, KC_STYLEBOOK.POSTS), KC_POST_HEADERS);
  setHeaders_(getOrCreateSheet_(ss, KC_STYLEBOOK.SAVES), KC_SAVE_HEADERS);
  setHeaders_(getOrCreateSheet_(ss, KC_STYLEBOOK.PRODUCT_MASTER), KC_PRODUCT_MASTER_HEADERS);
  setHeaders_(getOrCreateSheet_(ss, KC_STYLEBOOK.TYPES), KC_TYPE_HEADERS);
  setHeaders_(getOrCreateSheet_(ss, KC_STYLEBOOK.SHOPS), KC_SHOP_HEADERS);
  setHeaders_(getOrCreateSheet_(ss, KC_STYLEBOOK.STAFF), KC_STAFF_HEADERS);
  setHeaders_(getOrCreateSheet_(ss, KC_STYLEBOOK.USERS), KC_USER_HEADERS);
  seedMastersIfEmpty_(ss);
}

function seedMastersIfEmpty_(ss) {
  seedSheetIfEmpty_(getOrCreateSheet_(ss, KC_STYLEBOOK.TYPES), KC_TYPE_HEADERS, defaultTypes_());
  seedSheetIfEmpty_(getOrCreateSheet_(ss, KC_STYLEBOOK.SHOPS), KC_SHOP_HEADERS, [
    ['shop-team', 'TEAM hair', '静岡県富士市横割2丁目2-27', '', true],
    ['shop-fuji', 'エクステランド富士店', '静岡県富士市', '', true],
    ['shop-yoshida', 'エクステランド吉田店', '静岡県榛原郡吉田町', '', true],
  ]);
  seedSheetIfEmpty_(getOrCreateSheet_(ss, KC_STYLEBOOK.STAFF), KC_STAFF_HEADERS, [
    ['staff-boss', 'BOSS', 'shop-team', '', true],
    ['staff-kana', '神田 加奈', 'shop-team', '', true],
    ['staff-ai', '松本 藍', 'shop-team', '', true],
    ['staff-chisa', '松下 千紗', 'shop-team', '', true],
  ]);
  seedSheetIfEmpty_(getOrCreateSheet_(ss, KC_STYLEBOOK.USERS), KC_USER_HEADERS, [
    ['user-member', '加盟店メンバー', 'member@example.com', 'member', 'shop-team', ''],
    ['user-hq', '本部管理者', 'admin@example.com', 'headquarters_admin', '', ''],
  ]);
}

function defaultTypes_() {
  return ['イヤリングカラー', 'インナーカラー', 'ハイライト', 'メッシュ', 'グラデーション', '長さ出し', 'ボリュームアップ', '前髪エクステ', 'ポイントエクステ', '原色デザイン', 'その他']
    .map((name, index) => [`type-${String(index + 1).padStart(2, '0')}`, name, true, index + 1]);
}

function canManagePost_(post, user) {
  if (!user) return false;
  return sameUserId_(postAuthorId_(post), user.id);
}

function canDeletePost_(post, user) {
  if (!user) return false;
  return sameUserId_(postAuthorId_(post), user.id);
}

function postAuthorId_(post) {
  return String((post && (post.authorId || post.createdByUserId || post.userId)) || '').trim();
}

function normalizeUserId_(value) {
  return String(value == null ? '' : value).trim();
}

function sameUserId_(left, right) {
  const a = normalizeUserId_(left);
  const b = normalizeUserId_(right);
  return Boolean(a && b && a === b);
}

function saveStyleId_(save) {
  return String((save && (save.styleId || save.stylePostId || save.postId)) || '').trim();
}

function isHeadquartersAdmin_(user) {
  return user && user.role === 'headquarters_admin';
}

function getUser_(userId) {
  return rowsToObjects_(getOrCreateSheet_(getKimikeaConnectSpreadsheet_(), KC_STYLEBOOK.USERS)).find(user => user.id === userId) || null;
}

function getShopName_(shopId) {
  if (!shopId) return '';
  const shop = rowsToObjects_(getOrCreateSheet_(getKimikeaConnectSpreadsheet_(), KC_STYLEBOOK.SHOPS)).find(item => item.id === shopId);
  return shop ? shop.name : '';
}

function getStaffName_(staffId) {
  if (!staffId) return '';
  const staff = rowsToObjects_(getOrCreateSheet_(getKimikeaConnectSpreadsheet_(), KC_STYLEBOOK.STAFF)).find(item => item.id === staffId);
  return staff ? staff.name : '';
}

function getProductMasterColors_(ss) {
  const sheet = getOrCreateSheet_(ss, KC_STYLEBOOK.PRODUCT_MASTER);
  setHeaders_(sheet, KC_PRODUCT_MASTER_HEADERS);
  fillMissingProductCodes_(sheet);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    logStylebookDebug_('product master empty', {
      spreadsheetId: ss.getId(),
      sheetName: sheet.getName(),
      totalRowsIncludingHeader: values.length,
    });
    return [];
  }

  const headers = values[0].map(normalizeHeaderName_);
  const indexes = {
    productCode: headers.indexOf(normalizeHeaderName_('商品コード')),
    category: headers.indexOf(normalizeHeaderName_('商品カテゴリー')),
    color: headers.indexOf(normalizeHeaderName_('カラー')),
    visible: headers.indexOf(normalizeHeaderName_('表示')),
    purchasePrice: headers.indexOf(normalizeHeaderName_('仕入価格')),
    salesPrice: headers.indexOf(normalizeHeaderName_('販売価格')),
    stock: headers.indexOf(normalizeHeaderName_('在庫')),
  };
  if (indexes.category < 0 || indexes.color < 0 || indexes.visible < 0) {
    logStylebookDebug_('product master missing headers', {
      rawHeaders: values[0].map(String),
      normalizedHeaders: headers,
      indexes,
    });
    throw new Error('商品マスタに必要な列がありません。商品カテゴリー・カラー・表示を確認してください。');
  }

  const colors = [];
  const seenKeys = {};
  const diagnostics = {
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    sheetName: sheet.getName(),
    totalRowsIncludingHeader: values.length,
    dataRows: Math.max(values.length - 1, 0),
    rawHeaders: values[0].map(String),
    normalizedHeaders: headers,
    indexes,
    skippedBlankCategory: 0,
    skippedBlankColor: 0,
    skippedHidden: 0,
    skippedDuplicate: 0,
    acceptedByCategory: {},
  };
  values.slice(1).forEach((row, index) => {
    const category = String(row[indexes.category] || '').trim();
    const colorValue = String(row[indexes.color] || '').trim();
    const productCode = indexes.productCode >= 0 ? String(row[indexes.productCode] || '').trim() : '';
    const visible = normalizeBoolean_(row[indexes.visible]);
    if (!category) {
      diagnostics.skippedBlankCategory += 1;
      return;
    }
    if (KC_EXTENSION_COLOR_CATEGORIES.indexOf(category) === -1) {
      diagnostics.skippedNonColorCategory = Number(diagnostics.skippedNonColorCategory || 0) + 1;
      return;
    }
    if (!colorValue) {
      diagnostics.skippedBlankColor += 1;
      return;
    }
    if (!visible) {
      diagnostics.skippedHidden += 1;
      return;
    }
    const dedupeKey = `${normalizeHeaderName_(category)}::${normalizeHeaderName_(colorValue)}`;
    if (seenKeys[dedupeKey]) {
      diagnostics.skippedDuplicate += 1;
      return;
    }
    seenKeys[dedupeKey] = true;

    const parsed = parseProductColor_(colorValue);
    const fallbackProductCode = productCode || createDefaultProductCode_(category, index + 1);
    diagnostics.acceptedByCategory[category] = Number(diagnostics.acceptedByCategory[category] || 0) + 1;
    colors.push({
      id: fallbackProductCode,
      colorId: fallbackProductCode,
      colorCode: parsed.code,
      colorName: parsed.name,
      category,
      imageUrl: colorSwatchFromProduct_(category, colorValue),
      isActive: true,
      sortOrder: index + 1,
      productCode: fallbackProductCode,
      productCategory: category,
      productColor: colorValue,
      purchasePrice: indexes.purchasePrice >= 0 ? Number(row[indexes.purchasePrice] || 0) : 0,
      salesPrice: indexes.salesPrice >= 0 ? Number(row[indexes.salesPrice] || 0) : 0,
      stock: indexes.stock >= 0 ? row[indexes.stock] : '',
    });
  });
  diagnostics.returnedColors = colors.length;
  diagnostics.firstColors = colors.slice(0, 12).map(color => ({
    id: color.id,
    category: color.category,
    colorCode: color.colorCode,
    colorName: color.colorName,
    productColor: color.productColor,
    productCode: color.productCode,
  }));
  logStylebookDebug_('product master colors loaded', diagnostics);
  return colors;
}

function fillMissingProductCodes_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return;
  const headers = values[0].map(normalizeHeaderName_);
  const codeIndex = headers.indexOf(normalizeHeaderName_('商品コード'));
  const categoryIndex = headers.indexOf(normalizeHeaderName_('商品カテゴリー'));
  if (codeIndex < 0 || categoryIndex < 0) return;

  const counters = {};
  values.slice(1).forEach((row) => {
    const category = String(row[categoryIndex] || '').trim();
    const code = String(row[codeIndex] || '').trim();
    if (!category || !code) return;
    counters[category] = Number(counters[category] || 0) + 1;
  });
  values.slice(1).forEach((row, rowOffset) => {
    if (String(row[codeIndex] || '').trim()) return;
    const category = String(row[categoryIndex] || '').trim();
    counters[category] = Number(counters[category] || 0) + 1;
    sheet.getRange(rowOffset + 2, codeIndex + 1).setValue(createDefaultProductCode_(category, counters[category]));
  });
}

function createDefaultProductCode_(category, sequence) {
  const prefixes = {
    'ダークカラー': 'DC',
    'ライトカラー': 'LC',
    '原色': 'OR',
    'その他': 'OT',
  };
  const prefix = prefixes[category] || 'EX';
  return `${prefix}${String(sequence).padStart(3, '0')}`;
}

function normalizeHeaderName_(value) {
  return String(value || '').replace(/[\s　\r\n]/g, '').trim();
}

function parseProductColor_(value) {
  const text = String(value || '').trim();
  if (!text) return { code: '', name: '' };
  const match = text.match(/^([^\s　]+)[\s　]+(.+)$/);
  if (!match) return { code: text, name: '' };
  return { code: match[1], name: match[2] };
}

function colorSwatchFromProduct_(category, colorValue) {
  const text = `${category} ${colorValue}`.toLowerCase();
  if (text.includes('white') || text.includes('ホワイト')) return '#f8f5ec';
  if (text.includes('silver') || text.includes('シルバー') || text.includes('gray') || text.includes('グレー')) return '#c9c9c4';
  if (text.includes('milk') || text.includes('tea') || text.includes('ミルク') || text.includes('ベージュ')) return '#d4bea0';
  if (text.includes('pink') || text.includes('ピンク')) return '#e9a5c4';
  if (text.includes('red') || text.includes('レッド')) return '#c74348';
  if (text.includes('purple') || text.includes('パープル') || text.includes('vn')) return '#7d5aa6';
  if (text.includes('blue') || text.includes('ブルー') || text.includes('sb')) return '#4e8fc6';
  if (text.includes('green') || text.includes('グリーン')) return '#4d9872';
  if (text.includes('orange') || text.includes('オレンジ')) return '#dd8a43';
  if (text.includes('yellow') || text.includes('イエロー')) return '#e3c54f';
  if (category === 'ダークカラー') return '#3c2b24';
  if (category === 'ライトカラー') return '#c8b49a';
  if (category === '原色') return 'linear-gradient(135deg, #f5b5cf, #8fc8df, #f0d36a)';
  return '#efe9df';
}

function getKimikeaConnectSpreadsheet_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active && active.getName && active.getName() === KC_STYLEBOOK.SPREADSHEET_NAME) return active;
  if (active && active.getSheetByName(KC_STYLEBOOK.PRODUCT_MASTER)) return active;

  const files = DriveApp.getFilesByName(KC_STYLEBOOK.SPREADSHEET_NAME);
  if (files.hasNext()) {
    return SpreadsheetApp.open(files.next());
  }
  if (active) return active;
  throw new Error(`${KC_STYLEBOOK.SPREADSHEET_NAME} が見つかりません。`);
}

function normalizePost_(row) {
  const imageFileId = row.imageFileId || row.imageFileID || row.fileId || '';
  const imageUrl = row.imageUrl || row.imageUrls || row.photo || row.photoUrl || getFileUrl_(imageFileId) || '';
  return {
    id: row.id,
    title: row.title || '',
    description: row.description || '',
    imageUrl,
    imageFileId,
    additionalImages: splitArray_(row.additionalImages || row.additionalImageUrls || row.imageUrls),
    additionalImageFileIds: splitArray_(row.additionalImageFileIds),
    extensionColorIds: splitArray_(row.extensionColorIds),
    styleTypeIds: splitArray_(row.styleTypeIds),
    extensionCount: Number(row.extensionCount || 0),
    shopId: row.shopId || '',
    staffId: row.staffId || '',
    salonName: row.salonName || getShopName_(row.shopId) || '',
    staffName: row.staffName || getStaffName_(row.staffId) || '',
    createdByUserId: row.createdByUserId || '',
    createdAt: row.createdAt || '',
    updatedAt: row.updatedAt || '',
    saveCount: Number(row.saveCount || 0),
    status: row.status || 'draft',
    isPublished: normalizeBoolean_(row.isPublished),
    deletedAt: row.deletedAt || '',
    deletedByUserId: row.deletedByUserId || '',
    deleteReason: row.deleteReason || '',
    authorId: row.authorId || row.createdByUserId || '',
  };
}

function normalizeSave_(row) {
  const styleId = saveStyleId_(row);
  return {
    id: row.id || '',
    userId: row.userId || '',
    stylePostId: row.stylePostId || styleId,
    styleId,
    createdAt: row.createdAt || '',
  };
}

function normalizeBooleans_(row) {
  if ('isActive' in row) row.isActive = normalizeBoolean_(row.isActive);
  if ('sortOrder' in row) row.sortOrder = Number(row.sortOrder || 0);
  return row;
}

function normalizeBoolean_(value) {
  if (value === true) return true;
  return String(value).normalize('NFKC').trim().toUpperCase() === 'TRUE';
}

function saveImageIfNeeded_(prefix, value, existingFileId) {
  if (!value || !String(value).startsWith('data:image/')) {
    return { url: value || getFileUrl_(existingFileId), fileId: existingFileId || '' };
  }
  const file = createImageFile_(prefix, value);
  return { url: driveViewUrl_(file.getId()), fileId: file.getId() };
}

function saveAdditionalImages_(postId, images, existingFileIdsText) {
  const existingFileIds = splitArray_(existingFileIdsText);
  const urls = [];
  const fileIds = [];
  images.forEach((image, index) => {
    if (String(image).startsWith('data:image/')) {
      const file = createImageFile_(`${postId}-${index + 1}`, image);
      urls.push(driveViewUrl_(file.getId()));
      fileIds.push(file.getId());
    } else if (image) {
      urls.push(image);
      const existingId = existingFileIds[index] || '';
      if (existingId) fileIds.push(existingId);
    }
  });
  return { urls, fileIds };
}

function createImageFile_(name, dataUrl) {
  const match = String(dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error('画像形式を読み取れませんでした。');
  const mimeType = match[1];
  const extension = mimeType.includes('webp') ? 'webp' : (mimeType.includes('png') ? 'png' : 'jpg');
  const blob = Utilities.newBlob(Utilities.base64Decode(match[2]), mimeType, `${name}.${extension}`);
  const file = getOrCreateImageFolder_().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file;
}

function getFileUrl_(fileId) {
  return fileId ? driveViewUrl_(fileId) : '';
}

function driveViewUrl_(fileId) {
  return `https://lh3.googleusercontent.com/d/${fileId}=w1600`;
}

function logStylebookDebug_(label, data) {
  try {
    Logger.log(`[STYLEBOOK DEBUG] ${label}: ${JSON.stringify(data)}`);
  } catch (error) {
    Logger.log(`[STYLEBOOK DEBUG] ${label}: ${String(data)}`);
  }
}

function getOrCreateImageFolder_() {
  const props = PropertiesService.getScriptProperties();
  const storedId = props.getProperty('STYLEBOOK_IMAGE_FOLDER_ID');
  if (storedId) {
    try {
      return DriveApp.getFolderById(storedId);
    } catch (error) {
      props.deleteProperty('STYLEBOOK_IMAGE_FOLDER_ID');
    }
  }
  const folders = DriveApp.getFoldersByName(KC_STYLEBOOK.IMAGE_FOLDER_NAME);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(KC_STYLEBOOK.IMAGE_FOLDER_NAME);
  props.setProperty('STYLEBOOK_IMAGE_FOLDER_ID', folder.getId());
  return folder;
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function setHeaders_(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return;
  }
  const current = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
  const missing = headers.filter(header => !current.includes(header));
  if (missing.length) {
    sheet.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
  }
  sheet.setFrozenRows(1);
}

function seedSheetIfEmpty_(sheet, headers, rows) {
  setHeaders_(sheet, headers);
  if (sheet.getLastRow() > 1) return;
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function rowsToObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).filter(row => row.some(value => value !== '')).map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
}

function findRowObject_(sheet, key, value) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;
  const headers = values[0].map(String);
  const keyIndex = headers.indexOf(key);
  for (let row = 1; row < values.length; row += 1) {
    if (values[row][keyIndex] === value) {
      const object = {};
      headers.forEach((header, index) => {
        object[header] = values[row][index];
      });
      return { row: row + 1, object };
    }
  }
  return null;
}

function upsertObject_(sheet, headers, object, key) {
  setHeaders_(sheet, headers);
  const found = findRowObject_(sheet, key, object[key]);
  const rowValues = headers.map(header => {
    const value = object[header];
    if (Array.isArray(value)) return value.join('\n');
    return value == null ? '' : value;
  });
  if (found) {
    sheet.getRange(found.row, 1, 1, headers.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
}

function appendObjectByHeaders_(sheet, object) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  sheet.appendRow(headers.map(header => {
    const value = object[header];
    if (Array.isArray(value)) return value.join('\n');
    return value == null ? '' : value;
  }));
}

function deleteRowsByValue_(sheet, key, value) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;
  const headers = values[0].map(String);
  const keyIndex = headers.indexOf(key);
  for (let row = values.length - 1; row >= 1; row -= 1) {
    if (values[row][keyIndex] === value) sheet.deleteRow(row + 1);
  }
}

function deleteRowsBySaveStyleId_(sheet, postId) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;
  const headers = values[0].map(String);
  const stylePostIndex = headers.indexOf('stylePostId');
  const styleIndex = headers.indexOf('styleId');
  for (let row = values.length - 1; row >= 1; row -= 1) {
    const stylePostId = stylePostIndex >= 0 ? String(values[row][stylePostIndex] || '') : '';
    const styleId = styleIndex >= 0 ? String(values[row][styleIndex] || '') : '';
    if (stylePostId === postId || styleId === postId) sheet.deleteRow(row + 1);
  }
}

function splitArray_(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || '').split(/\n|,/).map(item => item.trim()).filter(Boolean);
}

function arrayString_(value) {
  return Array.isArray(value) ? value.join('\n') : String(value || '');
}

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
