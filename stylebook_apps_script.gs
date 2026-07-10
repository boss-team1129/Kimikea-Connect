/**
 * Kimikea Connect Style Book backend.
 *
 * 保存先:
 * - レシピ情報: Googleスプレッドシート
 * - 施術写真: Google Drive
 *
 * 使い方:
 * 1. スプレッドシートにこのコードを貼り付ける
 * 2. setupKimikeaStylebook() を実行する
 * 3. Webアプリとしてデプロイする
 * 4. 発行URLを docs/stylebook/script.js の STYLEBOOK_API_URL に設定する
 */

const STYLEBOOK_RECIPE_SHEET = 'レシピ一覧';
const STYLEBOOK_COLOR_SHEET = 'レシピカラー詳細';
const STYLEBOOK_IMAGE_FOLDER_NAME = 'Kimikea Connect Stylebook Images';

function doGet(e) {
  const action = e.parameter.action || 'list';
  if (action === 'list') {
    return json_({ ok: true, recipes: getStylebookRecipes() });
  }
  return json_({ ok: false, message: '未対応の処理です' });
}

function doPost(e) {
  const payload = JSON.parse(e.postData.contents || '{}');
  if (payload.action === 'save') {
    return json_(saveStylebookRecipe(payload.recipe));
  }
  if (payload.action === 'delete') {
    return json_(deleteStylebookRecipe(payload.id));
  }
  return json_({ ok: false, message: '未対応の処理です' });
}

function setupKimikeaStylebook() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const recipeSheet = getOrCreateSheet_(ss, STYLEBOOK_RECIPE_SHEET);
  const colorSheet = getOrCreateSheet_(ss, STYLEBOOK_COLOR_SHEET);

  setHeaders_(recipeSheet, [
    'レシピID',
    'ステータス',
    '登録日',
    'レシピ名',
    '施術タイプ',
    'ベースの髪色',
    'ベースレベル',
    '合計本数',
    '担当サロン名',
    '担当者名',
    'コメント',
    'おすすめタグ',
    '難易度',
    '写真URL',
    '写真ファイルID',
    '投稿者ID',
    '作成日時',
    '更新日時'
  ]);

  setHeaders_(colorSheet, [
    'レシピID',
    'カラー順',
    '商品カテゴリー',
    'カラー名',
    '使用本数',
    '色見本'
  ]);

  getOrCreateImageFolder_();
}

function getStylebookRecipes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const recipeSheet = getOrCreateSheet_(ss, STYLEBOOK_RECIPE_SHEET);
  const colorSheet = getOrCreateSheet_(ss, STYLEBOOK_COLOR_SHEET);
  const recipes = rowsToObjects_(recipeSheet);
  const colors = rowsToObjects_(colorSheet);

  return recipes
    .filter(row => row['ステータス'] !== 'deleted')
    .map(row => ({
      id: row['レシピID'],
      status: row['ステータス'] || 'published',
      photo: row['写真URL'],
      photoUrl: row['写真URL'],
      photoFileId: row['写真ファイルID'],
      name: row['レシピ名'],
      treatmentType: row['施術タイプ'],
      baseColor: row['ベースの髪色'],
      baseLevel: row['ベースレベル'],
      comment: row['コメント'],
      tags: String(row['おすすめタグ'] || '').split(',').map(v => v.trim()).filter(Boolean),
      difficulty: row['難易度'],
      salon: row['担当サロン名'],
      stylist: row['担当者名'],
      ownerId: row['投稿者ID'],
      registeredAt: formatDate_(row['登録日']),
      updatedAt: row['更新日時'],
      colors: colors
        .filter(color => color['レシピID'] === row['レシピID'])
        .sort((a, b) => Number(a['カラー順']) - Number(b['カラー順']))
        .map(color => ({
          category: color['商品カテゴリー'],
          name: color['カラー名'],
          pieces: Number(color['使用本数']),
          swatch: color['色見本']
        }))
    }));
}

