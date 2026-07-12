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
  POSTS: 'style_posts',
  SAVES: 'style_saves',
  COLORS: 'style_colors',
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
  'createdByUserId',
  'createdAt',
  'updatedAt',
  'saveCount',
  'status',
  'isPublished',
  'deletedAt',
  'deletedByUserId',
  'deleteReason',
];

const KC_SAVE_HEADERS = ['id', 'userId', 'stylePostId', 'createdAt'];
const KC_COLOR_HEADERS = ['id', 'colorId', 'colorCode', 'colorName', 'category', 'imageUrl', 'isActive', 'sortOrder', 'createdAt', 'updatedAt'];
const KC_TYPE_HEADERS = ['id', 'name', 'isActive', 'sortOrder'];
const KC_SHOP_HEADERS = ['id', 'name', 'address', 'imageUrl', 'isActive'];
const KC_STAFF_HEADERS = ['id', 'name', 'shopId', 'profileImageUrl', 'isActive'];
const KC_USER_HEADERS = ['id', 'name', 'email', 'role', 'shopId', 'staffId'];

function doGet(e) {
  const action = e.parameter.action || 'database';
  const userId = e.parameter.userId || 'user-member';
  if (action === 'database' || action === 'list') {
    return json_({ ok: true, database: getStylebookDatabase_(userId) });
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  setHeaders_(getOrCreateSheet_(ss, KC_STYLEBOOK.POSTS), KC_POST_HEADERS);
  setHeaders_(getOrCreateSheet_(ss, KC_STYLEBOOK.SAVES), KC_SAVE_HEADERS);
  setHeaders_(getOrCreateSheet_(ss, KC_STYLEBOOK.COLORS), KC_COLOR_HEADERS);
  setHeaders_(getOrCreateSheet_(ss, KC_STYLEBOOK.TYPES), KC_TYPE_HEADERS);
  setHeaders_(getOrCreateSheet_(ss, KC_STYLEBOOK.SHOPS), KC_SHOP_HEADERS);
  setHeaders_(getOrCreateSheet_(ss, KC_STYLEBOOK.STAFF), KC_STAFF_HEADERS);
  setHeaders_(getOrCreateSheet_(ss, KC_STYLEBOOK.USERS), KC_USER_HEADERS);
  seedMastersIfEmpty_(ss);
  getOrCreateImageFolder_();
}

function getStylebookDatabase_(userId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  setupSheetsIfNeeded_(ss);
  const posts = rowsToObjects_(getOrCreateSheet_(ss, KC_STYLEBOOK.POSTS)).map(normalizePost_);
  const saves = rowsToObjects_(getOrCreateSheet_(ss, KC_STYLEBOOK.SAVES));
  const colors = rowsToObjects_(getOrCreateSheet_(ss, KC_STYLEBOOK.COLORS)).map(normalizeBooleans_);
  const types = rowsToObjects_(getOrCreateSheet_(ss, KC_STYLEBOOK.TYPES)).map(normalizeBooleans_);
  const shops = rowsToObjects_(getOrCreateSheet_(ss, KC_STYLEBOOK.SHOPS)).map(normalizeBooleans_);
  const staff = rowsToObjects_(getOrCreateSheet_(ss, KC_STYLEBOOK.STAFF)).map(normalizeBooleans_);
  const users = rowsToObjects_(getOrCreateSheet_(ss, KC_STYLEBOOK.USERS));
  if (!users.some(user => user.id === userId) && users.length) userId = users[0].id;
  return {
    stylePosts: posts,
    savedStyles: saves,
    extensionColors: colors,
    styleTypes: types,
    shops,
    staff,
    users,
  };
}

function savePost_(post, userId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
  const image = saveImageIfNeeded_(id, post.imageUrl || post.photo || '', existing && existing.object.imageFileId);
  const additional = saveAdditionalImages_(id, post.additionalImages || [], existing && existing.object.additionalImageFileIds);
  const status = post.status === 'published' ? 'published' : 'draft';
  const row = {
    id,
    title: post.title || '',
    description: post.description || '',
    imageUrl: image.url || post.imageUrl || '',
    imageFileId: image.fileId || '',
    additionalImages: additional.urls.join('\n'),
    additionalImageFileIds: additional.fileIds.join('\n'),
    extensionColorIds: arrayString_(post.extensionColorIds),
    styleTypeIds: arrayString_(post.styleTypeIds),
    extensionCount: Number(post.extensionCount || 0),
    shopId: post.shopId || user.shopId || '',
    staffId: post.staffId || user.staffId || '',
    createdByUserId: existing ? existing.object.createdByUserId : user.id,
    createdAt: existing ? existing.object.createdAt : now,
    updatedAt: now,
    saveCount: existing ? Number(existing.object.saveCount || 0) : 0,
    status,
    isPublished: status === 'published',
    deletedAt: existing ? existing.object.deletedAt : '',
    deletedByUserId: existing ? existing.object.deletedByUserId : '',
    deleteReason: existing ? existing.object.deleteReason : '',
  };
  upsertObject_(sheet, KC_POST_HEADERS, row, 'id');
  return { ok: true, id, database: getStylebookDatabase_(user.id) };
}

function publishPost_(postId, userId) {
  const sheet = getOrCreateSheet_(SpreadsheetApp.getActiveSpreadsheet(), KC_STYLEBOOK.POSTS);
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
  const sheet = getOrCreateSheet_(SpreadsheetApp.getActiveSpreadsheet(), KC_STYLEBOOK.POSTS);
  const user = getUser_(userId);
  const found = findRowObject_(sheet, 'id', postId);
  if (!found) throw new Error('投稿が見つかりません。');
  if (!canManagePost_(found.object, user)) throw new Error('この投稿を削除する権限がありません。');
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
  const sheet = getOrCreateSheet_(SpreadsheetApp.getActiveSpreadsheet(), KC_STYLEBOOK.POSTS);
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  deleteRowsByValue_(getOrCreateSheet_(ss, KC_STYLEBOOK.POSTS), 'id', postId);
  deleteRowsByValue_(getOrCreateSheet_(ss, KC_STYLEBOOK.SAVES), 'stylePostId', postId);
  return { ok: true, id: postId };
}

function toggleSave_(postId, userId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const saveSheet = getOrCreateSheet_(ss, KC_STYLEBOOK.SAVES);
  const postSheet = getOrCreateSheet_(ss, KC_STYLEBOOK.POSTS);
  const existing = rowsToObjects_(saveSheet).find(save => save.userId === userId && save.stylePostId === postId);
  const post = findRowObject_(postSheet, 'id', postId);
  if (!post) throw new Error('投稿が見つかりません。');
  if (existing) {
    deleteRowsByValue_(saveSheet, 'id', existing.id);
    post.object.saveCount = Math.max(0, Number(post.object.saveCount || 0) - 1);
  } else {
    saveSheet.appendRow([`save-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, userId, postId, new Date().toISOString()]);
    post.object.saveCount = Number(post.object.saveCount || 0) + 1;
  }
  upsertObject_(postSheet, KC_POST_HEADERS, post.object, 'id');
  return { ok: true, id: postId };
}

function setupSheetsIfNeeded_(ss) {
  setHeaders_(getOrCreateSheet_(ss, KC_STYLEBOOK.POSTS), KC_POST_HEADERS);
  setHeaders_(getOrCreateSheet_(ss, KC_STYLEBOOK.SAVES), KC_SAVE_HEADERS);
  setHeaders_(getOrCreateSheet_(ss, KC_STYLEBOOK.COLORS), KC_COLOR_HEADERS);
  setHeaders_(getOrCreateSheet_(ss, KC_STYLEBOOK.TYPES), KC_TYPE_HEADERS);
  setHeaders_(getOrCreateSheet_(ss, KC_STYLEBOOK.SHOPS), KC_SHOP_HEADERS);
  setHeaders_(getOrCreateSheet_(ss, KC_STYLEBOOK.STAFF), KC_STAFF_HEADERS);
  setHeaders_(getOrCreateSheet_(ss, KC_STYLEBOOK.USERS), KC_USER_HEADERS);
  seedMastersIfEmpty_(ss);
}

function seedMastersIfEmpty_(ss) {
  seedSheetIfEmpty_(getOrCreateSheet_(ss, KC_STYLEBOOK.COLORS), KC_COLOR_HEADERS, defaultColors_());
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

function defaultColors_() {
  const now = new Date().toISOString();
  return [
    ['color-001', 'color-001', 'N-1', 'ナチュラルブラック', 'ダークカラー', '#171312', true, 1, now, now],
    ['color-002', 'color-002', 'N-2', 'ダークブラウン', 'ダークカラー', '#30231f', true, 2, now, now],
    ['color-003', 'color-003', 'N-3', 'ショコラブラウン', 'ダークカラー', '#4a3129', true, 3, now, now],
    ['color-004', 'color-004', 'N-4', 'モカブラウン', 'ダークカラー', '#61453a', true, 4, now, now],
    ['color-005', 'color-005', 'N-5', 'アッシュブラウン', 'ダークカラー', '#5b554e', true, 5, now, now],
    ['color-006', 'color-006', 'L-8', 'ベージュブラウン', 'ライトカラー', '#b9926d', true, 6, now, now],
    ['color-007', 'color-007', 'L-10', 'ミルクティー', 'ライトカラー', '#d8c4a8', true, 7, now, now],
    ['color-008', 'color-008', 'L-12', 'シルバーグレージュ', 'ライトカラー', '#c7c4bd', true, 8, now, now],
    ['color-009', 'color-009', 'L-14', 'ホワイトベージュ', 'ライトカラー', '#eadfca', true, 9, now, now],
    ['color-010', 'color-010', 'L-18', 'ライトグレー', 'ライトカラー', '#d2d4d6', true, 10, now, now],
    ['color-011', 'color-011', 'P-01', 'ホワイト', '原色', '#f9f8f2', true, 11, now, now],
    ['color-012', 'color-012', 'P-02', 'ピンク', '原色', '#f3a7c3', true, 12, now, now],
    ['color-013', 'color-013', 'P-03', 'チェリーピンク', '原色', '#df467c', true, 13, now, now],
    ['color-014', 'color-014', 'P-04', 'レッド', '原色', '#c92f35', true, 14, now, now],
    ['color-015', 'color-015', 'P-05', 'パープル', '原色', '#7755a6', true, 15, now, now],
    ['color-016', 'color-016', 'P-06', 'ラベンダー', '原色', '#b8a1d8', true, 16, now, now],
    ['color-017', 'color-017', 'P-07', 'ブルー', '原色', '#438ac9', true, 17, now, now],
    ['color-018', 'color-018', 'P-08', 'スカイブルー', '原色', '#8ec8df', true, 18, now, now],
  ];
}

function defaultTypes_() {
  return ['イヤリングカラー', 'インナーカラー', 'ハイライト', 'メッシュ', 'グラデーション', '長さ出し', 'ボリュームアップ', '前髪エクステ', 'ポイントエクステ', '原色デザイン', 'その他']
    .map((name, index) => [`type-${String(index + 1).padStart(2, '0')}`, name, true, index + 1]);
}

function canManagePost_(post, user) {
  if (!user) return false;
  if (isHeadquartersAdmin_(user)) return true;
  return post.createdByUserId === user.id;
}

function isHeadquartersAdmin_(user) {
  return user && user.role === 'headquarters_admin';
}

function getUser_(userId) {
  return rowsToObjects_(getOrCreateSheet_(SpreadsheetApp.getActiveSpreadsheet(), KC_STYLEBOOK.USERS)).find(user => user.id === userId) || null;
}

function normalizePost_(row) {
  return {
    id: row.id,
    title: row.title || '',
    description: row.description || '',
    imageUrl: row.imageUrl || '',
    additionalImages: splitArray_(row.additionalImages),
    extensionColorIds: splitArray_(row.extensionColorIds),
    styleTypeIds: splitArray_(row.styleTypeIds),
    extensionCount: Number(row.extensionCount || 0),
    shopId: row.shopId || '',
    staffId: row.staffId || '',
    createdByUserId: row.createdByUserId || '',
    createdAt: row.createdAt || '',
    updatedAt: row.updatedAt || '',
    saveCount: Number(row.saveCount || 0),
    status: row.status || 'draft',
    isPublished: normalizeBoolean_(row.isPublished),
    deletedAt: row.deletedAt || '',
    deletedByUserId: row.deletedByUserId || '',
    deleteReason: row.deleteReason || '',
  };
}

function normalizeBooleans_(row) {
  if ('isActive' in row) row.isActive = normalizeBoolean_(row.isActive);
  if ('sortOrder' in row) row.sortOrder = Number(row.sortOrder || 0);
  return row;
}

function normalizeBoolean_(value) {
  if (value === true) return true;
  return String(value).toUpperCase() === 'TRUE';
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

function deleteRowsByValue_(sheet, key, value) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;
  const headers = values[0].map(String);
  const keyIndex = headers.indexOf(key);
  for (let row = values.length - 1; row >= 1; row -= 1) {
    if (values[row][keyIndex] === value) sheet.deleteRow(row + 1);
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
