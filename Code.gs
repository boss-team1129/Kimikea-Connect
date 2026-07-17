/**
 * Kimikea Connect Order
 * 提携メーカー専用 カート形式注文Webアプリ
 *
 * 使い方:
 * 1. Googleスプレッドシートを作成する
 * 2. スプレッドシート名を「Kimikea Connect Order 管理表」にする
 * 3. 拡張機能 > Apps Script を開く
 * 4. このコードを Code.gs に貼り付ける
 * 5. Index.html の内容を HTML ファイル「Index」に貼り付ける
 * 6. setupKimikeaConnectOrder を実行する
 */

const KCO_CONFIG = {
  SPREADSHEET_NAME: 'Kimikea Connect Order 管理表',
  PRODUCT_MASTER: '商品マスタ',
  ORDERS: '注文一覧',
  ORDER_DETAILS: '注文詳細',
  FRANCHISE_MASTER: '加盟店マスタ',
  USER_MASTER: 'ユーザーマスタ',
  SETTINGS: '設定',
  ORDER_PREFIX: 'KCO',
  SHIPPING_FREE_BAGS: 5,
  SHIPPING_FEE: 1000,
  PAYMENT_STATUS: ['未入金', '入金済'],
  SHIPPING_STATUS: ['発送準備', '発送済', 'キャンセル'],
  SESSION_SECONDS: 21600,
};

const KCO_COST_PRICE_FRANCHISE_IDS = ['K-0', 'K-1'];

const KCO_CATEGORY_PRICES = {
  'ダークカラー': { purchasePrice: 2750, salesPrice: 3300 },
  'ライトカラー': { purchasePrice: 3190, salesPrice: 3828 },
  '原色': { purchasePrice: 3190, salesPrice: 3828 },
};

const KCO_INVOICE_ISSUER = {
  CORPORATE_NAME: 'NPO法人シールエクステ協会 Kimikea',
  POSTAL_CODE: '〒416-0944',
  ADDRESS: '静岡県富士市横割2丁目2-27',
  TEL: '0545-67-7721',
  EMAIL: 'takeshinomise@yahoo.co.jp',
};

const KCO_PRODUCT_HEADERS = [
  '商品コード',
  '商品カテゴリー',
  'カラー',
  '仕入価格',
  '販売価格',
  '在庫',
  '表示',
  '色系統',
];

const KCO_COLOR_GROUPS = [
  'ブラウン・ナチュラル',
  'ベージュ・ブロンド',
  'グレー・アッシュ',
  'ピンク・レッド',
  'パープル',
  'ブルー',
  'グリーン',
  'イエロー・オレンジ',
  'ブラック・ホワイト',
  'ミックス・特殊色',
  '未分類',
];

const KCO_ORDER_HEADERS = [
  '注文番号',
  '注文日時',
  '加盟店ID',
  '加盟店名',
  '担当者名',
  'メールアドレス',
  '合計袋数',
  '送料',
  '商品合計',
  '請求合計',
  '入金状況',
  '発送状況',
  '備考',
  '発送通知日時',
  'priceType',
  'invoiceShipping',
  'invoiceTotal',
  'shopId',
  'userId',
];

const KCO_SETTING_HEADERS = [
  '項目',
  '値',
  '説明',
  '表示',
];

const KCO_DEFAULT_SETTINGS = [
  ['管理者メール', '', '協会に届く注文通知。複数の場合はカンマ区切り', true],
  ['送信元名', 'Kimikea Connect Order', '注文・発送メールに表示する送信者名', true],
  ['加盟店メール送信', 'TRUE', '加盟店にも控えメールを送る', true],
  ['grow通知メール', '', 'Growへ送る発注通知メール。複数の場合はカンマ区切り', true],
  ['メーカー通知メール', '', '提携メーカーへ送る注文メール。複数の場合はカンマ区切り', false],
  ['振込先銀行名', '静岡銀行', '請求書に表示する銀行名', true],
  ['振込先支店名', '富士駅南支店', '請求書に表示する支店名', true],
  ['口座種別', '普通', '普通・当座など', true],
  ['口座番号', '0636210', '請求書に表示する口座番号', true],
  ['口座名義', 'トクヒ）シールエクステキョウカイキミケア', '請求書に表示する口座名義', true],
  ['支払期限日数', 3, '注文日から何日以内に振込か', true],
  ['送料', 1000, '送料無料条件未満の送料', true],
  ['送料無料条件', 5, 'この袋数以上で送料無料', true],
  ['請求書ロゴファイルID', '', 'Googleドライブに保存したKimikeaロゴのファイルID', true],
];

const KCO_FRANCHISE_HEADERS = [
  'memberId',
  'userId',
  'shopId',
  'salonName',
  'staffId',
  'displayName',
  'role',
  'email',
  'loginId',
  'phone',
  'initialPassword',
  'passwordHash',
  'postalCode',
  'address',
  'contactName',
  'membershipStatus',
  'passwordChangedAt',
  'createdAt',
  'updatedAt',
];
const KCO_USER_HEADERS = [
  'userId',
  'shopId',
  'staffName',
  'role',
  'passwordHash',
  'lastLogin',
  'createdAt',
];
const KCO_DEFAULT_INITIAL_PASSWORD = '0000';

const KCO_DETAIL_HEADERS = [
  '注文番号',
  '商品カテゴリー',
  'カラー',
  '数量',
  '単価',
  '小計',
  '仕入単価',
  '利益',
  '商品コード',
  '商品名',
  'priceType',
  'invoiceUnitPrice',
  'lineTotal',
];