function saveStylebookRecipe(recipe) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const recipeSheet = getOrCreateSheet_(ss, STYLEBOOK_RECIPE_SHEET);
  const colorSheet = getOrCreateSheet_(ss, STYLEBOOK_COLOR_SHEET);
  const now = new Date();
  const id = recipe.id || `recipe-${Date.now()}`;
  const colors = recipe.colors || [];
  const totalPieces = colors.reduce((sum, color) => sum + Number(color.pieces || 0), 0);
  const imageInfo = saveRecipeImage_(id, recipe.photo, recipe.photoFileId);

  upsertRecipeRow_(recipeSheet, id, [
    id,
    recipe.status || 'draft',
    recipe.registeredAt || formatDate_(now),
    recipe.name || '',
    recipe.treatmentType || '',
    recipe.baseColor || '',
    recipe.baseLevel || '',
    totalPieces,
    recipe.salon || '',
    recipe.stylist || '',
    recipe.comment || '',
    (recipe.tags || []).join(', '),
    recipe.difficulty || '',
    imageInfo.url || recipe.photoUrl || '',
    imageInfo.fileId || recipe.photoFileId || '',
    recipe.ownerId || '',
    now,
    now
  ]);

  deleteColorRows_(colorSheet, id);
  colors.forEach((color, index) => {
    colorSheet.appendRow([
      id,
      index + 1,
      color.category || '',
      color.name || '',
      Number(color.pieces || 0),
      color.swatch || ''
    ]);
  });

  return { ok: true, id };
}

function deleteStylebookRecipe(id) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateSheet_(ss, STYLEBOOK_RECIPE_SHEET);
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const idIndex = headers.indexOf('レシピID');
  const statusIndex = headers.indexOf('ステータス');
  const updatedIndex = headers.indexOf('更新日時');

  for (let row = 1; row < values.length; row += 1) {
    if (values[row][idIndex] === id) {
      sheet.getRange(row + 1, statusIndex + 1).setValue('deleted');
      sheet.getRange(row + 1, updatedIndex + 1).setValue(new Date());
      return { ok: true, id };
    }
  }
  return { ok: false, message: 'レシピが見つかりません' };
}

function saveRecipeImage_(recipeId, dataUrl, existingFileId) {
  if (!dataUrl || !String(dataUrl).startsWith('data:image/')) {
    return existingFileId ? getFileInfo_(existingFileId) : {};
  }

  const match = String(dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return {};

  const mimeType = match[1];
  const bytes = Utilities.base64Decode(match[2]);
  const extension = mimeType.includes('png') ? 'png' : 'jpg';
  const blob = Utilities.newBlob(bytes, mimeType, `${recipeId}.${extension}`);
  const folder = getOrCreateImageFolder_();
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    fileId: file.getId(),
    url: `https://drive.google.com/uc?export=view&id=${file.getId()}`
  };
}

function getFileInfo_(fileId) {
  try {
    const file = DriveApp.getFileById(fileId);
    return {
      fileId: file.getId(),
      url: `https://drive.google.com/uc?export=view&id=${file.getId()}`
    };
  } catch (error) {
    return {};
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

  const folders = DriveApp.getFoldersByName(STYLEBOOK_IMAGE_FOLDER_NAME);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(STYLEBOOK_IMAGE_FOLDER_NAME);
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
  if (current.filter(Boolean).length === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function rowsToObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
}

function upsertRecipeRow_(sheet, id, rowValues) {
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const idIndex = headers.indexOf('レシピID');
  const createdIndex = headers.indexOf('作成日時');

  for (let row = 1; row < values.length; row += 1) {
    if (values[row][idIndex] === id) {
      const existingCreatedAt = values[row][createdIndex];
      rowValues[createdIndex] = existingCreatedAt || rowValues[createdIndex];
      sheet.getRange(row + 1, 1, 1, rowValues.length).setValues([rowValues]);
      return;
    }
  }

  sheet.appendRow(rowValues);
}

function deleteColorRows_(sheet, id) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;
  const headers = values[0];
  const idIndex = headers.indexOf('レシピID');

  for (let row = values.length - 1; row >= 1; row -= 1) {
    if (values[row][idIndex] === id) {
      sheet.deleteRow(row + 1);
    }
  }
}

function formatDate_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value);
}

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
