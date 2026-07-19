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
  SPREADSHEET_ID: '1Gyp5QVyiPmViJ9IpX-cWelSwxTWa6oddBsi8OHcQhts',
  POSTS: 'style_posts',
  SAVES: 'style_saves',
  PRODUCT_MASTER: '商品マスタ',
  TYPES: 'style_types',
  SHOPS: 'style_shops',
  STAFF: 'style_staff',
  USERS: 'style_users',
  FRANCHISE_MASTER: '加盟店マスタ',
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
  'isDeleted',
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
  if (action === 'shopDatabase') {
    return json_({ ok: true, database: getStylebookDatabase_(userId, { shopId: e.parameter.shopId || '' }) });
  }
  if (action === 'myPosts') {
    return json_({ ok: true, posts: getOwnStylebookPosts_(userId, e.parameter.draftsOnly === 'true') });
  }
  if (action === 'colorUsageRankings') {
    return json_({ ok: true, ranking: getStylebookColorUsageRanking_() });
  }
  if (action === 'stylesByColor') {
    return json_(getPublicStylebookPostsByColor_(e.parameter || {}));
  }
  return json_({ ok: false, message: '未対応の処理です。' });
}

function doPost(e) {
  try {
    const payload = JSON.parse((e.postData && e.postData.contents) || '{}');
    const userId = payload.userId || 'user-member';
    const action = payload.action || '';
    logStylebookDebug_('doPost received', {
      action,
      userId,
      hasPost: Boolean(payload.post),
      postId: payload.post && payload.post.id,
    });
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
  syncFranchiseMasterToStylebook_(ss);
  getOrCreateImageFolder_();
}

function getStylebookDatabase_(userId, options) {
  const ss = getKimikeaConnectSpreadsheet_();
  setupSheetsIfNeeded_(ss);
  const normalizedUserId = normalizeUserId_(userId);
  const scopedShopId = String((options && options.shopId) || '').trim();
  const rawPosts = rowsToObjects_(getOrCreateSheet_(ss, KC_STYLEBOOK.POSTS)).map(normalizePost_);
  const scopedRawPosts = rawPosts
    .filter(post => !scopedShopId || String(post.shopId || '').trim() === scopedShopId);
  const posts = scopedRawPosts.filter(post => !isDeletedStylebookPost_(post));
  const validPublishedPosts = scopedRawPosts.filter(isValidPublishedStylebookPost_);
  const deletedPosts = scopedRawPosts.filter(isDeletedStylebookPost_);
  const draftPosts = scopedRawPosts.filter(isDraftStylebookPost_);
  const noImagePublishedPosts = scopedRawPosts.filter(post => {
    const status = String((post && post.status) || '').normalize('NFKC').trim().toLowerCase();
    return status === 'published' && !isDeletedStylebookPost_(post) && !hasPublicStylebookImage_(post);
  });
  const allSaves = rowsToObjects_(getOrCreateSheet_(ss, KC_STYLEBOOK.SAVES)).map(normalizeSave_);
  const ownSaves = allSaves.filter(save => sameUserId_(save.userId, normalizedUserId));
  const saveSummaries = buildSaveSummaries_(posts, allSaves);
  const colors = getProductMasterColors_(ss);
  const types = rowsToObjects_(getOrCreateSheet_(ss, KC_STYLEBOOK.TYPES)).map(normalizeBooleans_);
  const shops = rowsToObjects_(getOrCreateSheet_(ss, KC_STYLEBOOK.SHOPS)).map(normalizeBooleans_);
  const staff = rowsToObjects_(getOrCreateSheet_(ss, KC_STYLEBOOK.STAFF)).map(normalizeBooleans_);
  const users = rowsToObjects_(getOrCreateSheet_(ss, KC_STYLEBOOK.USERS));
  logStylebookDebug_('database response counts', {
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    userId,
    shopId: scopedShopId,
    rawPosts: scopedRawPosts.length,
    posts: posts.length,
    validPublishedPosts: validPublishedPosts.length,
    deletedPosts: deletedPosts.length,
    draftPosts: draftPosts.length,
    noImagePublishedPosts: noImagePublishedPosts.length,
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
    .filter(post => !isDeletedStylebookPost_(post))
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

function getStylebookColorUsageRanking_() {
  const ss = getKimikeaConnectSpreadsheet_();
  const posts = rowsToObjects_(getOrCreateSheet_(ss, KC_STYLEBOOK.POSTS)).map(normalizePost_);
  const counts = {};
  let publicPostCount = 0;
  let colorSelectionCount = 0;
  posts.forEach(post => {
    if (!isPublicRankingPost_(post)) return;
    publicPostCount += 1;
    const colorIds = extractRankingColorKeysFromPost_(post);
    const uniqueColorIds = Array.from(new Set(colorIds));
    uniqueColorIds.forEach(colorId => {
      counts[colorId] = Number(counts[colorId] || 0) + 1;
      colorSelectionCount += 1;
    });
  });
  logStylebookDebug_('color usage ranking', {
    publicPostCount,
    colorSelectionCount,
    counts,
  });
  return {
    counts,
    publicPostCount,
    colorSelectionCount,
  };
}

function getPublicStylebookPostsByColor_(params) {
  const requestedKeys = requestedRankingColorKeys_(params);
  if (!requestedKeys.length) {
    return { ok: false, message: 'カラー識別値が指定されていません。', posts: [] };
  }
  const ss = getKimikeaConnectSpreadsheet_();
  const posts = rowsToObjects_(getOrCreateSheet_(ss, KC_STYLEBOOK.POSTS)).map(normalizePost_);
  const matchedPosts = posts
    .filter(post => isPublicRankingPost_(post) && postMatchesRankingColor_(post, requestedKeys))
    .map(publicStylePostForColorDetail_);
  logStylebookDebug_('styles by color', {
    requestedKeys,
    matchedCount: matchedPosts.length,
    postIds: matchedPosts.map(post => post.id),
  });
  return {
    ok: true,
    colorKeys: requestedKeys,
    posts: matchedPosts,
  };
}

function requestedRankingColorKeys_(params) {
  const values = [];
  ['colorKey', 'productCode', 'colorCode', 'colorName', 'aliases'].forEach(key => {
    collectRankingColorValues_(params[key], values);
  });
  return Array.from(new Set(values.map(normalizeRankingColorKey_).filter(Boolean)));
}

function postMatchesRankingColor_(post, requestedKeys) {
  const postKeys = new Set(extractRankingColorKeysFromPost_(post));
  return requestedKeys.some(key => postKeys.has(key));
}

function extractRankingColorKeysFromPost_(post) {
  const values = [];
  [
    post.extensionColorIds,
    post.extensionColors,
    post.colorCodes,
    post.colors,
    post.colorLabels,
  ].forEach(entry => collectRankingColorValues_(entry, values));
  return Array.from(new Set(values.map(normalizeRankingColorKey_).filter(Boolean)));
}

function collectRankingColorValues_(entry, values) {
  if (!entry) return;
  if (Array.isArray(entry)) {
    entry.forEach(item => collectRankingColorValues_(item, values));
    return;
  }
  if (typeof entry === 'object') {
    ['productCode', 'code', 'colorCode', 'id', 'colorId', 'colorName', 'name'].forEach(key => {
      if (entry[key]) values.push(entry[key]);
    });
    return;
  }
  const text = String(entry || '').trim();
  if (!text) return;
  if ((text.startsWith('[') && text.endsWith(']')) || (text.startsWith('{') && text.endsWith('}'))) {
    try {
      collectRankingColorValues_(JSON.parse(text), values);
      return;
    } catch (error) {
      // Continue as plain text below.
    }
  }
  text.split(/[\n,、|/]+/).forEach(item => {
    const value = String(item || '').trim();
    if (value) values.push(value);
  });
}

function publicStylePostForColorDetail_(post) {
  return {
    id: post.id,
    title: post.title || '',
    imageUrl: post.imageUrl || '',
    additionalImages: post.additionalImages || [],
    salonName: post.salonName || '',
    staffName: post.staffName || '',
    shopId: post.shopId || '',
    staffId: post.staffId || '',
    extensionCount: post.extensionCount || 0,
    extensionColorIds: post.extensionColorIds || [],
    createdAt: post.createdAt || '',
    status: post.status || '',
    isPublished: post.isPublished,
  };
}

function isPublicRankingPost_(post) {
  return isValidPublishedStylebookPost_(post);
}

function hasPublicStylebookImage_(post) {
  return Boolean(String(
    (post && (
      post.imageUrl
      || post.photoUrl
      || post.photo
      || post.image
      || post.imageFileId
      || post.imageFileID
      || post.fileId
    ))
    || ''
  ).trim());
}

function isValidPublishedStylebookPost_(post) {
  const status = String((post && post.status) || '').normalize('NFKC').trim().toLowerCase();
  if (status !== 'published') return false;
  if (isDeletedStylebookPost_(post)) return false;
  if (post.isPublished === false || String(post.isPublished).normalize('NFKC').trim().toUpperCase() === 'FALSE') return false;
  if (!String((post && post.id) || '').trim()) return false;
  if (!hasPublicStylebookImage_(post)) return false;
  return true;
}

function isDraftStylebookPost_(post) {
  const status = String((post && post.status) || '').normalize('NFKC').trim().toLowerCase();
  return ['draft', 'private', 'unpublished', '非公開', '下書き'].indexOf(status) >= 0
    || post.isPublished === false
    || String(post && post.isPublished).normalize('NFKC').trim().toUpperCase() === 'FALSE';
}

function isDeletedStylebookPost_(post) {
  const status = String((post && post.status) || '').normalize('NFKC').trim().toLowerCase();
  const visibility = String((post && post.visibility) || '').normalize('NFKC').trim().toLowerCase();
  const deletedFlags = [
    post && post.isDeleted,
    post && post.deleted,
    post && post.is_delete,
    post && post.isDeletedFlag,
    post && post.isRemoved,
    post && post['削除'],
    post && post['削除済み'],
  ].map(value => String(value || '').normalize('NFKC').replace(/\s+/g, '').trim().toLowerCase());
  const isDeleted = deletedFlags.some(value => ['true', '1', 'yes', 'y', 'deleted', 'delete', '削除', '削除済み'].indexOf(value) >= 0);
  return Boolean(
    (post && (post.deletedAt || post.deleted_at || post['削除日時']))
    || isDeleted
    || ['deleted', 'delete', 'removed', 'trash', '削除', '削除済み'].indexOf(status) >= 0
    || ['deleted', 'delete', 'removed', 'trash', '削除', '削除済み'].indexOf(visibility) >= 0
  );
}

function normalizeRankingColorKey_(value) {
  return String(value || '').normalize('NFKC').trim().replace(/[\s\-‐‑‒–—―]+/g, '').toUpperCase();
}

function savePost_(post, userId) {
  const startedAt = Date.now();
  const ss = getKimikeaConnectSpreadsheet_();
  setupSheetsIfNeeded_(ss);
  const setupMs = Date.now() - startedAt;
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
  const imageStart = Date.now();
  const image = saveImageIfNeeded_(id, incomingImage, existingImageFileId);
  const imageMs = Date.now() - imageStart;
  const existingAdditionalImages = existing ? splitArray_(existing.object.additionalImages) : [];
  const incomingAdditionalImages = Array.isArray(post.additionalImages) ? post.additionalImages : existingAdditionalImages;
  const additionalImageStart = Date.now();
  const additional = saveAdditionalImages_(id, incomingAdditionalImages, existing && existing.object.additionalImageFileIds);
  const additionalImageMs = Date.now() - additionalImageStart;
  const status = post.status === 'published' ? 'published' : 'draft';
  const resolvedShopId = existing ? String(existing.object.shopId || '') : String(user.shopId || '');
  const resolvedStaffId = existing ? String(existing.object.staffId || '') : String(user.staffId || '');
  const hasSubmittedSalonName = Object.prototype.hasOwnProperty.call(post || {}, 'salonName');
  const hasSubmittedStaffName = Object.prototype.hasOwnProperty.call(post || {}, 'staffName');
  const submittedSalonName = String(post.salonName || '').trim();
  const submittedStaffName = String(post.staffName || '').trim();
  const fallbackSalonName = String(getShopName_(resolvedShopId) || user.shopName || user.name || '').trim();
  const fallbackStaffName = String(getStaffName_(resolvedStaffId) || user.displayName || user.name || '').trim();
  const resolvedSalonName = submittedSalonName
    || (hasSubmittedSalonName ? fallbackSalonName : (existing ? String(existing.object.salonName || '').trim() : ''))
    || fallbackSalonName;
  const resolvedStaffName = submittedStaffName
    || (hasSubmittedStaffName ? fallbackStaffName : (existing ? String(existing.object.staffName || '').trim() : ''))
    || fallbackStaffName;
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
    shopId: resolvedShopId,
    staffId: resolvedStaffId,
    salonName: resolvedSalonName,
    staffName: resolvedStaffName,
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
    isDeleted: existing ? normalizeBoolean_(existing.object.isDeleted) : false,
  };
  const sheetStart = Date.now();
  const writeResult = upsertObject_(sheet, KC_POST_HEADERS, row, 'id');
  SpreadsheetApp.flush();
  const verified = findRowObject_(sheet, 'id', id);
  if (!verified || !verified.object || String(verified.object.id || '').trim() !== String(id).trim()) {
    throw new Error(`style_postsへの保存確認に失敗しました。postId=${id}`);
  }
  const sheetMs = Date.now() - sheetStart;
  const normalizedPost = normalizePost_(verified.object);
  logStylebookDebug_('savePost timing', {
    id,
    isEdit: Boolean(existing),
    status,
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    sheetName: sheet.getName(),
    writeAction: writeResult.action,
    rowNumber: writeResult.rowNumber,
    verifiedRowNumber: verified.row,
    createdAt: normalizedPost.createdAt,
    createdByUserId: normalizedPost.createdByUserId,
    setupMs,
    imageMs,
    additionalImageMs,
    sheetMs,
    totalMs: Date.now() - startedAt,
  });
  return {
    ok: true,
    success: true,
    written: true,
    id,
    post: normalizedPost,
    savedPostId: id,
    createdAt: normalizedPost.createdAt,
    createdByUserId: normalizedPost.createdByUserId,
    spreadsheetId: ss.getId(),
    sheetName: sheet.getName(),
    rowNumber: verified.row,
  };
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
  return { ok: true, id: postId, post: normalizePost_(found.object) };
}

function deletePost_(postId, userId, reason) {
  const sheet = getOrCreateSheet_(getKimikeaConnectSpreadsheet_(), KC_STYLEBOOK.POSTS);
  const user = getUser_(userId);
  const found = findRowObject_(sheet, 'id', postId);
  if (!found) throw new Error('投稿が見つかりません。');
  if (!canDeletePost_(found.object, user)) throw new Error('この投稿を削除する権限がありません。');
  found.object.status = 'deleted';
  found.object.isPublished = false;
  found.object.isDeleted = true;
  found.object.deletedAt = new Date().toISOString();
  found.object.deletedByUserId = user.id;
  found.object.deleteReason = reason || '';
  found.object.updatedAt = new Date().toISOString();
  upsertObject_(sheet, KC_POST_HEADERS, found.object, 'id');
  return { ok: true, id: postId, post: normalizePost_(found.object) };
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
  const normalizedPostId = String(postId || '').trim();
  if (!normalizedUserId) throw new Error('ログインユーザーが見つかりません。');
  if (!normalizedPostId) throw new Error('保存する投稿が指定されていません。');
  const user = getUser_(normalizedUserId);
  if (!user) throw new Error('ログインユーザーが見つかりません。');
  const saves = rowsToObjects_(saveSheet).map(normalizeSave_);
  const existing = saves.find(save => sameUserId_(save.userId, normalizedUserId) && saveStyleId_(save) === normalizedPostId);
  const post = findRowObject_(postSheet, 'id', normalizedPostId);
  if (!post) throw new Error('投稿が見つかりません。');
  if (existing) {
    deleteSaveRowsForUserAndPost_(saveSheet, normalizedUserId, normalizedPostId);
  } else {
    appendObjectByHeaders_(saveSheet, {
      id: `save-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: normalizedUserId,
      stylePostId: normalizedPostId,
      styleId: normalizedPostId,
      createdAt: new Date().toISOString(),
    });
  }
  const refreshedSaves = rowsToObjects_(saveSheet).map(normalizeSave_);
  const saveCount = refreshedSaves.filter(save => saveStyleId_(save) === normalizedPostId).length;
  const ownSave = refreshedSaves.find(save => sameUserId_(save.userId, normalizedUserId) && saveStyleId_(save) === normalizedPostId);
  post.object.saveCount = saveCount;
  upsertObject_(postSheet, KC_POST_HEADERS, post.object, 'id');
  logStylebookDebug_('toggleSave result', {
    userId: normalizedUserId,
    postId: normalizedPostId,
    saved: Boolean(ownSave),
    saveCount,
  });
  return {
    ok: true,
    id: normalizedPostId,
    saved: Boolean(ownSave),
    saveCount,
    lastSavedAt: ownSave ? ownSave.createdAt : '',
  };
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
  syncFranchiseMasterToStylebook_(ss);
}

function seedMastersIfEmpty_(ss) {
  seedSheetIfEmpty_(getOrCreateSheet_(ss, KC_STYLEBOOK.TYPES), KC_TYPE_HEADERS, defaultTypes_());
  seedSheetIfEmpty_(getOrCreateSheet_(ss, KC_STYLEBOOK.SHOPS), KC_SHOP_HEADERS, [
    ['demo-shop-a', 'デモ加盟店A', '静岡県', '', true],
    ['demo-shop-b', 'デモ加盟店B', '静岡県', '', true],
    ['demo-shop-c', 'デモ加盟店C', '静岡県', '', true],
  ]);
  seedSheetIfEmpty_(getOrCreateSheet_(ss, KC_STYLEBOOK.STAFF), KC_STAFF_HEADERS, [
    ['demo-staff-a', 'デモ担当A', 'demo-shop-a', '', true],
    ['demo-staff-b', 'デモ担当B', 'demo-shop-b', '', true],
    ['demo-staff-c', 'デモ担当C', 'demo-shop-c', '', true],
  ]);
  seedSheetIfEmpty_(getOrCreateSheet_(ss, KC_STYLEBOOK.USERS), KC_USER_HEADERS, [
    ['demo-user-a', 'デモユーザーA', '', 'member', 'demo-shop-a', 'demo-staff-a'],
    ['demo-user-b', 'デモユーザーB', '', 'member', 'demo-shop-b', 'demo-staff-b'],
    ['demo-user-admin', 'デモ管理者', '', 'headquarters_admin', '', ''],
  ]);
}

function syncFranchiseMasterToStylebook_(ss) {
  const franchiseSheet = ss.getSheetByName(KC_STYLEBOOK.FRANCHISE_MASTER);
  if (!franchiseSheet) return;
  const franchises = rowsToObjects_(franchiseSheet);
  const usersSheet = getOrCreateSheet_(ss, KC_STYLEBOOK.USERS);
  const shopsSheet = getOrCreateSheet_(ss, KC_STYLEBOOK.SHOPS);
  franchises.forEach(franchise => {
    const visibleValue = firstDefined_(franchise['表示'], franchise.visible, franchise.isActive, true);
    if (!normalizeBoolean_(visibleValue)) return;
    const memberId = String(firstDefined_(franchise.memberId, franchise['memberId'], franchise['加盟店ID'], franchise['会員ID'])).trim();
    const userId = String(firstDefined_(franchise.userId, franchise['userId'], franchise['ユーザーID'], memberId)).trim();
    const shopId = String(firstDefined_(franchise.shopId, franchise['shopId'], franchise['店舗ID'], stylebookGeneratedShopId_(memberId || userId))).trim();
    const salonName = String(firstDefined_(franchise.salonName, franchise.shopName, franchise['店舗名'], franchise['加盟店名'], franchise.franchiseName, franchise.name)).trim();
    const staffName = String(firstDefined_(franchise.staffName, franchise.displayName, franchise.contactName, franchise['担当者名'], franchise['担当者'], franchise['代表者名'])).trim();
    const role = String(firstDefined_(franchise.role, franchise['権限'], franchise.permission, 'member')).trim() || 'member';
    if (!userId || !shopId || !salonName) return;
    upsertObject_(shopsSheet, KC_SHOP_HEADERS, {
      id: shopId,
      name: salonName,
      address: String(franchise.address || franchise['住所'] || '').trim(),
      imageUrl: String(franchise.imageUrl || franchise['店舗写真'] || '').trim(),
      isActive: true,
    }, 'id');
    upsertObject_(usersSheet, KC_USER_HEADERS, {
      id: userId,
      name: staffName || salonName,
      email: String(franchise.email || franchise['メールアドレス'] || '').trim(),
      role,
      shopId,
      staffId: String(firstDefined_(franchise.staffId, franchise['staffId'], franchise['担当者ID'])).trim(),
    }, 'id');
  });
}

function firstDefined_() {
  for (let i = 0; i < arguments.length; i += 1) {
    if (arguments[i] !== undefined && arguments[i] !== null && arguments[i] !== '') return arguments[i];
  }
  return '';
}

function stylebookGeneratedShopId_(sourceId) {
  const id = String(sourceId || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  return id ? `shop-${id}` : '';
}

function defaultTypes_() {
  return ['イヤリングカラー', 'インナーカラー', 'ハイライト', 'メッシュ', 'グラデーション', '長さ出し', 'ボリュームアップ', '前髪エクステ', 'ポイントエクステ', '原色デザイン', 'その他']
    .map((name, index) => [`type-${String(index + 1).padStart(2, '0')}`, name, true, index + 1]);
}

function canManagePost_(post, user) {
  if (!user) return false;
  return isHeadquartersAdmin_(user) || sameUserId_(postAuthorId_(post), user.id);
}

function canDeletePost_(post, user) {
  if (!user) return false;
  return isHeadquartersAdmin_(user) || sameUserId_(postAuthorId_(post), user.id);
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
  return user && ['admin', 'headquarters_admin'].includes(String(user.role || '').trim());
}

function getUser_(userId) {
  const normalizedUserId = normalizeUserId_(userId);
  if (!normalizedUserId) return null;
  return rowsToObjects_(getOrCreateSheet_(getKimikeaConnectSpreadsheet_(), KC_STYLEBOOK.USERS))
    .find(user => sameUserId_(user.id, normalizedUserId)) || null;
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
  if (KC_STYLEBOOK.SPREADSHEET_ID) {
    try {
      const fixedSpreadsheet = SpreadsheetApp.openById(KC_STYLEBOOK.SPREADSHEET_ID);
      if (fixedSpreadsheet) return fixedSpreadsheet;
    } catch (error) {
      logStylebookDebug_('open fixed spreadsheet failed', {
        spreadsheetId: KC_STYLEBOOK.SPREADSHEET_ID,
        message: error && error.message ? error.message : String(error),
      });
    }
  }
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
    extensionColors: row.extensionColors || '',
    colorCodes: row.colorCodes || '',
    colors: row.colors || '',
    colorLabels: row.colorLabels || '',
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
    isDeleted: normalizeBoolean_(row.isDeleted),
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
  if (keyIndex < 0) throw new Error(`${sheet.getName()}に${key}列が見つかりません。`);
  const expected = String(value || '').trim();
  for (let row = 1; row < values.length; row += 1) {
    if (String(values[row][keyIndex] || '').trim() === expected) {
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
    return { action: 'update', rowNumber: found.row };
  } else {
    sheet.appendRow(rowValues);
    return { action: 'append', rowNumber: sheet.getLastRow() };
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

function deleteSaveRowsForUserAndPost_(sheet, userId, postId) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;
  const headers = values[0].map(String);
  const userIndex = headers.indexOf('userId');
  const stylePostIndex = headers.indexOf('stylePostId');
  const styleIndex = headers.indexOf('styleId');
  for (let row = values.length - 1; row >= 1; row -= 1) {
    const rowUserId = userIndex >= 0 ? values[row][userIndex] : '';
    const stylePostId = stylePostIndex >= 0 ? String(values[row][stylePostIndex] || '') : '';
    const styleId = styleIndex >= 0 ? String(values[row][styleIndex] || '') : '';
    if (sameUserId_(rowUserId, userId) && (stylePostId === postId || styleId === postId)) {
      sheet.deleteRow(row + 1);
    }
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