function doGet(event) {
  if (event && event.parameter && event.parameter.api) {
    return handleJsonpApi_(event);
  }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Kimikea Connect')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function handleJsonpApi_(event) {
  const callback = String(event.parameter.callback || '').trim();
  const apiName = String(event.parameter.api || '').trim();
  logOrderDebug_('JSONP request received', {
    apiName,
    hasArgs: Boolean(event.parameter.args),
    callback,
  });
  if (!/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: 'Invalid callback.' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const allowedApi = {
    getAppAppearance,
    loginFranchise,
    completeInitialPasswordSetup,
    getPublicProducts,
    getPublicColorRankings,
    getPortalData,
    updateMemberEmail,
    changeMemberEmail,
    updateMyProfile,
    changeMemberPassword,
    submitCartOrder,
    getInvoicePdfData,
    logoutFranchise,
    resetMemberPasswordToInitial,
  };

  let payload;
  try {
    if (!allowedApi[apiName]) {
      throw new Error('利用できないAPIです。');
    }
    const args = event.parameter.args ? JSON.parse(event.parameter.args) : [];
    if (!Array.isArray(args)) {
      throw new Error('API引数の形式が正しくありません。');
    }
    payload = { ok: true, data: allowedApi[apiName].apply(null, args) };
  } catch (error) {
    logOrderDebug_('JSONP request failed', {
      apiName,
      error: error && error.message ? error.message : String(error),
    });
    payload = { ok: false, error: error && error.message ? error.message : String(error) };
  }

  return ContentService
    .createTextOutput(`${callback}(${JSON.stringify(payload)});`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function getAppAppearance() {
  const result = {
    appName: 'Kimikea Connect',
    shortName: 'Kimikea Connect',
    themeColor: '#111111',
    backgroundColor: '#FAF8F2',
    iconDataUrl: '',
    iconContentType: 'image/png',
  };
  try {
    const settings = getInvoiceSettings_(SpreadsheetApp.getActiveSpreadsheet());
    if (!settings.logoFileId) return result;
    const blob = getInvoiceLogoBlob_(settings.logoFileId);
    result.iconContentType = blob.getContentType() || 'image/png';
    result.iconDataUrl = `data:${blob.getContentType()};base64,${Utilities.base64Encode(blob.getBytes())}`;
  } catch (error) {
    // ロゴ未設定・読込不可でもアプリ本体は表示する。
  }
  return result;
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Kimikea Connect')
    .addItem('初期設定・管理シート作成', 'setupKimikeaConnectOrder')
    .addItem('請求書PDFの権限を取得', 'authorizeDocumentApp')
    .addItem('Grow通知テストメール送信', 'testSendGrowMail')
    .addItem('表示商品を再取得テスト', 'showProductCount_')
    .addToUi();
}

function authorizeDocumentApp() {
  const doc = DocumentApp.create('Kimikea Connect 認証テスト');
  DriveApp.getFileById(doc.getId()).setTrashed(true);
}

function setupKimikeaConnectOrder() {
  const startedAt = Date.now();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const summary = {
    createdUserCount: 0,
    updatedUserCount: 0,
    skippedUserCount: 0,
  };

  try {
    logSetupStep_('setup started', {
      spreadsheetId: ss.getId(),
      spreadsheetName: ss.getName(),
    });

    runSetupStep_('rename spreadsheet', () => {
      if (ss.getName() !== KCO_CONFIG.SPREADSHEET_NAME) {
        ss.rename(KCO_CONFIG.SPREADSHEET_NAME);
      }
      return { spreadsheetName: ss.getName() };
    });

    runSetupStep_('product master', () => setupProductMaster_(ss));
    runSetupStep_('franchise master', () => setupFranchiseMaster_(ss));
    runSetupStep_('franchise identity backfill', () => backfillFranchiseIdentityColumns_(ss));
    runSetupStep_('user master', () => setupUserMaster_(ss));
    const userSyncSummary = runSetupStep_('sync franchise users to user master', () => syncFranchiseUsersToUserMaster_(ss)) || {};
    summary.createdUserCount = Number(userSyncSummary.createdUserCount || 0);
    summary.updatedUserCount = Number(userSyncSummary.updatedUserCount || 0);
    summary.skippedUserCount = Number(userSyncSummary.skippedUserCount || 0);
    runSetupStep_('orders', () => setupOrders_(ss));
    runSetupStep_('order details', () => setupOrderDetails_(ss));
    runSetupStep_('settings', () => setupSettings_(ss));
    runSetupStep_('shipment trigger', () => ensureShipmentEditTrigger_(ss));

    logSetupStep_('setup completed', {
      createdUserCount: summary.createdUserCount,
      updatedUserCount: summary.updatedUserCount,
      skippedUserCount: summary.skippedUserCount,
      durationMs: Date.now() - startedAt,
    });

    SpreadsheetApp.getUi().alert('Kimikea Connect Order 管理表の土台を作成しました。');
  } catch (error) {
    logSetupStep_('setup failed', {
      message: error && error.message ? error.message : String(error),
      stack: error && error.stack ? error.stack : '',
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}

function runSetupStep_(label, callback) {
  const startedAt = Date.now();
  logSetupStep_(`${label} start`, {});
  try {
    const result = callback();
    logSetupStep_(`${label} completed`, {
      durationMs: Date.now() - startedAt,
      result: result || '',
    });
    return result;
  } catch (error) {
    logSetupStep_(`${label} failed`, {
      durationMs: Date.now() - startedAt,
      message: error && error.message ? error.message : String(error),
      stack: error && error.stack ? error.stack : '',
    });
    throw error;
  }
}

function logSetupStep_(label, data) {
  logOrderDebug_(`setup ${label}`, data || {});
}

function getPublicOrderSettings(sessionToken) {
  getSessionFranchise_(sessionToken);
  const rules = getOrderRules_(SpreadsheetApp.getActiveSpreadsheet());
  return {
    shippingFee: rules.shippingFee,
    freeShippingBags: rules.freeShippingBags,
  };
}

function loginFranchise(credentials) {
  const loginId = normalizeLoginIdentifier_(pickFirstDefined_(
    credentials && credentials.loginId,
    credentials && credentials.memberId,
    credentials && credentials.email,
    credentials && credentials.loginEmail,
    credentials && credentials.franchiseId
  ));
  const password = normalizeLoginPassword_(pickFirstDefined_(
    credentials && credentials.password,
    credentials && credentials.loginPassword
  ));
  logOrderDebug_('loginFranchise received', {
    receivedLoginId: loginId,
    receivedPasswordLength: password.length,
    receivedPasswordNormalized: password,
  });
  if (!loginId || !password) {
    logOrderDebug_('loginFranchise failed', {
      reason: 'missing_login_id_or_password',
      receivedLoginId: loginId,
      receivedPasswordLength: password.length,
    });
    throw new Error('会員IDまたはメールアドレスとパスワードを入力してください。');
  }

  const franchises = getFranchiseMasterRecords_();
  logOrderDebug_('loginFranchise franchise records loaded', {
    searchedFranchiseCount: franchises.length,
    loginId,
    candidates: franchises.map((item) => ({
      rowNumber: item.rowNumber,
      franchiseId: item.franchiseId,
      franchiseName: item.franchiseName,
      email: normalizeEmail_(item.email),
      loginId: normalizeLoginIdentifier_(item.loginId || ''),
      visible: item.visible,
      membershipStatus: item.membershipStatus,
      hasPasswordHash: Boolean(item.passwordHash),
      initialPassword: item.initialPassword,
    })),
  });
  const franchise = franchises.find((item) => (
    item.visible
    && isMatchingFranchiseLoginId_(item, loginId)
  ));
  const passwordResult = franchise ? getFranchisePasswordCheckResult_(franchise, password) : {
    ok: false,
    reason: 'no_matching_user',
  };
  logOrderDebug_('loginFranchise match result', {
    loginId,
    matchedUser: franchise ? {
      rowNumber: franchise.rowNumber,
      franchiseId: franchise.franchiseId,
      franchiseName: franchise.franchiseName,
      email: normalizeEmail_(franchise.email),
      loginId: normalizeLoginIdentifier_(franchise.loginId || ''),
      visible: franchise.visible,
      membershipStatus: franchise.membershipStatus,
    } : null,
    passwordComparison: passwordResult,
  });
  if (!franchise || !passwordResult.ok) {
    logOrderDebug_('loginFranchise failed', {
      reason: franchise ? passwordResult.reason : 'no_matching_user',
      loginId,
    });
    throw new Error('会員IDまたはメールアドレス、またはパスワードが正しくありません。');
  }

  const sessionToken = Utilities.getUuid();
  CacheService.getScriptCache().put(
    createSessionKey_(sessionToken),
    JSON.stringify({
      franchiseId: franchise.franchiseId,
      userId: franchise.userId,
      shopId: franchise.shopId,
      loginId: franchise.loginId || franchise.email || '',
      role: franchise.role || 'member',
      passwordChangeRequired: false,
    }),
    KCO_CONFIG.SESSION_SECONDS
  );
  updateUserMasterLastLogin_(franchise.userId);
  return {
    sessionToken,
    franchise: sanitizeFranchise_(franchise),
    passwordChangeRequired: false,
  };
}

function completeInitialPasswordSetup(sessionToken, newPassword, confirmPassword) {
  const franchise = getSessionFranchise_(sessionToken, { allowPasswordChange: true });
  validateNewPassword_(newPassword, confirmPassword);
  updateFranchisePassword_(franchise.franchiseId, newPassword);
  CacheService.getScriptCache().put(
    createSessionKey_(sessionToken),
    JSON.stringify({
      franchiseId: franchise.franchiseId,
      userId: franchise.userId,
      shopId: franchise.shopId,
      loginId: franchise.loginId || franchise.email || '',
      role: franchise.role || 'member',
      passwordChangeRequired: false,
    }),
    KCO_CONFIG.SESSION_SECONDS
  );
  return {
    franchise: sanitizeFranchise_(findFranchiseById_(franchise.franchiseId)),
    passwordChangeRequired: false,
  };
}

function updateMemberEmail(sessionToken, newEmail) {
  const franchise = getSessionFranchise_(sessionToken);
  const email = normalizeEmail_(newEmail);
  if (!email || email.indexOf('@') === -1) {
    throw new Error('正しいメールアドレスを入力してください。');
  }

  const duplicate = getFranchiseMasterRecords_().find((item) => (
    item.franchiseId !== franchise.franchiseId
    && item.visible
    && (
      normalizeEmail_(item.email) === email
      || normalizeLoginIdentifier_(item.loginId || '') === email
    )
  ));
  if (duplicate) {
    throw new Error('このメールアドレスはすでに登録されています。');
  }

  const sheet = getSheet_(KCO_CONFIG.FRANCHISE_MASTER);
  ensureFranchiseMasterColumns_(sheet);
  const indexes = getFranchiseMasterColumnIndexes_(sheet);
  sheet.getRange(franchise.rowNumber, indexes.email + 1).setValue(email);
  if (indexes.loginId !== -1) sheet.getRange(franchise.rowNumber, indexes.loginId + 1).setValue(email);
  if (indexes.updatedAt !== -1) sheet.getRange(franchise.rowNumber, indexes.updatedAt + 1).setValue(new Date());
  return sanitizeFranchise_(findFranchiseById_(franchise.franchiseId));
}

function changeMemberEmail(sessionToken, currentPassword, newEmail, confirmEmail) {
  const franchise = getSessionFranchise_(sessionToken);
  const current = normalizeLoginPassword_(currentPassword);
  if (!isValidFranchisePassword_(franchise, current)) {
    throw new Error('現在のパスワードが正しくありません。');
  }
  const email = normalizeEmail_(newEmail);
  const confirm = normalizeEmail_(confirmEmail);
  if (!email || email.indexOf('@') === -1) {
    throw new Error('正しいメールアドレスを入力してください。');
  }
  if (email !== confirm) {
    throw new Error('新しいメールアドレスと確認用メールアドレスが一致しません。');
  }

  const duplicate = getFranchiseMasterRecords_().find((item) => (
    item.franchiseId !== franchise.franchiseId
    && item.visible
    && (
      normalizeEmail_(item.email) === email
      || normalizeLoginIdentifier_(item.loginId || '') === email
    )
  ));
  if (duplicate) {
    throw new Error('このメールアドレスはすでに登録されています。');
  }

  const sheet = getSheet_(KCO_CONFIG.FRANCHISE_MASTER);
  ensureFranchiseMasterColumns_(sheet);
  const indexes = getFranchiseMasterColumnIndexes_(sheet);
  sheet.getRange(franchise.rowNumber, indexes.email + 1).setValue(email);
  if (indexes.loginId !== -1) sheet.getRange(franchise.rowNumber, indexes.loginId + 1).setValue(email);
  if (indexes.updatedAt !== -1) sheet.getRange(franchise.rowNumber, indexes.updatedAt + 1).setValue(new Date());
  CacheService.getScriptCache().remove(createSessionKey_(sessionToken));
  return sanitizeFranchise_(findFranchiseById_(franchise.franchiseId));
}

function updateMyProfile(sessionToken, profile) {
  const franchise = getSessionFranchise_(sessionToken);
  const sheet = getSheet_(KCO_CONFIG.FRANCHISE_MASTER);
  ensureFranchiseMasterColumns_(sheet);
  const headers = sheet
    .getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1))
    .getValues()[0]
    .map(normalizeMasterHeader_);
  const indexFor = (candidates) => findMasterHeaderIndex_(headers, candidates);
  const salonNameIndex = indexFor(['salonName', '加盟店名', 'サロン名']);
  const contactNameIndex = indexFor(['contactName', '担当者名']);
  const displayNameIndex = indexFor(['displayName', '表示名']);
  const phoneIndex = indexFor(['phone', '電話番号']);
  const updatedAtIndex = indexFor(['updatedAt', '更新日']);

  const salonName = String(profile && profile.salonName || '').trim();
  const contactName = String(profile && profile.contactName || '').trim();
  const phone = String(profile && profile.phone || '').trim();

  if (salonNameIndex !== -1) sheet.getRange(franchise.rowNumber, salonNameIndex + 1).setValue(salonName);
  if (contactNameIndex !== -1) sheet.getRange(franchise.rowNumber, contactNameIndex + 1).setValue(contactName);
  if (displayNameIndex !== -1) sheet.getRange(franchise.rowNumber, displayNameIndex + 1).setValue(contactName || salonName);
  if (phoneIndex !== -1) sheet.getRange(franchise.rowNumber, phoneIndex + 1).setValue(phone);
  if (updatedAtIndex !== -1) sheet.getRange(franchise.rowNumber, updatedAtIndex + 1).setValue(new Date());

  return sanitizeFranchise_(findFranchiseById_(franchise.franchiseId));
}

function changeMemberPassword(sessionToken, currentPassword, newPassword, confirmPassword) {
  const franchise = getSessionFranchise_(sessionToken);
  const current = normalizeLoginPassword_(currentPassword);
  if (!isValidFranchisePassword_(franchise, current)) {
    throw new Error('現在のパスワードが正しくありません。');
  }
  validateNewPassword_(newPassword, confirmPassword);
  updateFranchisePassword_(franchise.franchiseId, newPassword);
  return true;
}

function resetMemberPasswordToInitial(sessionToken, targetMemberId) {
  const admin = getSessionFranchise_(sessionToken);
  if (!isHeadquartersAdmin_(admin)) {
    throw new Error('本部管理者のみパスワードをリセットできます。');
  }
  resetFranchisePasswordToInitial_(targetMemberId);
  return true;
}

function logoutFranchise(sessionToken) {
  if (sessionToken) {
    CacheService.getScriptCache().remove(createSessionKey_(sessionToken));
  }
  return true;
}

function getPortalData(sessionToken) {
  const franchise = getSessionFranchise_(sessionToken);
  const rules = getOrderRules_(SpreadsheetApp.getActiveSpreadsheet());
  const orders = getFranchiseOrders_(franchise.franchiseId);
  return {
    franchise: sanitizeFranchise_(franchise),
    products: getClientProducts_(),
    orderSettings: {
      shippingFee: rules.shippingFee,
      freeShippingBags: rules.freeShippingBags,
    },
    orders,
    myPage: {
      userId: franchise.userId,
      shopId: franchise.shopId,
      role: franchise.role || 'member',
      orderSummary: buildMyPageOrderSummary_(orders),
      invoices: buildMyPageInvoiceSummaries_(orders),
    },
  };
}

function getPublicProducts() {
  return getClientProducts_();
}

function getPublicColorRankings(year, month) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const period = getRankingPeriod_(year, month);
  const periodStart = period.start;
  const periodEnd = period.end;
  const colorProducts = getVisibleProducts_().filter((product) => (
    KCO_CATEGORY_PRICES[product.category] && product.productCode
  ));
  const colorProductCodes = {};
  colorProducts.forEach((product) => {
    colorProductCodes[createProductCodeKey_(product.productCode)] = true;
  });

  const ordersSheet = ss.getSheetByName(KCO_CONFIG.ORDERS);
  const detailsSheet = ss.getSheetByName(KCO_CONFIG.ORDER_DETAILS);
  const purchaseCounts = {};
  let countedOrders = 0;
  let countedLines = 0;
  let excludedTestOrDeletedOrders = 0;
  let excludedOtherLines = 0;
  const debugOrders = [];
  const debugLines = [];
  const debugDetailMisses = [];
  let orderHeaders = [];
  let detailHeaders = [];
  const searchedOrderIds = [];

  if (ordersSheet && detailsSheet && ordersSheet.getLastRow() > 1 && detailsSheet.getLastRow() > 1) {
    const orderValues = ordersSheet.getDataRange().getValues();
    orderHeaders = orderValues[0].map(String);
    const orderIndex = createIndex_(orderHeaders);
    const validOrderNos = {};
    orderValues.slice(1).forEach((row) => {
      const orderNo = String(getRowValueByHeader_(row, orderIndex, ['注文番号', 'orderId', 'orderNo', '注文ID']) || '').trim();
      const rawOrderDate = getRowValueByHeader_(row, orderIndex, ['注文日時', '注文日', 'orderDate', 'createdAt', '作成日', '登録日']);
      const orderDate = parseDateValue_(rawOrderDate);
      const status = [
        getRowValueByHeader_(row, orderIndex, ['発送状況', 'shippingStatus']),
        getRowValueByHeader_(row, orderIndex, ['入金状況', 'paymentStatus']),
        getRowValueByHeader_(row, orderIndex, ['ステータス', 'status', '注文ステータス']),
        getRowValueByHeader_(row, orderIndex, ['削除', '削除済み', 'deletedAt', 'isDeleted']),
        getRowValueByHeader_(row, orderIndex, ['テスト', 'test', 'isTest']),
      ].map((value) => String(value || '').trim()).join(' ');
      const inPeriod = Boolean(orderDate && orderDate >= periodStart && orderDate <= periodEnd);
      const excluded = isExcludedRankingOrder_(orderNo, status);
      debugOrders.push({
        orderNo,
        rawDate: String(rawOrderDate || ''),
        parsedDate: orderDate ? Utilities.formatDate(orderDate, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss') : '',
        status,
        inPeriod,
        excluded,
      });
      if (!orderNo || !orderDate || !inPeriod) return;
      if (excluded) {
        excludedTestOrDeletedOrders += 1;
        return;
      }
      validOrderNos[orderNo] = true;
      searchedOrderIds.push(orderNo);
      countedOrders += 1;
    });

    const detailValues = detailsSheet.getDataRange().getValues();
    detailHeaders = detailValues[0].map(String);
    const detailIndex = createIndex_(detailHeaders);
    const detailMatchCounts = {};
    detailValues.slice(1).forEach((row) => {
      const orderNo = String(getRowValueByHeader_(row, detailIndex, ['注文番号', 'orderId', 'orderNo', '注文ID']) || '').trim();
      if (!validOrderNos[orderNo]) return;
      detailMatchCounts[orderNo] = Number(detailMatchCounts[orderNo] || 0) + 1;
      const rawProductCode = getRowValueByHeader_(row, detailIndex, ['商品コード', 'productCode', 'カラーID', 'colorId']);
      const rawColorName = getRowValueByHeader_(row, detailIndex, ['カラー', 'カラー名', 'color', 'colorName']);
      const rawProductName = getRowValueByHeader_(row, detailIndex, ['商品名', 'productName']);
      const productCode = resolveRankingProductCode_(rawProductCode, rawColorName, rawProductName, colorProducts);
      if (!productCode || !colorProductCodes[createProductCodeKey_(productCode)]) {
        excludedOtherLines += 1;
        debugDetailMisses.push({
          orderNo,
          reason: productCode ? 'not_color_product' : 'missing_product_code',
          rawProductCode: String(rawProductCode || ''),
          productCode: String(productCode || ''),
          productName: String(rawProductName || ''),
          colorName: String(rawColorName || ''),
        });
        return;
      }
      const quantity = Number(getRowValueByHeader_(row, detailIndex, ['数量', 'quantity', '袋数']) || 0);
      if (quantity <= 0) return;
      const countKey = normalizeRankingProductCode_(productCode);
      purchaseCounts[countKey] = Number(purchaseCounts[countKey] || 0) + quantity;
      countedLines += 1;
      debugLines.push({
        orderNo,
        productCode: countKey,
        productName: String(rawProductName || ''),
        colorName: String(rawColorName || ''),
        quantity,
      });
    });
    searchedOrderIds.forEach((orderNo) => {
      if (!detailMatchCounts[orderNo]) {
        debugDetailMisses.push({
          orderNo,
          reason: 'no_detail_rows_for_order_id',
          searchedOrderId: orderNo,
        });
      }
    });
  }

  const debugSummary = {
    totalOrders: ordersSheet ? Math.max(0, ordersSheet.getLastRow() - 1) : 0,
    countedOrders,
    countedLines,
    periodLabel: `${period.year}年${period.month}月`,
    orderSheetName: ordersSheet ? ordersSheet.getName() : '',
    detailSheetName: detailsSheet ? detailsSheet.getName() : '',
    orderHeaders,
    detailHeaders,
    searchedOrderIds,
    matchedDetailCount: countedLines,
    orders: debugOrders.slice(0, 80),
    lines: debugLines.slice(0, 120),
    detailMisses: debugDetailMisses.slice(0, 120),
    purchaseCounts,
    excludedTestOrDeletedOrders,
    excludedOtherLines,
  };
  logOrderDebug_('public color ranking summary', debugSummary);

  return {
    periodStart: Utilities.formatDate(periodStart, Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm'),
    periodEnd: Utilities.formatDate(periodEnd, Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm'),
    periodLabel: `${period.year}年${period.month}月`,
    year: period.year,
    month: period.month,
    purchaseCounts,
    countedOrders,
    countedLines,
    excludedTestOrDeletedOrders,
    excludedOtherLines,
    debug: debugSummary,
  };
}

function getRankingPeriod_(year, month) {
  const timeZone = 'Asia/Tokyo';
  const now = new Date();
  const currentYear = Number(Utilities.formatDate(now, timeZone, 'yyyy'));
  const currentMonth = Number(Utilities.formatDate(now, timeZone, 'M'));
  const targetYear = Number(year || currentYear);
  const targetMonth = Number(month || currentMonth);
  if (!targetYear || targetYear < 2000 || targetYear > 2100 || targetMonth < 1 || targetMonth > 12) {
    throw new Error('ランキング集計年月が正しくありません。');
  }

  const start = new Date(`${targetYear}-${String(targetMonth).padStart(2, '0')}-01T00:00:00+09:00`);
  const nextYear = targetMonth === 12 ? targetYear + 1 : targetYear;
  const nextMonth = targetMonth === 12 ? 1 : targetMonth + 1;
  const nextStart = new Date(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00+09:00`);
  const end = new Date(nextStart.getTime() - 1);
  return {
    year: targetYear,
    month: targetMonth,
    start,
    end,
  };
}

function parseDateValue_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') {
    const seconds = value.seconds || value._seconds;
    if (seconds) {
      const timestamp = new Date(Number(seconds) * 1000 + Number(value.nanoseconds || value._nanoseconds || 0) / 1000000);
      return isNaN(timestamp.getTime()) ? null : timestamp;
    }
  }
  if (typeof value === 'number') {
    if (value > 100000000000) return new Date(value);
    if (value > 1000000000) return new Date(value * 1000);
    if (value > 20000 && value < 100000) {
      return new Date(Math.round((value - 25569) * 86400 * 1000));
    }
  }
  const text = String(value || '').normalize('NFKC').trim();
  if (!text) return null;
  const japaneseMatch = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s*(\d{1,2})[:時](\d{1,2})?)?/);
  if (japaneseMatch) {
    const y = Number(japaneseMatch[1]);
    const m = Number(japaneseMatch[2]);
    const d = Number(japaneseMatch[3]);
    const hh = Number(japaneseMatch[4] || 0);
    const mm = Number(japaneseMatch[5] || 0);
    return new Date(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`);
  }
  const normalized = text
    .replace(/\./g, '/')
    .replace(/-/g, '/')
    .replace(/\s+/, ' ');
  const slashMatch = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (slashMatch) {
    const y = Number(slashMatch[1]);
    const m = Number(slashMatch[2]);
    const d = Number(slashMatch[3]);
    const hh = Number(slashMatch[4] || 0);
    const mm = Number(slashMatch[5] || 0);
    const ss = Number(slashMatch[6] || 0);
    return new Date(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}+09:00`);
  }
  const parsed = new Date(text);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function isExcludedRankingOrder_(orderNo, statusText) {
  const text = `${orderNo || ''} ${statusText || ''}`.normalize('NFKC').toLowerCase();
  return /test|テスト|削除|deleted|removed/.test(text);
}

function resolveRankingProductCode_(productCode, colorName, productName, colorProducts) {
  const direct = String(productCode || '').trim();
  if (direct) return direct;
  const candidates = [colorName, productName]
    .map((value) => normalize_(value))
    .filter(Boolean);
  if (!candidates.length) return '';
  const match = colorProducts.find((product) => {
    const keys = [
      product.color,
      product.colorName,
      product.productName,
      `${product.category} ${product.color}`,
      `${product.category}${product.color}`,
    ].map((value) => normalize_(value));
    return candidates.some((candidate) => keys.includes(candidate));
  });
  return match ? match.productCode : '';
}

function normalizeRankingProductCode_(productCode) {
  return String(productCode || '').normalize('NFKC').trim().replace(/\s+/g, '').toUpperCase();
}

function getVisibleProducts(sessionToken) {
  getSessionFranchise_(sessionToken);
  return getClientProducts_();
}

function getClientProducts_() {
  return getVisibleProducts_().map((product) => ({
    productCode: product.productCode,
    category: product.category,
    color: product.color,
    colorCode: product.colorCode,
    colorName: product.colorName,
    colorGroup: product.colorGroup,
    swatchImageUrl: product.swatchImageUrl,
    salesPrice: product.salesPrice,
    sortOrder: product.sortOrder,
    visible: true,
  }));
}

function getVisibleProducts_() {
  const sheet = getSheet_(KCO_CONFIG.PRODUCT_MASTER);
  ensureProductMasterColumns_(sheet);
  fillMissingProductCodes_(sheet);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  const headers = values[0];
  const index = createIndex_(headers);

  return values.slice(1)
    .map((row, rowIndex) => ({ row, rowIndex }))
    .filter(({ row }) => isVisible_(row[index['表示']]))
    .map(({ row, rowIndex }) => ({
      productCode: String(row[index['商品コード']] || '').trim(),
      category: String(row[index['商品カテゴリー']] || ''),
      color: String(row[index['カラー']] || ''),
      colorCode: String(row[index['カラー']] || '').trim(),
      colorName: String(getRowValueByHeader_(row, index, ['カラー名', '色名']) || '').trim(),
      colorGroup: String(row[index['色系統']] || '').trim() || '未分類',
      swatchImageUrl: String(getRowValueByHeader_(row, index, ['色見本画像URL', '画像URL', 'imageUrl']) || '').trim(),
      purchasePrice: Number(row[index['仕入価格']] || 0),
      salesPrice: Number(row[index['販売価格']] || 0),
      stock: row[index['在庫']],
      sortOrder: rowIndex + 1,
    }))
    .filter((product) => product.productCode && product.category && product.color && product.salesPrice > 0);
}

function getProductCategories(sessionToken) {
  getSessionFranchise_(sessionToken);
  const products = getVisibleProducts_();
  const categories = [];
  products.forEach((product) => {
    if (categories.indexOf(product.category) === -1) {
      categories.push(product.category);
    }
  });
  return categories;
}

function submitCartOrder(order) {
  validateOrder_(order);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ordersSheet = ss.getSheetByName(KCO_CONFIG.ORDERS);
  const detailsSheet = ss.getSheetByName(KCO_CONFIG.ORDER_DETAILS);
  ensureOrderHeaders_(ordersSheet);
  ensureOrderDetailHeaders_(detailsSheet);
  const productMap = getProductMap_();
  const franchise = getSessionFranchise_(order.sessionToken);
  const invoiceSettings = getInvoiceSettings_(ss);
  const orderRules = getOrderRules_(ss);
  validateInvoiceSettings_(invoiceSettings);

  const now = new Date();
  const orderNo = createOrderNumber_(now, ordersSheet.getLastRow());
  const priceType = getInvoicePriceType_(franchise.franchiseId);
  let totalBags = 0;
  let productTotal = 0;
  const detailRows = [];
  const detailItems = [];

  order.items.forEach((item) => {
    const key = item.productCode ? createProductCodeKey_(item.productCode) : createProductKey_(item.category, item.color);
    const product = productMap[key];
    if (!product) {
      throw new Error(`商品マスタに見つかりません: ${item.category || ''} / ${item.color || ''}`);
    }

    const qty = Number(item.quantity || 0);
    if (qty <= 0) return;

    const invoiceUnitPrice = getInvoiceUnitPrice_(product, priceType);
    const subtotal = invoiceUnitPrice * qty;
    const profit = (invoiceUnitPrice - product.purchasePrice) * qty;
    totalBags += qty;
    productTotal += subtotal;

    detailRows.push([
      orderNo,
      product.category,
      product.color,
      qty,
      invoiceUnitPrice,
      subtotal,
      product.purchasePrice,
      profit,
      product.productCode,
      `${product.category} ${product.color}`,
      priceType,
      invoiceUnitPrice,
      subtotal,
    ]);

    detailItems.push({
      orderNo,
      productCode: product.productCode,
      productName: `${product.category} ${product.color}`,
      category: product.category,
      color: product.color,
      colorName: product.colorName || product.color,
      quantity: qty,
      unitPrice: invoiceUnitPrice,
      invoiceUnitPrice,
      lineTotal: subtotal,
      subtotal,
      purchasePrice: product.purchasePrice,
      salesPrice: product.salesPrice,
      priceType,
      profit,
    });
  });

  if (detailRows.length === 0) {
    throw new Error('注文商品がありません。');
  }

  const shippingFee = totalBags >= orderRules.freeShippingBags ? 0 : orderRules.shippingFee;
  const invoiceTotal = productTotal + shippingFee;

  ordersSheet.appendRow([
    orderNo,
    now,
    franchise.franchiseId,
    franchise.franchiseName,
    franchise.contactName,
    franchise.email,
    totalBags,
    shippingFee,
    productTotal,
    invoiceTotal,
    '',
    '発送準備',
    order.note || '',
    '',
    priceType,
    shippingFee,
    invoiceTotal,
    franchise.shopId,
    franchise.userId,
  ]);

  detailsSheet
    .getRange(detailsSheet.getLastRow() + 1, 1, detailRows.length, KCO_DETAIL_HEADERS.length)
    .setValues(detailRows);

  formatOrderSheets_(ss);

  sendOrderNotificationEmails_(ss, {
    orderNo,
    orderDate: now,
    franchiseId: franchise.franchiseId,
    franchiseName: franchise.franchiseName,
    contactName: franchise.contactName,
    franchiseEmail: franchise.email,
    franchisePhone: franchise.phone,
    franchiseAddress: franchise.fullAddress || [franchise.postalCode, franchise.address].filter(Boolean).join(' ') || franchise.address,
    note: order.note || '',
    details: detailRows,
    detailItems,
    totalBags,
    shippingFee,
    invoiceShipping: shippingFee,
    productTotal,
    invoiceTotal,
    priceType,
  }, invoiceSettings, orderRules);

  return {
    orderNo,
    totalBags,
    shippingFee,
    productTotal,
    invoiceTotal,
    freeShippingMessage: shippingFee === 0
      ? '送料無料です'
      : `あと${orderRules.freeShippingBags - totalBags}袋で送料無料です`,
  };
}

function setupProductMaster_(ss) {
  const sheet = getOrCreateSheet_(ss, KCO_CONFIG.PRODUCT_MASTER);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, KCO_PRODUCT_HEADERS.length).setValues([KCO_PRODUCT_HEADERS]);

    const rows = [
      ...createProductRows_('ダークカラー', ['1', 'NB', '2', '2GB', '3', '3R', '3RB', '4', '4GB', '4R', '4RB', '5', '50R', '5RB', '6', '6M', '7', '6A', 'YB', '8', '9', '10', '13', '15M']),
      ...createProductRows_('ライトカラー', ['12', 'SilverAsh', 'MilkTeaAsh', 'LightGryay', 'GYD', 'LightBeige', 'DSA', '7A', '613', 'DPK', '101', '33R', '30R', '100', '27', '28']),
      ...createProductRows_('原色', ['VW', 'WHITE', 'VN', 'SkyBLUE', 'SB', 'RED', 'PURPLE', 'PINK', 'PEACH', 'PaleSILVER', 'PalePURPLE', 'PalePINK', 'PaleBULUE', 'Orange', 'NAVYBLUE', 'NAVY', 'MASTARD', 'LavenderGray', 'LavenderAsh', 'LAVENDER', 'HP', 'GREEN', 'FS', 'EF']),
    ];
    sheet.getRange(2, 1, rows.length, KCO_PRODUCT_HEADERS.length).setValues(rows);
    sheet.getRange(2, 4, rows.length, 2).setNumberFormat('¥#,##0');
  } else {
    ensureProductMasterColumns_(sheet);
    fillMissingProductCodes_(sheet);
  }
  applyProductMasterDropdowns_(sheet);
  applyHeaderStyle_(sheet, KCO_PRODUCT_HEADERS.length);
  sheet.autoResizeColumns(1, KCO_PRODUCT_HEADERS.length);
}

function createProductRows_(category, colors) {
  const price = KCO_CATEGORY_PRICES[category];
  return colors.map((color, index) => [
    createDefaultProductCode_(category, index + 1),
    category,
    color,
    price.purchasePrice,
    price.salesPrice,
    100,
    true,
    '',
  ]);
}

function ensureProductMasterColumns_(sheet) {
  const existingHeaders = sheet
    .getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1))
    .getValues()[0]
    .map(normalizeMasterHeader_);

  KCO_PRODUCT_HEADERS.forEach((header) => {
    if (existingHeaders.indexOf(normalizeMasterHeader_(header)) !== -1) return;
    sheet.insertColumnAfter(sheet.getLastColumn());
    sheet.getRange(1, sheet.getLastColumn()).setValue(header);
    existingHeaders.push(normalizeMasterHeader_(header));
  });
  applyProductMasterDropdowns_(sheet);
}

function applyProductMasterDropdowns_(sheet) {
  const headers = sheet
    .getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1))
    .getValues()[0]
    .map(normalizeMasterHeader_);
  const colorGroupIndex = findMasterHeaderIndex_(headers, ['色系統', 'colorGroup']);
  if (colorGroupIndex < 0) return;

  const maxRows = Math.max(sheet.getMaxRows() - 1, 1);
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(KCO_COLOR_GROUPS, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, colorGroupIndex + 1, maxRows, 1).setDataValidation(rule);
}

function fillMissingProductCodes_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return;
  const headers = values[0].map(normalizeMasterHeader_);
  const codeIndex = findMasterHeaderIndex_(headers, ['商品コード']);
  const categoryIndex = findMasterHeaderIndex_(headers, ['商品カテゴリー']);
  if (codeIndex < 0 || categoryIndex < 0) return;

  const counters = {};
  values.slice(1).forEach((row) => {
    const category = String(row[categoryIndex] || '').trim();
    const code = String(row[codeIndex] || '').trim();
    if (!category || !code) return;
    counters[category] = Number(counters[category] || 0) + 1;
  });
  values.slice(1).forEach((row, rowOffset) => {
    const rowNumber = rowOffset + 2;
    if (String(row[codeIndex] || '').trim()) return;
    const category = String(row[categoryIndex] || '').trim();
    counters[category] = Number(counters[category] || 0) + 1;
    sheet.getRange(rowNumber, codeIndex + 1).setValue(createDefaultProductCode_(category, counters[category]));
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

function setupOrders_(ss) {
  const sheet = getOrCreateSheet_(ss, KCO_CONFIG.ORDERS);
  ensureOrderHeaders_(sheet);
  applyHeaderStyle_(sheet, KCO_ORDER_HEADERS.length);
  setupOrderDropdowns_(sheet);
  sheet.autoResizeColumns(1, KCO_ORDER_HEADERS.length);
}

function setupOrderDetails_(ss) {
  const sheet = getOrCreateSheet_(ss, KCO_CONFIG.ORDER_DETAILS);
  ensureOrderDetailHeaders_(sheet);
  applyHeaderStyle_(sheet, KCO_DETAIL_HEADERS.length);
  sheet.autoResizeColumns(1, KCO_DETAIL_HEADERS.length);
}

function setupFranchiseMaster_(ss) {
  const sheet = getOrCreateSheet_(ss, KCO_CONFIG.FRANCHISE_MASTER);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, KCO_FRANCHISE_HEADERS.length).setValues([KCO_FRANCHISE_HEADERS]);
  } else {
    ensureFranchiseMasterColumns_(sheet);
  }
  applyHeaderStyle_(sheet, KCO_FRANCHISE_HEADERS.length);
  sheet.autoResizeColumns(1, KCO_FRANCHISE_HEADERS.length);
}

function setupUserMaster_(ss) {
  const sheet = getOrCreateSheet_(ss, KCO_CONFIG.USER_MASTER);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, KCO_USER_HEADERS.length).setValues([KCO_USER_HEADERS]);
  } else {
    ensureUserMasterColumns_(sheet);
  }
  applyHeaderStyle_(sheet, KCO_USER_HEADERS.length);
  sheet.autoResizeColumns(1, KCO_USER_HEADERS.length);
}

function ensureUserMasterColumns_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, KCO_USER_HEADERS.length).setValues([KCO_USER_HEADERS]);
    return;
  }
  const existingHeaders = sheet
    .getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1))
    .getValues()[0]
    .map(normalizeMasterHeader_);
  KCO_USER_HEADERS.forEach((header) => {
    if (existingHeaders.indexOf(normalizeMasterHeader_(header)) !== -1) return;
    sheet.insertColumnAfter(sheet.getLastColumn());
    sheet.getRange(1, sheet.getLastColumn()).setValue(header);
    existingHeaders.push(normalizeMasterHeader_(header));
  });
}

function backfillFranchiseIdentityColumns_(ss) {
  const sheet = getOrCreateSheet_(ss, KCO_CONFIG.FRANCHISE_MASTER);
  ensureFranchiseMasterColumns_(sheet);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    return {
      updatedRowCount: 0,
      skippedRowCount: 0,
    };
  }

  const headers = values[0].map(normalizeMasterHeader_);
  const getIndex = (candidates) => findMasterHeaderIndex_(headers, candidates);
  const memberIdIndex = getIndex(['memberId', '加盟店ID']);
  const userIdIndex = getIndex(['userId', 'ユーザーID']);
  const shopIdIndex = getIndex(['shopId', '店舗ID']);
  const emailIndex = getIndex(['email', 'メールアドレス']);
  const loginIdIndex = getIndex(['loginId', 'ログインID']);
  const createdAtIndex = getIndex(['createdAt', '作成日', '登録日']);
  const updatedAtIndex = getIndex(['updatedAt', '更新日']);
  let updatedRowCount = 0;
  let skippedRowCount = 0;
  const now = new Date();

  if (memberIdIndex === -1) {
    throw new Error('加盟店マスタに memberId または 加盟店ID 列がありません。');
  }

  for (let i = 1; i < values.length; i += 1) {
    const row = values[i];
    const memberId = String(row[memberIdIndex] || '').trim();
    try {
      if (!memberId) {
        skippedRowCount += 1;
        continue;
      }
      let changed = false;
      if (userIdIndex !== -1 && !String(row[userIdIndex] || '').trim()) {
        row[userIdIndex] = memberId;
        changed = true;
      }
      if (shopIdIndex !== -1 && !String(row[shopIdIndex] || '').trim()) {
        row[shopIdIndex] = generateShopIdFromMemberId_(memberId);
        changed = true;
      }
      if (loginIdIndex !== -1 && !String(row[loginIdIndex] || '').trim()) {
        row[loginIdIndex] = emailIndex === -1 ? '' : String(row[emailIndex] || '').trim();
        changed = true;
      }
      if (createdAtIndex !== -1 && !row[createdAtIndex]) {
        row[createdAtIndex] = now;
        changed = true;
      }
      if (updatedAtIndex !== -1 && !row[updatedAtIndex]) {
        row[updatedAtIndex] = now;
        changed = true;
      }
      if (changed) updatedRowCount += 1;
      else skippedRowCount += 1;
    } catch (error) {
      logSetupStep_('franchise identity backfill row failed', {
        rowNumber: i + 1,
        memberId,
        message: error && error.message ? error.message : String(error),
      });
      throw error;
    }
  }

  if (updatedRowCount > 0) {
    sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
  }

  return {
    updatedRowCount,
    skippedRowCount,
  };
}

function syncFranchiseUsersToUserMaster_(ss) {
  const userSheet = getOrCreateSheet_(ss, KCO_CONFIG.USER_MASTER);
  ensureUserMasterColumns_(userSheet);
  const startedAt = Date.now();
  const userValues = userSheet.getDataRange().getValues();
  const rawUserHeaders = userValues[0].map((header) => String(header || '').trim());
  const userHeaders = rawUserHeaders.map(normalizeMasterHeader_);
  const getUserIndex = (candidates) => findMasterHeaderIndex_(userHeaders, candidates);
  const indexes = {
    userId: getUserIndex(['userId', 'ユーザーID']),
    shopId: getUserIndex(['shopId', '店舗ID']),
    staffName: getUserIndex(['staffName', 'スタッフ名', '担当者名']),
    role: getUserIndex(['role', '権限']),
    passwordHash: getUserIndex(['passwordHash', 'パスワードハッシュ']),
    lastLogin: getUserIndex(['lastLogin', '最終ログイン']),
    createdAt: getUserIndex(['createdAt', '作成日', '登録日']),
  };
  if (indexes.userId === -1) {
    throw new Error('ユーザーマスタに userId 列がありません。');
  }

  const existingRows = userValues.length <= 1
    ? []
    : userValues.slice(1).map((row) => row.slice(0, rawUserHeaders.length));
  const rowIndexByUserId = {};
  existingRows.forEach((row, index) => {
    const userId = String(row[indexes.userId] || '').trim();
    if (userId && rowIndexByUserId[userId] === undefined) {
      rowIndexByUserId[userId] = index;
    }
  });

  const franchises = getFranchiseMasterRecords_();
  let createdUserCount = 0;
  let updatedUserCount = 0;
  let skippedUserCount = 0;
  const newRows = [];
  const now = new Date();

  franchises.forEach((franchise) => {
    const franchiseId = String(franchise.franchiseId || franchise.memberId || '').trim();
    const userId = String(franchise.userId || '').trim();
    const shopId = String(franchise.shopId || '').trim();
    try {
      if (!userId || !shopId) {
        skippedUserCount += 1;
        logSetupStep_('sync franchise user skipped', {
          franchiseId,
          reason: 'missing_userId_or_shopId',
          userId,
          shopId,
        });
        return;
      }

      const rowIndex = rowIndexByUserId[userId];
      const desired = {
        userId,
        shopId,
        staffName: franchise.contactName || franchise.displayName || '',
        role: franchise.role || 'member',
        passwordHash: franchise.passwordHash || '',
        lastLogin: '',
        createdAt: franchise.createdAt || now,
      };

      if (rowIndex === undefined) {
        const row = new Array(rawUserHeaders.length).fill('');
        Object.keys(indexes).forEach((key) => {
          const index = indexes[key];
          if (index === -1) return;
          row[index] = desired[key] || '';
        });
        newRows.push(row);
        rowIndexByUserId[userId] = existingRows.length + newRows.length - 1;
        createdUserCount += 1;
        return;
      }

      const row = existingRows[rowIndex];
      let changed = false;
      Object.keys(indexes).forEach((key) => {
        const index = indexes[key];
        if (index === -1) return;
        if (key === 'lastLogin') return;
        const currentValue = String(row[index] || '').trim();
        if (currentValue) return;
        const nextValue = desired[key];
        if (nextValue === undefined || nextValue === null || nextValue === '') return;
        row[index] = nextValue;
        changed = true;
      });

      if (changed) updatedUserCount += 1;
      else skippedUserCount += 1;
    } catch (error) {
      logSetupStep_('sync franchise user failed', {
        franchiseId,
        userId,
        shopId,
        message: error && error.message ? error.message : String(error),
        stack: error && error.stack ? error.stack : '',
      });
      throw error;
    }
  });

  if (existingRows.length > 0 && updatedUserCount > 0) {
    userSheet.getRange(2, 1, existingRows.length, rawUserHeaders.length).setValues(existingRows);
  }
  if (newRows.length > 0) {
    userSheet
      .getRange(userSheet.getLastRow() + 1, 1, newRows.length, rawUserHeaders.length)
      .setValues(newRows);
  }

  return {
    createdUserCount,
    updatedUserCount,
    skippedUserCount,
    durationMs: Date.now() - startedAt,
  };
}

function ensureFranchiseMasterColumns_(sheet) {
  const existingHeaders = sheet
    .getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1))
    .getValues()[0]
    .map(normalizeMasterHeader_);

  KCO_FRANCHISE_HEADERS.forEach((header) => {
    if (existingHeaders.indexOf(normalizeMasterHeader_(header)) !== -1) return;
    sheet.insertColumnAfter(sheet.getLastColumn());
    sheet.getRange(1, sheet.getLastColumn()).setValue(header);
    existingHeaders.push(normalizeMasterHeader_(header));
  });
}

function migrateProductionFranchiseRows_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return;

  const headers = values[0].map(normalizeMasterHeader_);
  const getIndex = (candidates) => findMasterHeaderIndex_(headers, candidates);
  const salonNameIndex = getIndex(['salonName', '加盟店名']);
  const emailIndex = getIndex(['email', 'メールアドレス']);

  const rowsToDelete = [];
  values.slice(1).forEach((row, offset) => {
    const rowNumber = offset + 2;
    const salonName = salonNameIndex === -1 ? '' : String(row[salonNameIndex] || '').trim();
    const email = emailIndex === -1 ? '' : String(row[emailIndex] || '').trim();
    const isTestRow = salonName === 'テスト加盟店' || email === 'test@example.com';

    if (isTestRow) {
      rowsToDelete.push(rowNumber);
    }
  });

  rowsToDelete.reverse().forEach((rowNumber) => sheet.deleteRow(rowNumber));
}

function setupSettings_(ss) {
  const sheet = getOrCreateSheet_(ss, KCO_CONFIG.SETTINGS);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, KCO_SETTING_HEADERS.length).setValues([KCO_SETTING_HEADERS]);
  }
  ensureDefaultSettings_(sheet);
  applyHeaderStyle_(sheet, KCO_SETTING_HEADERS.length);
  sheet.autoResizeColumns(1, KCO_SETTING_HEADERS.length);
}

function ensureDefaultSettings_(sheet) {
  const existingRows = sheet.getLastRow() <= 1
    ? []
    : sheet.getRange(2, 1, sheet.getLastRow() - 1, KCO_SETTING_HEADERS.length).getValues();
  const rowByItem = {};
  existingRows.forEach((row, index) => {
    rowByItem[String(row[0] || '').trim()] = index + 2;
  });

  const missingRows = KCO_DEFAULT_SETTINGS.filter((row) => !rowByItem[row[0]]);
  if (missingRows.length > 0) {
    sheet
      .getRange(sheet.getLastRow() + 1, 1, missingRows.length, KCO_SETTING_HEADERS.length)
      .setValues(missingRows);
  }

  KCO_DEFAULT_SETTINGS.forEach((defaultRow) => {
    const rowNumber = rowByItem[defaultRow[0]];
    if (!rowNumber || defaultRow[1] === '') return;
    const currentValue = String(sheet.getRange(rowNumber, 2).getValue() || '').trim();
    if (!currentValue) {
      sheet.getRange(rowNumber, 2).setValue(defaultRow[1]);
    }
  });
}

function ensureOrderHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, KCO_ORDER_HEADERS.length).setValues([KCO_ORDER_HEADERS]);
    return;
  }

  let headers = getHeaderValues_(sheet);
  if (headers.indexOf('加盟店ID') === -1) {
    const franchiseNameIndex = headers.indexOf('加盟店名');
    const insertPosition = franchiseNameIndex >= 0 ? franchiseNameIndex + 1 : 3;
    sheet.insertColumnBefore(insertPosition);
    sheet.getRange(1, insertPosition).setValue('加盟店ID');
  }

  headers = getHeaderValues_(sheet);
  const oldMailIndex = headers.indexOf('加盟店メール');
  if (oldMailIndex >= 0) {
    sheet.getRange(1, oldMailIndex + 1).setValue('メールアドレス');
  } else if (headers.indexOf('メールアドレス') === -1) {
    const contactIndex = headers.indexOf('担当者名');
    const insertAfter = contactIndex >= 0 ? contactIndex + 1 : 5;
    sheet.insertColumnAfter(insertAfter);
    sheet.getRange(1, insertAfter + 1).setValue('メールアドレス');
  }

  sheet.getRange(1, 1, 1, KCO_ORDER_HEADERS.length).setValues([KCO_ORDER_HEADERS]);
}

function ensureOrderDetailHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, KCO_DETAIL_HEADERS.length).setValues([KCO_DETAIL_HEADERS]);
    return;
  }

  const currentHeaders = sheet
    .getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1))
    .getValues()[0]
    .map((value) => String(value || '').trim());

  KCO_DETAIL_HEADERS.forEach((header) => {
    if (currentHeaders.indexOf(header) !== -1) return;
    sheet.insertColumnAfter(sheet.getLastColumn());
    sheet.getRange(1, sheet.getLastColumn()).setValue(header);
    currentHeaders.push(header);
  });
}

function getHeaderValues_(sheet) {
  const colCount = Math.max(sheet.getLastColumn(), KCO_ORDER_HEADERS.length);
  return sheet.getRange(1, 1, 1, colCount).getValues()[0].map((value) => String(value || '').trim());
}

function setupOrderDropdowns_(sheet) {
  const index = createIndex_(KCO_ORDER_HEADERS);
  const maxRows = Math.max(sheet.getMaxRows() - 1, 1);

  const shippingRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(KCO_CONFIG.SHIPPING_STATUS, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, index['発送状況'] + 1, maxRows, 1).setDataValidation(shippingRule);
}

function formatOrderSheets_(ss) {
  const orders = ss.getSheetByName(KCO_CONFIG.ORDERS);
  const details = ss.getSheetByName(KCO_CONFIG.ORDER_DETAILS);
  if (orders.getLastRow() > 1) {
    orders.getRange(2, 2, orders.getLastRow() - 1, 1).setNumberFormat('yyyy/mm/dd hh:mm');
    orders.getRange(2, 7, orders.getLastRow() - 1, 1).setNumberFormat('#,##0');
    orders.getRange(2, 8, orders.getLastRow() - 1, 3).setNumberFormat('¥#,##0');
  }
  if (details.getLastRow() > 1) {
    details.getRange(2, 5, details.getLastRow() - 1, 4).setNumberFormat('¥#,##0');
    const detailHeaders = details.getRange(1, 1, 1, details.getLastColumn()).getValues()[0];
    const detailIndex = createIndex_(detailHeaders);
    ['invoiceUnitPrice', 'lineTotal'].forEach((header) => {
      if (detailIndex[header] === undefined) return;
      details.getRange(2, detailIndex[header] + 1, details.getLastRow() - 1, 1).setNumberFormat('¥#,##0');
    });
  }
}

function sendOrderNotificationEmails_(ss, summary, invoiceSettings, orderRules) {
  const settings = getNotificationSettings_(ss);
  const subject = `【Kimikea Connect Order】注文受付 ${summary.orderNo}`;
  const adminBody = buildOrderEmailBody_(summary);
  const franchiseBody = buildFranchiseEmailBody_(summary, invoiceSettings);
  const invoicePdf = createInvoicePdf_(summary, invoiceSettings, orderRules);

  try {
    sendGrowOrderMail_(summary, settings);
  } catch (error) {
    logMailError_('Grow通知送信失敗', summary.orderNo, settings.growEmails, error);
  }

  try {
    sendAdminOrderMail_(summary, settings, subject, adminBody, invoicePdf);
  } catch (error) {
    logMailError_('管理者メール送信失敗', summary.orderNo, settings.adminEmails, error);
  }

  try {
    sendFranchiseOrderMail_(summary, settings, subject, franchiseBody, invoicePdf);
  } catch (error) {
    logMailError_('加盟店メール送信失敗', summary.orderNo, [summary.franchiseEmail], error);
  }
}

function sendAdminOrderMail_(summary, settings, subject, body, invoicePdf) {
  sendMailList_(settings.adminEmails, subject, body, [invoicePdf], settings.senderName);
  logMailInfo_('管理者メール送信成功', summary.orderNo, settings.adminEmails);
}

function sendFranchiseOrderMail_(summary, settings, subject, body, invoicePdf) {
  if (!settings.sendFranchiseEmail || !summary.franchiseEmail) return;
  sendMailList_([summary.franchiseEmail], subject, body, [invoicePdf], settings.senderName);
  logMailInfo_('加盟店メール送信成功', summary.orderNo, [summary.franchiseEmail]);
}

function sendGrowOrderMail_(summary, settings) {
  if (!settings.growEmails.length) {
    console.error('grow通知メールが設定されていません');
    Logger.log('grow通知メールが設定されていません');
    return;
  }
  const subject = `【Kimikea Connect】新しい注文が入りました／注文番号：${summary.orderNo}`;
  const body = buildGrowOrderEmailBody_(summary);
  const htmlBody = textToHtml_(body);
  settings.growEmails.forEach((email) => {
    try {
      MailApp.sendEmail({
        to: email,
        subject,
        body,
        htmlBody,
        name: settings.senderName || 'Kimikea Connect Order',
      });
      logMailInfo_('Grow通知送信成功', summary.orderNo, [email]);
    } catch (error) {
      logMailError_('Grow通知送信失敗', summary.orderNo, [email], error);
    }
  });
}

function getNotificationSettings_(ss) {
  const sheet = ss.getSheetByName(KCO_CONFIG.SETTINGS);
  const settings = {
    adminEmails: [],
    senderName: 'Kimikea Connect Order',
    sendFranchiseEmail: true,
    growEmails: [],
  };
  if (!sheet || sheet.getLastRow() <= 1) return settings;

  const values = sheet.getDataRange().getValues();
  const index = createIndex_(values[0]);
  values.slice(1).forEach((row) => {
    const item = String(row[index['項目']] || '').trim();
    const value = String(row[index['値']] || '').trim();
    const enabled = isVisible_(row[index['表示']]);

    if (item === '管理者メール' && enabled) {
      settings.adminEmails = parseEmailList_(value);
    }
    if (item === '送信元名' && enabled && value) {
      settings.senderName = value;
    }
    if (item === '加盟店メール送信') {
      settings.sendFranchiseEmail = enabled && isTruthy_(value);
    }
    if (item === 'grow通知メール') {
      settings.growEmails = parseEmailList_(value);
    }
  });
  return settings;
}

function buildOrderEmailBody_(summary) {
  return [
    'Kimikea Connect Orderに新しい注文が入りました。',
    '',
    `注文番号：${summary.orderNo}`,
    `注文日時：${Utilities.formatDate(summary.orderDate, Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm')}`,
    `加盟店ID：${summary.franchiseId}`,
    `加盟店名：${summary.franchiseName}`,
    `担当者名：${summary.contactName}`,
    `メールアドレス：${summary.franchiseEmail}`,
    `電話番号：${summary.franchisePhone || ''}`,
    `配送先：${summary.franchiseAddress || ''}`,
    '',
    '【注文商品一覧】',
    buildOrderItemsText_(summary),
    '',
    `合計袋数：${summary.totalBags}`,
    `商品合計：${formatYen_(summary.productTotal)}`,
    `送料：${formatYen_(summary.shippingFee)}`,
    `請求合計：${formatYen_(summary.invoiceTotal)}`,
    `備考：${summary.note || ''}`,
    '',
    '請求書PDFを添付しています。',
  ].join('\n');
}

function buildGrowOrderEmailBody_(summary) {
  return [
    `加盟店名：${summary.franchiseName}`,
    `担当者名：${summary.contactName}`,
    `発送先住所：${summary.franchiseAddress || ''}`,
    `電話番号：${summary.franchisePhone || ''}`,
    '',
    '【注文内容】',
    buildGrowOrderItemsText_(summary),
    '',
    `合計袋数：${summary.totalBags}`,
  ].join('\n');
}

function buildFranchiseEmailBody_(summary, invoiceSettings) {
  const dueDate = getPaymentDueDate_(summary.orderDate, invoiceSettings.paymentDueDays);
  return [
    `${summary.franchiseName}`,
    `${summary.contactName} 様`,
    '',
    'この度はご注文いただき、ありがとうございます。',
    '下記の内容でご注文を受け付けました。',
    '',
    `注文番号：${summary.orderNo}`,
    '',
    '【注文内容】',
    buildOrderItemsText_(summary),
    '',
    `請求合計：${formatYen_(summary.invoiceTotal)}`,
    `支払期限：${Utilities.formatDate(dueDate, Session.getScriptTimeZone(), 'yyyy年MM月dd日')}`,
    '',
    `ご注文日より${invoiceSettings.paymentDueDays}日以内に下記口座へお振込みをお願いいたします。`,
    '振込先の詳細は、添付の請求書PDFをご確認ください。',
    '',
    '請求書PDFを本メールに添付しています。',
    '',
    'NPO法人シールエクステ協会きみけあ',
  ].join('\n');
}

function buildOrderItemsText_(summary) {
  return getSummaryDetailItems_(summary).map((item) => [
    `${item.category} / ${item.colorName || item.color}`,
    `数量：${item.quantity}袋`,
    `単価：${formatYen_(item.invoiceUnitPrice || item.unitPrice)}`,
    `小計：${formatYen_(item.lineTotal || item.subtotal)}`,
  ].join('\n')).join('\n---\n');
}

function buildGrowOrderItemsText_(summary) {
  return getSummaryDetailItems_(summary).map((item) => {
    const colorName = item.colorName || item.color || '';
    return `・${colorName} × ${item.quantity}袋`;
  }).join('\n');
}

function getSummaryDetailItems_(summary) {
  if (Array.isArray(summary.detailItems) && summary.detailItems.length) return summary.detailItems;
  return (summary.details || []).map((row) => ({
    productCode: row[8] || '',
    productName: row[9] || `${row[1]} ${row[2]}`,
    category: row[1],
    color: row[2],
    colorName: row[2],
    quantity: row[3],
    unitPrice: row[4],
    invoiceUnitPrice: row[11] || row[4],
    subtotal: row[5],
    lineTotal: row[12] || row[5],
    purchasePrice: row[6],
    profit: row[7],
    priceType: row[10] || summary.priceType || '',
  }));
}

function getInvoiceSettings_(ss) {
  const sheet = ss.getSheetByName(KCO_CONFIG.SETTINGS);
  const result = {
    bankName: '',
    branchName: '',
    accountType: '',
    accountNumber: '',
    accountHolder: '',
    paymentDueDays: 3,
    logoFileId: '',
  };
  if (!sheet || sheet.getLastRow() <= 1) return result;

  const values = sheet.getDataRange().getValues();
  const index = createIndex_(values[0]);
  values.slice(1).forEach((row) => {
    const item = String(row[index['項目']] || '').trim();
    const value = String(row[index['値']] || '').trim();
    const enabled = isVisible_(row[index['表示']]);
    if (!enabled) return;

    if (item === '振込先銀行名') result.bankName = value;
    if (item === '振込先支店名') result.branchName = value;
    if (item === '口座種別') result.accountType = value;
    if (item === '口座番号') result.accountNumber = value;
    if (item === '口座名義') result.accountHolder = value;
    if (item === '支払期限日数') {
      const days = Number(value || 3);
      result.paymentDueDays = Number.isFinite(days) && days > 0 ? days : 3;
    }
    if (item === '請求書ロゴファイルID') result.logoFileId = extractDriveFileId_(value);
  });
  return result;
}

function getOrderRules_(ss) {
  const result = {
    shippingFee: KCO_CONFIG.SHIPPING_FEE,
    freeShippingBags: KCO_CONFIG.SHIPPING_FREE_BAGS,
  };
  const sheet = ss.getSheetByName(KCO_CONFIG.SETTINGS);
  if (!sheet || sheet.getLastRow() <= 1) return result;

  const values = sheet.getDataRange().getValues();
  const index = createIndex_(values[0]);
  values.slice(1).forEach((row) => {
    const item = String(row[index['項目']] || '').trim();
    const value = Number(row[index['値']]);
    const enabled = isVisible_(row[index['表示']]);
    if (!enabled || !Number.isFinite(value)) return;
    if (item === '送料' && value >= 0) result.shippingFee = value;
    if (item === '送料無料条件' && value > 0) result.freeShippingBags = value;
  });
  return result;
}

function validateInvoiceSettings_(settings) {
  const missing = [];
  if (!settings.bankName) missing.push('振込先銀行名');
  if (!settings.branchName) missing.push('振込先支店名');
  if (!settings.accountType) missing.push('口座種別');
  if (!settings.accountNumber) missing.push('口座番号');
  if (!settings.accountHolder) missing.push('口座名義');
  if (missing.length > 0) {
    throw new Error(`設定シートに振込先を入力してください：${missing.join('、')}`);
  }
}

function createInvoicePdf_(summary, settings, orderRules) {
  const document = DocumentApp.create(`請求書_${summary.orderNo}`);
  const documentId = document.getId();
  const body = document.getBody();
  const dueDate = getPaymentDueDate_(summary.orderDate, settings.paymentDueDays);
  const timeZone = Session.getScriptTimeZone();
  const detailCount = summary.details.length;
  const detailFontSize = detailCount > 12 ? 7 : detailCount > 7 ? 8 : 9;
  const cellPadding = detailCount > 12 ? 1 : 3;
  const remainingBags = Math.max(orderRules.freeShippingBags - summary.totalBags, 0);
  const shippingMessage = summary.shippingFee === 0
    ? '送料無料です。'
    : `あと${remainingBags}袋で送料無料です。`;

  body.clear();
  body.setPageWidth(595.28);
  body.setPageHeight(841.89);
  body.setMarginTop(24);
  body.setMarginBottom(24);
  body.setMarginLeft(30);
  body.setMarginRight(30);
  body.setAttributes({
    [DocumentApp.Attribute.FONT_FAMILY]: 'Noto Sans JP',
    [DocumentApp.Attribute.FONT_SIZE]: 9,
    [DocumentApp.Attribute.FOREGROUND_COLOR]: '#222222',
  });

  const headerTable = body.appendTable([['', '']]);
  headerTable.setBorderWidth(0);
  headerTable.setColumnWidth(0, 310);
  headerTable.setColumnWidth(1, 195);
  const headerLeft = headerTable.getCell(0, 0);
  const headerRight = headerTable.getCell(0, 1);
  setInvoiceCellPadding_(headerLeft, 2, 12, 2, 2);
  setInvoiceCellPadding_(headerRight, 2, 2, 2, 12);

  const identityTable = headerLeft.appendTable([['', '']]);
  identityTable.setBorderWidth(0);
  identityTable.setColumnWidth(0, 62);
  identityTable.setColumnWidth(1, 242);
  const logoCell = identityTable.getCell(0, 0);
  const companyCell = identityTable.getCell(0, 1);
  setInvoiceCellPadding_(logoCell, 4, 8, 2, 0);
  setInvoiceCellPadding_(companyCell, 0, 0, 0, 0);
  const logoBlob = getInvoiceLogoBlob_(settings.logoFileId);
  if (logoBlob) {
    const logo = logoCell.appendImage(logoBlob);
    logo.setWidth(48);
  }
  appendInvoiceParagraph_(companyCell, KCO_INVOICE_ISSUER.CORPORATE_NAME, {
    bold: true,
    fontSize: 13,
    spacingAfter: 2,
  });
  appendInvoiceParagraph_(companyCell, '━━━━━━━━━━━━━━━━━━', {
    fontSize: 7,
    color: '#B69245',
    spacingAfter: 4,
  });
  appendInvoiceParagraph_(companyCell, [
    KCO_INVOICE_ISSUER.POSTAL_CODE,
    KCO_INVOICE_ISSUER.ADDRESS,
    `TEL：${KCO_INVOICE_ISSUER.TEL}`,
    `E-mail：${KCO_INVOICE_ISSUER.EMAIL}`,
  ].join('\n'), {
    fontSize: 8,
    color: '#333333',
    lineSpacing: 1.08,
  });

  appendInvoiceParagraph_(headerRight, `発行日：${Utilities.formatDate(summary.orderDate, timeZone, 'yyyy年MM月dd日')}`, {
    fontSize: 8,
    alignment: DocumentApp.HorizontalAlignment.RIGHT,
    spacingAfter: 7,
  });
  const invoiceTitleTable = headerRight.appendTable([['請求書']]);
  invoiceTitleTable.setBorderColor('#333333');
  invoiceTitleTable.setBorderWidth(1);
  invoiceTitleTable.getCell(0, 0).setBackgroundColor('#FFFFFF');
  setInvoiceCellPadding_(invoiceTitleTable.getCell(0, 0), 8, 5, 8, 5);
  styleInvoiceCellText_(invoiceTitleTable.getCell(0, 0), 20, true, '#111111', DocumentApp.HorizontalAlignment.CENTER);
  appendInvoiceParagraph_(headerRight, '', { fontSize: 3, spacingAfter: 2 });
  appendInvoiceParagraph_(headerRight, [
    `注文番号　：${summary.orderNo}`,
    `注文日　　：${Utilities.formatDate(summary.orderDate, timeZone, 'yyyy年MM月dd日')}`,
    `支払期限　：${Utilities.formatDate(dueDate, timeZone, 'yyyy年MM月dd日')}`,
  ].join('\n'), {
    fontSize: 9,
    lineSpacing: 1.15,
  });

  body.appendHorizontalRule();
  const customer = body.appendParagraph([
    `加盟店名：${summary.franchiseName}`,
    `担当者名：${summary.contactName} 様`,
    `住所：${summary.franchiseAddress || ''}`,
    `TEL：${summary.franchisePhone || ''}　E-mail：${summary.franchiseEmail || ''}`,
  ].join('\n'));
  customer.setSpacingBefore(5).setSpacingAfter(5).setLineSpacing(1.05);
  customer.editAsText().setBold(true).setFontSize(10);

  const tableRows = [
    ['商品カテゴリー', 'カラー', '数量', '単価', '小計'],
  ];
  summary.details.forEach((row) => {
    tableRows.push([
      String(row[1]),
      String(row[2]),
      String(row[3]),
      formatYen_(row[4]),
      formatYen_(row[5]),
    ]);
  });
  const table = body.appendTable(tableRows);
  table.setBorderColor('#777777');
  table.setBorderWidth(0.5);
  table.setColumnWidth(0, 165);
  table.setColumnWidth(1, 105);
  table.setColumnWidth(2, 55);
  table.setColumnWidth(3, 90);
  table.setColumnWidth(4, 95);
  for (let i = 0; i < table.getRow(0).getNumCells(); i += 1) {
    table.getRow(0).getCell(i)
      .setBackgroundColor('#1F1F1F')
      .editAsText()
      .setBold(true)
      .setFontSize(9)
      .setForegroundColor('#FFFFFF');
    setInvoiceCellPadding_(table.getRow(0).getCell(i), 5, 3, 5, 3);
    table.getRow(0).getCell(i).getChild(0).asParagraph()
      .setAlignment(DocumentApp.HorizontalAlignment.CENTER)
      .setSpacingBefore(0)
      .setSpacingAfter(0);
  }
  for (let rowIndex = 1; rowIndex < table.getNumRows(); rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < 5; columnIndex += 1) {
      const cell = table.getRow(rowIndex).getCell(columnIndex);
      setInvoiceCellPadding_(cell, cellPadding, 2, cellPadding, 2);
      styleInvoiceCellText_(
        cell,
        detailFontSize,
        false,
        '#222222',
        columnIndex === 0 || columnIndex === 1
          ? DocumentApp.HorizontalAlignment.LEFT
          : DocumentApp.HorizontalAlignment.RIGHT
      );
    }
  }

  appendInvoiceParagraph_(body, '', { fontSize: 2, spacingAfter: 1 });
  const summaryTable = body.appendTable([['', '']]);
  summaryTable.setBorderWidth(0);
  summaryTable.setColumnWidth(0, 255);
  summaryTable.setColumnWidth(1, 255);
  const shippingCell = summaryTable.getCell(0, 0);
  const totalsCell = summaryTable.getCell(0, 1);
  setInvoiceCellPadding_(shippingCell, 8, 10, 5, 2);
  setInvoiceCellPadding_(totalsCell, 0, 0, 0, 0);
  appendInvoiceParagraph_(shippingCell, shippingMessage, {
    bold: true,
    fontSize: 11,
    spacingAfter: 5,
  });
  appendInvoiceParagraph_(shippingCell, [
    '🚚',
    `※${orderRules.freeShippingBags}袋以上のご注文で送料無料となります。`,
    `※${orderRules.freeShippingBags}袋未満の場合は送料${formatYen_(orderRules.shippingFee)}が加算されます。`,
  ].join('\n'), {
    fontSize: 8,
    color: '#555555',
    lineSpacing: 1.05,
  });

  const totalsTable = totalsCell.appendTable([
    ['合計袋数', `${summary.totalBags}袋`],
    ['商品合計', formatYen_(summary.productTotal)],
    ['送料', formatYen_(summary.shippingFee)],
    ['請求金額（税込）', formatYen_(summary.invoiceTotal)],
  ]);
  totalsTable.setBorderColor('#888888');
  totalsTable.setBorderWidth(0.5);
  totalsTable.setColumnWidth(0, 155);
  totalsTable.setColumnWidth(1, 100);
  for (let row = 0; row < totalsTable.getNumRows(); row += 1) {
    const isGrandTotal = row === totalsTable.getNumRows() - 1;
    setInvoiceCellPadding_(totalsTable.getRow(row).getCell(0), 4, 4, 4, 4);
    setInvoiceCellPadding_(totalsTable.getRow(row).getCell(1), 4, 4, 4, 4);
    styleInvoiceCellText_(totalsTable.getRow(row).getCell(0), isGrandTotal ? 11 : 9, true, '#222222', DocumentApp.HorizontalAlignment.LEFT);
    styleInvoiceCellText_(totalsTable.getRow(row).getCell(1), isGrandTotal ? 13 : 9, isGrandTotal, '#111111', DocumentApp.HorizontalAlignment.RIGHT);
    if (isGrandTotal) {
      totalsTable.getRow(row).getCell(0).setBackgroundColor('#EFE5CC');
      totalsTable.getRow(row).getCell(1).setBackgroundColor('#EFE5CC');
    }
  }

  appendInvoiceParagraph_(body, '', { fontSize: 2, spacingAfter: 0 });
  appendInvoiceParagraph_(body, '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', {
    fontSize: 7,
    color: '#B69245',
    spacingAfter: 2,
  });
  const paymentTable = body.appendTable([['', '']]);
  paymentTable.setBorderWidth(0);
  paymentTable.setColumnWidth(0, 305);
  paymentTable.setColumnWidth(1, 205);
  const bankCell = paymentTable.getCell(0, 0);
  const noticeCell = paymentTable.getCell(0, 1);
  setInvoiceCellPadding_(bankCell, 0, 6, 0, 0);
  setInvoiceCellPadding_(noticeCell, 0, 0, 0, 6);

  const bankTable = bankCell.appendTable([
    ['お振込先', ''],
    ['銀行名', settings.bankName],
    ['支店名', settings.branchName],
    ['口座種別', settings.accountType],
    ['口座番号', settings.accountNumber],
    ['口座名義', settings.accountHolder],
  ]);
  bankTable.setBorderColor('#888888');
  bankTable.setBorderWidth(0.5);
  bankTable.setColumnWidth(0, 92);
  bankTable.setColumnWidth(1, 213);
  for (let row = 0; row < bankTable.getNumRows(); row += 1) {
    setInvoiceCellPadding_(bankTable.getRow(row).getCell(0), 3, 4, 3, 4);
    setInvoiceCellPadding_(bankTable.getRow(row).getCell(1), 3, 4, 3, 4);
    if (row === 0) {
      bankTable.getRow(row).getCell(0).setBackgroundColor('#1F1F1F');
      bankTable.getRow(row).getCell(1).setBackgroundColor('#1F1F1F');
      styleInvoiceCellText_(bankTable.getRow(row).getCell(0), 9, true, '#FFFFFF', DocumentApp.HorizontalAlignment.LEFT);
      styleInvoiceCellText_(bankTable.getRow(row).getCell(1), 9, true, '#FFFFFF', DocumentApp.HorizontalAlignment.LEFT);
    } else {
      styleInvoiceCellText_(bankTable.getRow(row).getCell(0), 8, true, '#222222', DocumentApp.HorizontalAlignment.LEFT);
      styleInvoiceCellText_(bankTable.getRow(row).getCell(1), 8, false, '#222222', DocumentApp.HorizontalAlignment.LEFT);
    }
  }

  const noticeTable = noticeCell.appendTable([['']]);
  noticeTable.setBorderColor('#B9B9B9');
  noticeTable.setBorderWidth(0.5);
  setInvoiceCellPadding_(noticeTable.getCell(0, 0), 14, 12, 14, 12);
  const noticeText = noticeTable.getCell(0, 0).editAsText();
  noticeText.setText([
    '恐れ入りますが',
    `注文日より${settings.paymentDueDays}日以内に`,
    'お振込みをお願いいたします。',
    '',
    '振込手数料は加盟店様負担となります。',
  ].join('\n'));
  noticeText.setFontSize(9).setForegroundColor('#222222');
  const dueText = `${settings.paymentDueDays}日以内`;
  const dueTextStart = noticeText.getText().indexOf(dueText);
  if (dueTextStart >= 0) {
    noticeText
      .setBold(dueTextStart, dueTextStart + dueText.length - 1, true)
      .setForegroundColor(dueTextStart, dueTextStart + dueText.length - 1, '#C8332B');
  }
  noticeTable.getCell(0, 0).getChild(0).asParagraph()
    .setLineSpacing(1.2)
    .setSpacingBefore(0)
    .setSpacingAfter(0);

  if (summary.note) {
    appendInvoiceParagraph_(body, `備考：${summary.note}`, {
      fontSize: 8,
      color: '#555555',
      spacingBefore: 3,
      spacingAfter: 2,
    });
  }
  appendInvoiceParagraph_(body, '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', {
    fontSize: 7,
    color: '#B69245',
    spacingBefore: 2,
    spacingAfter: 2,
  });
  appendInvoiceParagraph_(body, 'この度はご注文いただき誠にありがとうございます。', {
    fontSize: 9,
    alignment: DocumentApp.HorizontalAlignment.CENTER,
    spacingBefore: 1,
  });

  document.saveAndClose();

  try {
    return DriveApp
      .getFileById(documentId)
      .getAs(MimeType.PDF)
      .setName(`請求書_${summary.orderNo}.pdf`);
  } finally {
    DriveApp.getFileById(documentId).setTrashed(true);
  }
}

function appendInvoiceParagraph_(container, text, options) {
  const config = options || {};
  const paragraph = container.appendParagraph(text);
  paragraph
    .setAlignment(config.alignment || DocumentApp.HorizontalAlignment.LEFT)
    .setLineSpacing(config.lineSpacing || 1)
    .setSpacingBefore(config.spacingBefore || 0)
    .setSpacingAfter(config.spacingAfter || 0);
  paragraph.editAsText()
    .setFontFamily('Noto Sans JP')
    .setFontSize(config.fontSize || 9)
    .setBold(Boolean(config.bold))
    .setForegroundColor(config.color || '#222222');
  return paragraph;
}

function setInvoiceCellPadding_(cell, top, right, bottom, left) {
  cell.setPaddingTop(top);
  cell.setPaddingRight(right);
  cell.setPaddingBottom(bottom);
  cell.setPaddingLeft(left);
}

function styleInvoiceCellText_(cell, fontSize, bold, color, alignment) {
  cell.editAsText()
    .setFontFamily('Noto Sans JP')
    .setFontSize(fontSize)
    .setBold(Boolean(bold))
    .setForegroundColor(color);
  for (let i = 0; i < cell.getNumChildren(); i += 1) {
    const child = cell.getChild(i);
    if (child.getType() === DocumentApp.ElementType.PARAGRAPH) {
      child.asParagraph()
        .setAlignment(alignment)
        .setLineSpacing(1)
        .setSpacingBefore(0)
        .setSpacingAfter(0);
    }
  }
}

function getPaymentDueDate_(orderDate, paymentDueDays) {
  const dueDate = new Date(orderDate.getTime());
  dueDate.setDate(dueDate.getDate() + Number(paymentDueDays || 3));
  return dueDate;
}

function extractDriveFileId_(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const match = text.match(/[-\w]{25,}/);
  return match ? match[0] : text;
}

function getInvoiceLogoBlob_(fileId) {
  if (!fileId) return null;
  try {
    return DriveApp.getFileById(fileId).getBlob();
  } catch (error) {
    throw new Error('請求書ロゴを読み込めません。設定シートの「請求書ロゴファイルID」を確認してください。');
  }
}

function sendMailList_(emails, subject, body, attachments, senderName, htmlBody) {
  const uniqueEmails = parseEmailList_((emails || []).join(','));
  uniqueEmails.forEach((email) => {
    try {
      const payload = {
        to: email,
        subject,
        body,
        attachments: attachments || [],
        name: senderName || 'Kimikea Connect Order',
      };
      if (htmlBody) payload.htmlBody = htmlBody;
      MailApp.sendEmail(payload);
    } catch (error) {
      logMailError_('メール送信失敗', '', [email], error);
    }
  });
}

function textToHtml_(body) {
  return String(body || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

function logMailInfo_(message, orderNo, emails) {
  const to = parseEmailList_((emails || []).join(',')).join(',');
  const text = `${message} orderId=${orderNo || ''} to=${to}`;
  console.log(text);
  Logger.log(text);
}

function logMailError_(message, orderNo, emails, error) {
  const to = parseEmailList_((emails || []).join(',')).join(',');
  const text = `${message} orderId=${orderNo || ''} to=${to} error=${error && error.message ? error.message : String(error)}`;
  console.error(text);
  Logger.log(text);
}

function testSendGrowMail() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settings = getNotificationSettings_(ss);
  if (!settings.growEmails.length) {
    throw new Error('grow通知メールが設定されていません');
  }
  settings.growEmails.forEach((email) => {
    try {
      MailApp.sendEmail({
        to: email,
        subject: '【Kimikea Connect】Grow通知テスト',
        body: 'Grow通知メールのテスト送信です。',
        name: settings.senderName || 'Kimikea Connect Order',
      });
      logMailInfo_('Grow通知テスト送信成功', 'test', [email]);
    } catch (error) {
      logMailError_('Grow通知テスト送信失敗', 'test', [email], error);
    }
  });
}

function ensureShipmentEditTrigger_(ss) {
  const handlerName = 'handleOrderStatusEdit';
  const exists = ScriptApp.getProjectTriggers().some((trigger) => (
    trigger.getHandlerFunction() === handlerName
    && trigger.getEventType() === ScriptApp.EventType.ON_EDIT
  ));
  if (!exists) {
    ScriptApp.newTrigger(handlerName)
      .forSpreadsheet(ss)
      .onEdit()
      .create();
  }
}

function handleOrderStatusEdit(event) {
  if (!event || !event.range) return;

  const sheet = event.range.getSheet();
  if (sheet.getName() !== KCO_CONFIG.ORDERS || event.range.getRow() <= 1) return;

  const headers = sheet
    .getRange(1, 1, 1, KCO_ORDER_HEADERS.length)
    .getValues()[0]
    .map((value) => String(value || '').trim());
  const index = createIndex_(headers);
  if (event.range.getColumn() !== index['発送状況'] + 1 || String(event.value || '') !== '発送済') return;

  const rowNumber = event.range.getRow();
  const notificationColumn = index['発送通知日時'] + 1;
  if (sheet.getRange(rowNumber, notificationColumn).getValue()) return;

  const row = sheet.getRange(rowNumber, 1, 1, KCO_ORDER_HEADERS.length).getValues()[0];
  const orderNo = String(row[index['注文番号']] || '');
  const franchiseName = String(row[index['加盟店名']] || '');
  const contactName = String(row[index['担当者名']] || '');
  const email = String(row[index['メールアドレス']] || '').trim();
  if (!email) return;

  const settings = getNotificationSettings_(event.source);
  const subject = `【Kimikea Connect Order】発送しました ${orderNo}`;
  const body = [
    `${franchiseName}`,
    `${contactName} 様`,
    '',
    'ご注文の商品を発送しました。',
    '',
    `注文番号：${orderNo}`,
    '',
    '商品到着まで今しばらくお待ちください。',
    '',
    'NPO法人シールエクステ協会 Kimikea',
  ].join('\n');

  sendMailList_([email], subject, body, [], settings.senderName);
  sheet.getRange(rowNumber, notificationColumn)
    .setValue(new Date())
    .setNumberFormat('yyyy/mm/dd hh:mm');
}

function parseEmailList_(value) {
  const seen = {};
  return String(value || '')
    .normalize('NFKC')
    .split(/[,、，\n]/)
    .map((email) => email.trim())
    .filter((email) => email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    .filter((email) => {
      const key = email.toLowerCase();
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
}

function isTruthy_(value) {
  const text = String(value || '').trim().toUpperCase();
  return value === true || text === 'TRUE' || text === 'ON' || text === 'YES' || text === '1' || text === '送信';
}

function formatYen_(value) {
  return `¥${Number(value || 0).toLocaleString('ja-JP')}`;
}

function getInvoicePriceType_(franchiseId) {
  const normalized = String(franchiseId || '').trim().toUpperCase();
  return KCO_COST_PRICE_FRANCHISE_IDS.indexOf(normalized) !== -1 ? 'cost' : 'sale';
}

function getInvoiceUnitPrice_(product, priceType) {
  if (priceType === 'cost') {
    return Number(product.purchasePrice || 0);
  }
  return Number(product.salesPrice || 0);
}

function getProductMap_() {
  const products = getVisibleProducts_();
  const map = {};
  products.forEach((product) => {
    map[createProductCodeKey_(product.productCode)] = product;
    map[createProductKey_(product.category, product.color)] = product;
  });
  return map;
}

function createSessionKey_(sessionToken) {
  return `KCO_SESSION_${String(sessionToken || '').trim()}`;
}

function getSessionFranchise_(sessionToken, options) {
  const token = String(sessionToken || '').trim();
  if (!token) {
    throw new Error('ログインが必要です。');
  }

  const cache = CacheService.getScriptCache();
  const sessionJson = cache.get(createSessionKey_(token));
  if (!sessionJson) {
    throw new Error('ログインの有効期限が切れました。再度ログインしてください。');
  }

  const session = JSON.parse(sessionJson);

  const franchise = getFranchiseMasterRecords_().find((item) => (
    item.visible && item.franchiseId === session.franchiseId
  ));
  if (!franchise) {
    cache.remove(createSessionKey_(token));
    throw new Error('加盟店情報が無効です。管理者へお問い合わせください。');
  }

  cache.put(
    createSessionKey_(token),
    JSON.stringify({
      franchiseId: franchise.franchiseId,
      userId: franchise.userId,
      shopId: franchise.shopId,
      loginId: franchise.loginId || franchise.email || '',
      role: franchise.role || 'member',
      passwordChangeRequired: false,
    }),
    KCO_CONFIG.SESSION_SECONDS
  );
  return franchise;
}

function getFranchiseOrders_(franchiseId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ordersSheet = ss.getSheetByName(KCO_CONFIG.ORDERS);
  const detailsSheet = ss.getSheetByName(KCO_CONFIG.ORDER_DETAILS);
  if (!ordersSheet || ordersSheet.getLastRow() <= 1) return [];
  const franchise = findFranchiseById_(franchiseId);

  const orderValues = ordersSheet.getDataRange().getValues();
  const orderIndex = createIndex_(orderValues[0]);
  const detailsByOrder = {};

  if (detailsSheet && detailsSheet.getLastRow() > 1) {
    const detailValues = detailsSheet.getDataRange().getValues();
    const detailIndex = createIndex_(detailValues[0]);
    detailValues.slice(1).forEach((row) => {
      const orderNo = String(row[detailIndex['注文番号']] || '');
      if (!orderNo) return;
      if (!detailsByOrder[orderNo]) detailsByOrder[orderNo] = [];
      detailsByOrder[orderNo].push({
        productCode: detailIndex['商品コード'] === undefined ? '' : String(row[detailIndex['商品コード']] || ''),
        productName: detailIndex['商品名'] === undefined ? '' : String(row[detailIndex['商品名']] || ''),
        category: String(row[detailIndex['商品カテゴリー']] || ''),
        color: String(row[detailIndex['カラー']] || ''),
        quantity: Number(row[detailIndex['数量']] || 0),
        unitPrice: Number(row[detailIndex['invoiceUnitPrice']] || row[detailIndex['単価']] || 0),
        subtotal: Number(row[detailIndex['lineTotal']] || row[detailIndex['小計']] || 0),
        priceType: detailIndex['priceType'] === undefined ? '' : String(row[detailIndex['priceType']] || ''),
      });
    });
  }

  return orderValues.slice(1)
    .filter((row) => orderRowBelongsToFranchise_(row, orderIndex, franchise))
    .map((row) => {
      const orderNo = String(row[orderIndex['注文番号']] || '');
      const orderDate = row[orderIndex['注文日時']];
      return {
        orderNo,
        orderDate: orderDate instanceof Date
          ? Utilities.formatDate(orderDate, Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm')
          : String(orderDate || ''),
        totalBags: Number(row[orderIndex['合計袋数']] || 0),
        shippingFee: Number(row[orderIndex['invoiceShipping']] || row[orderIndex['送料']] || 0),
        productTotal: Number(row[orderIndex['商品合計']] || 0),
        invoiceTotal: Number(row[orderIndex['invoiceTotal']] || row[orderIndex['請求合計']] || 0),
        priceType: orderIndex['priceType'] === undefined ? '' : String(row[orderIndex['priceType']] || ''),
        paymentStatus: String(row[orderIndex['入金状況']] || '未確認'),
        shippingStatus: String(row[orderIndex['発送状況']] || '発送準備'),
        shopId: orderIndex.shopId === undefined ? franchise.shopId : String(row[orderIndex.shopId] || franchise.shopId || ''),
        userId: orderIndex.userId === undefined ? '' : String(row[orderIndex.userId] || ''),
        note: String(row[orderIndex['備考']] || ''),
        items: detailsByOrder[orderNo] || [],
      };
    })
    .reverse();
}

function buildMyPageOrderSummary_(orders) {
  const now = new Date();
  const monthKey = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM');
  return (orders || []).reduce((summary, order) => {
    const status = String(order.shippingStatus || '');
    const cancelled = status.includes('キャンセル') || status.toLowerCase() === 'cancelled';
    const amount = Number(order.invoiceTotal || 0);
    const bags = Number(order.totalBags || 0);
    if (!cancelled) {
      summary.totalAmount += amount;
      summary.totalBags += bags;
      summary.orderCount += 1;
      if (String(order.orderDate || '').startsWith(monthKey)) {
        summary.monthAmount += amount;
        summary.monthBags += bags;
      }
    }
    return summary;
  }, {
    totalAmount: 0,
    totalBags: 0,
    orderCount: 0,
    monthAmount: 0,
    monthBags: 0,
  });
}

function buildMyPageInvoiceSummaries_(orders) {
  const groups = {};
  (orders || []).forEach((order) => {
    const key = String(order.orderDate || '').slice(0, 7).replace('/', '-');
    if (!key) return;
    if (!groups[key]) groups[key] = {
      key,
      orderCount: 0,
      amount: 0,
      bags: 0,
    };
    groups[key].orderCount += 1;
    if (!String(order.shippingStatus || '').includes('キャンセル')) {
      groups[key].amount += Number(order.invoiceTotal || 0);
      groups[key].bags += Number(order.totalBags || 0);
    }
  });
  return Object.values(groups).sort((a, b) => String(b.key).localeCompare(String(a.key)));
}

function orderRowBelongsToFranchise_(row, orderIndex, franchise) {
  const rowShopId = orderIndex.shopId === undefined ? '' : String(row[orderIndex.shopId] || '').trim();
  if (rowShopId && franchise.shopId) return rowShopId === String(franchise.shopId || '').trim();
  return String(row[orderIndex['加盟店ID']] || '').trim() === String(franchise.franchiseId || '').trim();
}

function getInvoicePdfData(sessionToken, orderNo) {
  const franchise = getSessionFranchise_(sessionToken);
  const targetOrderNo = String(orderNo || '').trim();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ordersSheet = ss.getSheetByName(KCO_CONFIG.ORDERS);
  const detailsSheet = ss.getSheetByName(KCO_CONFIG.ORDER_DETAILS);
  const orderValues = ordersSheet.getDataRange().getValues();
  const orderIndex = createIndex_(orderValues[0]);
  const orderRow = orderValues.slice(1).find((row) => (
    String(row[orderIndex['注文番号']] || '') === targetOrderNo
    && orderRowBelongsToFranchise_(row, orderIndex, franchise)
  ));
  if (!orderRow) throw new Error('注文履歴が見つかりません。');

  const detailValues = detailsSheet.getDataRange().getValues();
  const detailIndex = createIndex_(detailValues[0]);
  let usedLegacyPriceForReissue = false;
  const detailRows = detailValues.slice(1)
    .filter((row) => String(row[detailIndex['注文番号']] || '') === targetOrderNo)
    .map((row) => {
      const savedUnitPrice = detailIndex['invoiceUnitPrice'] === undefined ? '' : row[detailIndex['invoiceUnitPrice']];
      const savedLineTotal = detailIndex['lineTotal'] === undefined ? '' : row[detailIndex['lineTotal']];
      if (savedUnitPrice === '' || savedUnitPrice === null || savedUnitPrice === undefined
        || savedLineTotal === '' || savedLineTotal === null || savedLineTotal === undefined) {
        usedLegacyPriceForReissue = true;
      }
      return [
        targetOrderNo,
        row[detailIndex['商品カテゴリー']],
        row[detailIndex['カラー']],
        Number(row[detailIndex['数量']] || 0),
        Number(savedUnitPrice || row[detailIndex['単価']] || 0),
        Number(savedLineTotal || row[detailIndex['小計']] || 0),
        Number(row[detailIndex['仕入単価']] || 0),
        Number(row[detailIndex['利益']] || 0),
        detailIndex['商品コード'] === undefined ? '' : row[detailIndex['商品コード']],
        detailIndex['商品名'] === undefined ? '' : row[detailIndex['商品名']],
        detailIndex['priceType'] === undefined ? '' : row[detailIndex['priceType']],
        Number(savedUnitPrice || row[detailIndex['単価']] || 0),
        Number(savedLineTotal || row[detailIndex['小計']] || 0),
      ];
    });

  if (usedLegacyPriceForReissue) {
    const warning = `請求書再発行警告：注文時単価保存前の注文です。既存の単価・小計を使用しました。orderId=${targetOrderNo}`;
    console.warn(warning);
    Logger.log(warning);
  }

  const orderDateValue = orderRow[orderIndex['注文日時']];
  const orderDate = orderDateValue instanceof Date ? orderDateValue : new Date(orderDateValue);
  const summary = {
    orderNo: targetOrderNo,
    orderDate,
    franchiseId: franchise.franchiseId,
    franchiseName: franchise.franchiseName,
    contactName: franchise.contactName,
    franchiseEmail: franchise.email,
    franchisePhone: franchise.phone,
    franchiseAddress: franchise.address,
    note: String(orderRow[orderIndex['備考']] || ''),
    details: detailRows,
    totalBags: Number(orderRow[orderIndex['合計袋数']] || 0),
    shippingFee: Number(orderRow[orderIndex['invoiceShipping']] || orderRow[orderIndex['送料']] || 0),
    productTotal: Number(orderRow[orderIndex['商品合計']] || 0),
    invoiceTotal: Number(orderRow[orderIndex['invoiceTotal']] || orderRow[orderIndex['請求合計']] || 0),
    priceType: orderIndex['priceType'] === undefined ? '' : String(orderRow[orderIndex['priceType']] || ''),
  };
  const pdf = createInvoicePdf_(summary, getInvoiceSettings_(ss), getOrderRules_(ss));
  return {
    fileName: `請求書_${targetOrderNo}.pdf`,
    contentType: 'application/pdf',
    base64: Utilities.base64Encode(pdf.getBytes()),
  };
}

function getFranchiseMasterRecords_() {
  const sheet = getSheet_(KCO_CONFIG.FRANCHISE_MASTER);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  const headers = values[0].map(normalizeMasterHeader_);
  const findHeaderIndex = (candidates) => findMasterHeaderIndex_(headers, candidates);
  const franchiseIdIndex = findHeaderIndex(['memberId', '加盟店ID']);
  const userIdIndex = findHeaderIndex(['userId', 'ユーザーID']);
  const shopIdIndex = findHeaderIndex(['shopId', '店舗ID']);
  const franchiseNameIndex = findHeaderIndex(['salonName', '加盟店名']);
  const staffIdIndex = findHeaderIndex(['staffId', '担当者ID']);
  const displayNameIndex = findHeaderIndex(['displayName', '表示名', '担当者名']);
  const roleIndex = findHeaderIndex(['role', '権限']);
  const emailIndex = findHeaderIndex(['email', 'メールアドレス']);
  const loginIdIndex = findHeaderIndex(['loginId', 'ログインID']);
  const phoneIndex = findHeaderIndex(['phone', '電話', '電話番号']);
  const passwordIndex = findHeaderIndex(['initialPassword', 'パスワード', 'password']);
  const passwordHashIndex = findHeaderIndex(['passwordHash', 'パスワードハッシュ']);
  const postalCodeIndex = findHeaderIndex(['postalCode', '郵便番号']);
  const addressIndex = findHeaderIndex(['address', '住所']);
  const contactNameIndex = findHeaderIndex(['contactName', '担当者', '担当者名']);
  const membershipStatusIndex = findHeaderIndex(['membershipStatus', '会員ステータス', '加盟店ステータス', 'ステータス']);
  const passwordChangedAtIndex = findHeaderIndex(['passwordChangedAt', 'パスワード変更日']);
  const createdAtIndex = findHeaderIndex(['createdAt', '作成日', '登録日']);
  const updatedAtIndex = findHeaderIndex(['updatedAt', '更新日']);
  const visibleIndex = findHeaderIndex(['表示']);
  logOrderDebug_('getFranchiseMasterRecords headers', {
    spreadsheetId: SpreadsheetApp.getActiveSpreadsheet().getId(),
    spreadsheetName: SpreadsheetApp.getActiveSpreadsheet().getName(),
    sheetName: sheet.getName(),
    totalRowsIncludingHeader: values.length,
    rawHeaders: values[0].map(String),
    normalizedHeaders: headers,
    indexes: {
      franchiseIdIndex,
      franchiseNameIndex,
      emailIndex,
      phoneIndex,
      passwordIndex,
      passwordHashIndex,
      membershipStatusIndex,
      visibleIndex,
    },
  });

  const requiredHeaders = [
    ['memberId', franchiseIdIndex],
    ['salonName', franchiseNameIndex],
    ['email', emailIndex],
    ['phone', phoneIndex],
  ];
  const missingHeaders = requiredHeaders
    .filter((item) => item[1] === -1)
    .map((item) => item[0]);
  if (missingHeaders.length > 0) {
    throw new Error(`加盟店マスタに必要なヘッダーがありません：${missingHeaders.join('、')}`);
  }

  const records = values.slice(1)
    .map((row, offset) => {
      const rawStatus = membershipStatusIndex === -1 ? '' : String(row[membershipStatusIndex] || '').trim();
      const visible = visibleIndex === -1 ? true : isVisible_(row[visibleIndex]);
      const membershipStatus = normalizeMembershipStatus_(rawStatus, visible);
      const postalCode = postalCodeIndex === -1 ? '' : String(row[postalCodeIndex] || '').trim();
      const address = addressIndex === -1 ? '' : String(row[addressIndex] || '').trim();
      const email = String(row[emailIndex] || '').trim();
      const loginId = loginIdIndex === -1 ? email : String(row[loginIdIndex] || email).trim();
      return {
        franchiseId: String(row[franchiseIdIndex] || '').trim(),
        memberId: String(row[franchiseIdIndex] || '').trim(),
        userId: userIdIndex === -1
          ? String(row[franchiseIdIndex] || '').trim()
          : String(row[userIdIndex] || row[franchiseIdIndex] || '').trim(),
        shopId: shopIdIndex === -1
          ? generateShopIdFromMemberId_(row[franchiseIdIndex])
          : String(row[shopIdIndex] || generateShopIdFromMemberId_(row[franchiseIdIndex]) || '').trim(),
        franchiseName: String(row[franchiseNameIndex] || '').trim(),
        salonName: String(row[franchiseNameIndex] || '').trim(),
        staffId: staffIdIndex === -1 ? '' : String(row[staffIdIndex] || '').trim(),
        displayName: displayNameIndex === -1 ? '' : String(row[displayNameIndex] || '').trim(),
        role: roleIndex === -1 ? 'member' : String(row[roleIndex] || 'member').trim() || 'member',
        rowNumber: offset + 2,
        contactName: contactNameIndex === -1 ? '' : String(row[contactNameIndex] || '').trim(),
        email,
        loginId,
        phone: normalizePhone_(row[phoneIndex]),
        initialPassword: passwordIndex === -1
          ? KCO_DEFAULT_INITIAL_PASSWORD
          : normalizeInitialPasswordValue_(row[passwordIndex]),
        passwordHash: passwordHashIndex === -1 ? '' : normalizePasswordHashValue_(row[passwordHashIndex]),
        postalCode,
        address,
        fullAddress: [postalCode, address].filter(Boolean).join(' '),
        membershipStatus,
        passwordChangedAt: passwordChangedAtIndex === -1 ? '' : row[passwordChangedAtIndex],
        createdAt: createdAtIndex === -1 ? '' : row[createdAtIndex],
        updatedAt: updatedAtIndex === -1 ? '' : row[updatedAtIndex],
        visible: membershipStatus === 'active',
      };
    })
    .filter((franchise) => franchise.visible)
    .filter((franchise) => franchise.franchiseId && franchise.franchiseName);
  logOrderDebug_('getFranchiseMasterRecords result', {
    activeRecordCount: records.length,
    records: records.map((item) => ({
      rowNumber: item.rowNumber,
      franchiseId: item.franchiseId,
      franchiseName: item.franchiseName,
      email: normalizeEmail_(item.email),
      visible: item.visible,
      membershipStatus: item.membershipStatus,
      initialPassword: item.initialPassword,
      hasPasswordHash: Boolean(item.passwordHash),
    })),
  });
  return records;
}

function generateShopIdFromMemberId_(memberId) {
  const normalized = String(memberId || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  return normalized ? `shop-${normalized}` : '';
}

function getVisibleFranchises(sessionToken) {
  const franchise = getSessionFranchise_(sessionToken);
  return [sanitizeFranchise_(franchise)];
}

function findFranchiseById_(franchiseId) {
  const id = String(franchiseId || '').trim();
  if (!id) throw new Error('加盟店を選択してください。');

  const franchise = getFranchiseMasterRecords_()
    .find((item) => item.visible && item.franchiseId === id);
  if (!franchise) {
    throw new Error('加盟店マスタに表示中の加盟店が見つかりません。');
  }
  return franchise;
}

function getUserMasterColumnIndexes_(sheet) {
  const headers = sheet
    .getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1))
    .getValues()[0]
    .map(normalizeMasterHeader_);
  const getIndex = (candidates) => findMasterHeaderIndex_(headers, candidates);
  return {
    userId: getIndex(['userId', 'ユーザーID']),
    shopId: getIndex(['shopId', '店舗ID']),
    staffName: getIndex(['staffName', 'スタッフ名', '担当者名']),
    role: getIndex(['role', '権限']),
    passwordHash: getIndex(['passwordHash', 'パスワードハッシュ']),
    lastLogin: getIndex(['lastLogin', '最終ログイン']),
    createdAt: getIndex(['createdAt', '作成日', '登録日']),
  };
}

function findUserMasterRowByUserId_(userId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateSheet_(ss, KCO_CONFIG.USER_MASTER);
  ensureUserMasterColumns_(sheet);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return null;
  const indexes = getUserMasterColumnIndexes_(sheet);
  const normalizedUserId = String(userId || '').trim();
  const rowIndex = values.slice(1).findIndex(row => String(row[indexes.userId] || '').trim() === normalizedUserId);
  if (rowIndex < 0) return null;
  return { sheet, rowNumber: rowIndex + 2, indexes };
}

function updateUserMasterPasswordHash_(userId, passwordHash) {
  const found = findUserMasterRowByUserId_(userId);
  if (!found || found.indexes.passwordHash === -1) return;
  found.sheet.getRange(found.rowNumber, found.indexes.passwordHash + 1).setValue(passwordHash || '');
}

function updateUserMasterLastLogin_(userId) {
  const found = findUserMasterRowByUserId_(userId);
  if (!found || found.indexes.lastLogin === -1) return;
  found.sheet.getRange(found.rowNumber, found.indexes.lastLogin + 1).setValue(new Date());
}

function normalizeMasterHeader_(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\s\u3000\r\n\t]+/g, '')
    .replace(/[（(].*?[）)]/g, '')
    .replace(/[：:・_\-]/g, '')
    .toLowerCase();
}

function findMasterHeaderIndex_(headers, candidates) {
  const normalizedCandidates = candidates.map(normalizeMasterHeader_);
  return headers.findIndex((header) => (
    header && normalizedCandidates.some((candidate) => (
      header === candidate
      || header.startsWith(candidate)
      || candidate.startsWith(header)
    ))
  ));
}

function normalizeEmail_(value) {
  return String(value === null || value === undefined ? '' : value)
    .normalize('NFKC')
    .trim()
    .toLowerCase();
}

function normalizeLoginIdentifier_(value) {
  return String(value === null || value === undefined ? '' : value)
    .normalize('NFKC')
    .trim()
    .toLowerCase();
}

function isMatchingFranchiseLoginId_(franchise, loginId) {
  const normalizedLoginId = normalizeLoginIdentifier_(loginId);
  if (!normalizedLoginId) return false;
  return normalizeLoginIdentifier_(franchise.loginId || '') === normalizedLoginId
    || (!franchise.loginId && normalizeEmail_(franchise.email) === normalizedLoginId)
    || normalizeLoginIdentifier_(franchise.franchiseId) === normalizedLoginId
    || normalizeLoginIdentifier_(franchise.memberId) === normalizedLoginId;
}

function normalizePhone_(value) {
  return String(value === null || value === undefined ? '' : value)
    .normalize('NFKC')
    .replace(/[^\d]/g, '');
}

function normalizeLoginPassword_(value) {
  return String(value === null || value === undefined ? '' : value)
    .normalize('NFKC')
    .replace(/\s/g, '');
}

function normalizePasswordHashValue_(value) {
  const text = String(value === null || value === undefined ? '' : value).trim();
  if (!text || text === '0' || text === KCO_DEFAULT_INITIAL_PASSWORD) return '';
  return text;
}

function pickFirstDefined_() {
  for (let i = 0; i < arguments.length; i += 1) {
    if (arguments[i] !== undefined && arguments[i] !== null) return arguments[i];
  }
  return '';
}

function normalizeInitialPasswordValue_(value) {
  const password = normalizeLoginPassword_(value);
  if (!password || password === '0' || password === KCO_DEFAULT_INITIAL_PASSWORD) {
    return KCO_DEFAULT_INITIAL_PASSWORD;
  }
  return password;
}

function hashPassword_(password) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    normalizeLoginPassword_(password),
    Utilities.Charset.UTF_8
  );
  return bytes
    .map((byte) => (byte < 0 ? byte + 256 : byte).toString(16).padStart(2, '0'))
    .join('');
}

function isInitialPasswordLogin_(franchise, password) {
  if (franchise.passwordHash) return false;
  const storedInitialPassword = normalizeInitialPasswordValue_(franchise.initialPassword);
  const loginPassword = normalizeLoginPassword_(password);
  return loginPassword === storedInitialPassword
    || (storedInitialPassword === KCO_DEFAULT_INITIAL_PASSWORD && loginPassword === '0');
}

function isValidFranchisePassword_(franchise, password) {
  return getFranchisePasswordCheckResult_(franchise, password).ok;
}

function getFranchisePasswordCheckResult_(franchise, password) {
  const normalizedPassword = normalizeLoginPassword_(password);
  if (!normalizedPassword) {
    return { ok: false, reason: 'empty_password' };
  }
  if (!franchise) {
    return { ok: false, reason: 'missing_franchise' };
  }
  if (franchise.passwordHash) {
    const loginHash = hashPassword_(normalizedPassword);
    return {
      ok: franchise.passwordHash === loginHash,
      reason: franchise.passwordHash === loginHash ? 'changed_password_match' : 'changed_password_mismatch',
      mode: 'passwordHash',
      loginHashPrefix: loginHash.slice(0, 10),
      storedHashPrefix: String(franchise.passwordHash).slice(0, 10),
    };
  }
  const storedInitialPassword = normalizeInitialPasswordValue_(franchise.initialPassword);
  const initialMatch = isInitialPasswordLogin_(franchise, normalizedPassword);
  return {
    ok: initialMatch,
    reason: initialMatch ? 'initial_password_match' : 'initial_password_mismatch',
    mode: 'initialPassword',
    storedInitialPassword,
    normalizedLoginPassword: normalizedPassword,
  };
}

function validateNewPassword_(newPassword, confirmPassword) {
  const password = normalizeLoginPassword_(newPassword);
  const confirmation = normalizeLoginPassword_(confirmPassword);
  if (!password || !confirmation) {
    throw new Error('新しいパスワードと確認用パスワードを入力してください。');
  }
  if (password.length < 4) {
    throw new Error('新しいパスワードは4文字以上で設定してください。');
  }
  if (password !== confirmation) {
    throw new Error('新しいパスワードと確認用パスワードが一致しません。');
  }
}

function getFranchiseMasterColumnIndexes_(sheet) {
  const headers = sheet
    .getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1))
    .getValues()[0]
    .map(normalizeMasterHeader_);
  const getIndex = (candidates) => findMasterHeaderIndex_(headers, candidates);
  return {
    email: getIndex(['email', 'メールアドレス']),
    loginId: getIndex(['loginId', 'ログインID']),
    initialPassword: getIndex(['initialPassword', 'パスワード', 'password']),
    passwordHash: getIndex(['passwordHash', 'パスワードハッシュ']),
    passwordChangedAt: getIndex(['passwordChangedAt', 'パスワード変更日']),
    updatedAt: getIndex(['updatedAt', '更新日']),
  };
}

function updateFranchisePassword_(franchiseId, newPassword) {
  const franchise = findFranchiseById_(franchiseId);
  const sheet = getSheet_(KCO_CONFIG.FRANCHISE_MASTER);
  ensureFranchiseMasterColumns_(sheet);
  const indexes = getFranchiseMasterColumnIndexes_(sheet);
  if (indexes.passwordHash === -1) {
    throw new Error('加盟店マスタに passwordHash 列がありません。初期設定を再実行してください。');
  }

  const now = new Date();
  const passwordHash = hashPassword_(newPassword);
  sheet.getRange(franchise.rowNumber, indexes.passwordHash + 1).setValue(passwordHash);
  updateUserMasterPasswordHash_(franchise.userId, passwordHash);
  if (indexes.initialPassword !== -1) sheet.getRange(franchise.rowNumber, indexes.initialPassword + 1).setValue('');
  if (indexes.passwordChangedAt !== -1) sheet.getRange(franchise.rowNumber, indexes.passwordChangedAt + 1).setValue(now);
  if (indexes.updatedAt !== -1) sheet.getRange(franchise.rowNumber, indexes.updatedAt + 1).setValue(now);
}

function resetFranchisePasswordToInitial_(franchiseId) {
  const franchise = findFranchiseById_(franchiseId);
  const sheet = getSheet_(KCO_CONFIG.FRANCHISE_MASTER);
  ensureFranchiseMasterColumns_(sheet);
  const indexes = getFranchiseMasterColumnIndexes_(sheet);
  const now = new Date();
  if (indexes.initialPassword !== -1) {
    sheet.getRange(franchise.rowNumber, indexes.initialPassword + 1).setValue(KCO_DEFAULT_INITIAL_PASSWORD);
  }
  if (indexes.passwordHash !== -1) {
    sheet.getRange(franchise.rowNumber, indexes.passwordHash + 1).setValue('');
  }
  updateUserMasterPasswordHash_(franchise.userId, '');
  if (indexes.passwordChangedAt !== -1) {
    sheet.getRange(franchise.rowNumber, indexes.passwordChangedAt + 1).setValue('');
  }
  if (indexes.updatedAt !== -1) {
    sheet.getRange(franchise.rowNumber, indexes.updatedAt + 1).setValue(now);
  }
}

function isHeadquartersAdmin_(franchise) {
  if (!franchise) return false;
  const status = String(franchise.membershipStatus || '').normalize('NFKC').trim().toLowerCase();
  if (['headquarters_admin', 'admin', '本部管理者', '管理者'].includes(status)) return true;
  const settings = getNotificationSettings_(SpreadsheetApp.getActiveSpreadsheet());
  const adminEmails = settings.adminEmails.map(normalizeEmail_);
  return Boolean(franchise.email && adminEmails.includes(normalizeEmail_(franchise.email)));
}

function normalizeMembershipStatus_(value, visible) {
  const text = String(value || '').normalize('NFKC').trim().toLowerCase();
  if (['active', '有効', '利用中', '加盟中', 'true', '1'].includes(text)) return 'active';
  if (['inactive', '停止', '停止中', '無効', '退会', 'false', '0'].includes(text)) return 'inactive';
  return visible ? 'active' : 'inactive';
}

function sanitizeFranchise_(franchise) {
  return {
    franchiseId: franchise.franchiseId,
    memberId: franchise.memberId || franchise.franchiseId,
    userId: franchise.userId || franchise.memberId || franchise.franchiseId,
    id: franchise.userId || franchise.memberId || franchise.franchiseId,
    shopId: franchise.shopId || generateShopIdFromMemberId_(franchise.memberId || franchise.franchiseId),
    staffId: franchise.staffId || '',
    displayName: franchise.displayName || franchise.contactName || franchise.franchiseName,
    role: franchise.role || 'member',
    loginId: franchise.loginId || franchise.email || '',
    franchiseName: franchise.franchiseName,
    salonName: franchise.salonName || franchise.franchiseName,
    contactName: franchise.contactName,
    email: franchise.email,
    phone: franchise.phone,
    postalCode: franchise.postalCode || '',
    address: franchise.address,
    fullAddress: franchise.fullAddress || [franchise.postalCode, franchise.address].filter(Boolean).join(' '),
    membershipStatus: franchise.membershipStatus || 'active',
  };
}

function validateOrder_(order) {
  if (!order) throw new Error('注文データがありません。');
  if (!order.sessionToken) throw new Error('ログインの有効期限が切れました。再度ログインしてください。');
  if (!Array.isArray(order.items) || order.items.length === 0) {
    throw new Error('カートに商品を追加してください。');
  }
}

function createOrderNumber_(date, lastRow) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const serial = String(Math.max(lastRow, 1)).padStart(4, '0');
  return `${KCO_CONFIG.ORDER_PREFIX}-${y}${m}${d}-${serial}`;
}

function createProductKey_(category, color) {
  return `${normalize_(category)}::${normalize_(color)}`;
}

function createProductCodeKey_(productCode) {
  return `code::${normalize_(productCode)}`;
}

function getSheet_(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error(`${name} シートが見つかりません。setupKimikeaConnectOrder を実行してください。`);
  return sheet;
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function createIndex_(headers) {
  const index = {};
  headers.forEach((header, i) => {
    index[String(header).trim()] = i;
  });
  return index;
}

function getRowValueByHeader_(row, index, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(index, name)) {
      return row[index[name]];
    }
  }
  return '';
}

function applyHeaderStyle_(sheet, colCount) {
  sheet.getRange(1, 1, 1, colCount)
    .setFontWeight('bold')
    .setBackground('#111111')
    .setFontColor('#ffffff');
  sheet.setFrozenRows(1);
}

function isVisible_(value) {
  const text = String(value || '').trim().toUpperCase();
  return value === true || text === 'TRUE' || text === 'ON' || value === '表示' || value === '表示する';
}

function logOrderDebug_(label, data) {
  try {
    Logger.log(`[KCO DEBUG] ${label}: ${JSON.stringify(data)}`);
  } catch (error) {
    Logger.log(`[KCO DEBUG] ${label}: ${String(data)}`);
  }
}

function normalize_(value) {
  return String(value || '').trim().replace(/\s/g, '').toLowerCase();
}

function showProductCount_() {
  const count = getVisibleProducts_().length;
  SpreadsheetApp.getUi().alert(`Webアプリに表示される商品は ${count} 件です。`);
}
