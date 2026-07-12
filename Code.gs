/**
 * Kimikea Connect Order
 * grow専用 カート形式注文Webアプリ
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
  SETTINGS: '設定',
  ORDER_PREFIX: 'KCO',
  SHIPPING_FREE_BAGS: 5,
  SHIPPING_FEE: 1000,
  PAYMENT_STATUS: ['未入金', '入金済'],
  SHIPPING_STATUS: ['発送準備', '発送済', 'キャンセル'],
  SESSION_SECONDS: 21600,
};

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
  '商品カテゴリー',
  'カラー',
  '仕入価格',
  '販売価格',
  '在庫',
  '表示',
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
  ['grow通知メール', '', 'growへ送る注文メール。複数の場合はカンマ区切り', false],
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
  'salonName',
  'email',
  'phone',
  'postalCode',
  'address',
  'contactName',
  'membershipStatus',
  'createdAt',
  'updatedAt',
];

const KCO_DETAIL_HEADERS = [
  '注文番号',
  '商品カテゴリー',
  'カラー',
  '数量',
  '単価',
  '小計',
  '仕入単価',
  '利益',
];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Kimikea Connect')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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
    .addItem('表示商品を再取得テスト', 'showProductCount_')
    .addToUi();
}

function authorizeDocumentApp() {
  const doc = DocumentApp.create('Kimikea Connect 認証テスト');
  DriveApp.getFileById(doc.getId()).setTrashed(true);
}

function setupKimikeaConnectOrder() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.rename(KCO_CONFIG.SPREADSHEET_NAME);

  setupProductMaster_(ss);
  setupFranchiseMaster_(ss);
  setupOrders_(ss);
  setupOrderDetails_(ss);
  setupSettings_(ss);
  ensureShipmentEditTrigger_(ss);

  SpreadsheetApp.getUi().alert('Kimikea Connect Order 管理表の土台を作成しました。');
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
  const email = normalizeEmail_(credentials && (
    credentials.email
    || credentials.loginEmail
    || credentials.franchiseId
  ));
  const phone = normalizePhone_(credentials && (
    credentials.phone
    || credentials.loginPhone
    || credentials.password
  ));
  if (!email || !phone) {
    throw new Error('メールアドレスと電話番号を入力してください。');
  }

  const franchise = getFranchiseMasterRecords_().find((item) => (
    item.visible
    && item.email
    && item.phone
    && normalizeEmail_(item.email) === email
    && normalizePhone_(item.phone) === phone
  ));
  if (!franchise) {
    throw new Error('メールアドレスまたは電話番号が正しくありません。');
  }

  const sessionToken = Utilities.getUuid();
  CacheService.getScriptCache().put(
    createSessionKey_(sessionToken),
    JSON.stringify({ franchiseId: franchise.franchiseId }),
    KCO_CONFIG.SESSION_SECONDS
  );
  return {
    sessionToken,
    franchise: sanitizeFranchise_(franchise),
  };
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
  return {
    franchise: sanitizeFranchise_(franchise),
    products: getClientProducts_(),
    orderSettings: {
      shippingFee: rules.shippingFee,
      freeShippingBags: rules.freeShippingBags,
    },
    orders: getFranchiseOrders_(franchise.franchiseId),
  };
}

function getVisibleProducts(sessionToken) {
  getSessionFranchise_(sessionToken);
  return getClientProducts_();
}

function getClientProducts_() {
  return getVisibleProducts_().map((product) => ({
    category: product.category,
    color: product.color,
    salesPrice: product.salesPrice,
  }));
}

function getVisibleProducts_() {
  const sheet = getSheet_(KCO_CONFIG.PRODUCT_MASTER);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  const headers = values[0];
  const index = createIndex_(headers);

  return values.slice(1)
    .filter((row) => isVisible_(row[index['表示']]))
    .map((row) => ({
      category: String(row[index['商品カテゴリー']] || ''),
      color: String(row[index['カラー']] || ''),
      purchasePrice: Number(row[index['仕入価格']] || 0),
      salesPrice: Number(row[index['販売価格']] || 0),
      stock: row[index['在庫']],
    }))
    .filter((product) => product.category && product.color && product.salesPrice > 0);
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
  const productMap = getProductMap_();
  const franchise = getSessionFranchise_(order.sessionToken);
  const invoiceSettings = getInvoiceSettings_(ss);
  const orderRules = getOrderRules_(ss);
  validateInvoiceSettings_(invoiceSettings);

  const now = new Date();
  const orderNo = createOrderNumber_(now, ordersSheet.getLastRow());
  let totalBags = 0;
  let productTotal = 0;
  const detailRows = [];

  order.items.forEach((item) => {
    const key = createProductKey_(item.category, item.color);
    const product = productMap[key];
    if (!product) {
      throw new Error(`商品マスタに見つかりません: ${item.category} / ${item.color}`);
    }

    const qty = Number(item.quantity || 0);
    if (qty <= 0) return;

    const subtotal = product.salesPrice * qty;
    const profit = (product.salesPrice - product.purchasePrice) * qty;
    totalBags += qty;
    productTotal += subtotal;

    detailRows.push([
      orderNo,
      product.category,
      product.color,
      qty,
      product.salesPrice,
      subtotal,
      product.purchasePrice,
      profit,
    ]);
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
    franchiseAddress: franchise.address,
    note: order.note || '',
    details: detailRows,
    totalBags,
    shippingFee,
    productTotal,
    invoiceTotal,
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
    sheet.getRange(2, 3, rows.length, 2).setNumberFormat('¥#,##0');
  }
  applyHeaderStyle_(sheet, KCO_PRODUCT_HEADERS.length);
  sheet.autoResizeColumns(1, KCO_PRODUCT_HEADERS.length);
}

function createProductRows_(category, colors) {
  const price = KCO_CATEGORY_PRICES[category];
  return colors.map((color) => [
    category,
    color,
    price.purchasePrice,
    price.salesPrice,
    100,
    true,
  ]);
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
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, KCO_DETAIL_HEADERS.length).setValues([KCO_DETAIL_HEADERS]);
  }
  applyHeaderStyle_(sheet, KCO_DETAIL_HEADERS.length);
  sheet.autoResizeColumns(1, KCO_DETAIL_HEADERS.length);
}

function setupFranchiseMaster_(ss) {
  const sheet = getOrCreateSheet_(ss, KCO_CONFIG.FRANCHISE_MASTER);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, KCO_FRANCHISE_HEADERS.length).setValues([KCO_FRANCHISE_HEADERS]);
    sheet.getRange(2, 1, 1, KCO_FRANCHISE_HEADERS.length).setValues([
      ['K-1', 'TEAM hair', '', '', '', '', '', 'active', new Date(), new Date()],
    ]);
  } else {
    ensureFranchiseMasterColumns_(sheet);
    migrateProductionFranchiseRows_(sheet);
  }
  applyHeaderStyle_(sheet, KCO_FRANCHISE_HEADERS.length);
  sheet.autoResizeColumns(1, KCO_FRANCHISE_HEADERS.length);
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
  if (values.length <= 1) {
    sheet.getRange(2, 1, 1, KCO_FRANCHISE_HEADERS.length).setValues([
      ['K-1', 'TEAM hair', '', '', '', '', '', 'active', new Date(), new Date()],
    ]);
    return;
  }

  const headers = values[0].map(normalizeMasterHeader_);
  const getIndex = (candidates) => findMasterHeaderIndex_(headers, candidates);
  const memberIdIndex = getIndex(['memberId', '加盟店ID']);
  const salonNameIndex = getIndex(['salonName', '加盟店名']);
  const emailIndex = getIndex(['email', 'メールアドレス']);
  const phoneIndex = getIndex(['phone', '電話', '電話番号']);
  const statusIndex = getIndex(['membershipStatus', '会員ステータス', '加盟店ステータス', 'ステータス']);
  const visibleIndex = getIndex(['表示']);
  const updatedAtIndex = getIndex(['updatedAt', '更新日']);

  let hasTeamHair = false;
  values.slice(1).forEach((row, offset) => {
    const rowNumber = offset + 2;
    const memberId = memberIdIndex === -1 ? '' : String(row[memberIdIndex] || '').trim();
    const salonName = salonNameIndex === -1 ? '' : String(row[salonNameIndex] || '').trim();
    const email = emailIndex === -1 ? '' : String(row[emailIndex] || '').trim();
    const isTestRow = salonName === 'テスト加盟店' || email === 'test@example.com';

    if (memberId === 'K-1') {
      hasTeamHair = true;
      if (salonNameIndex !== -1) sheet.getRange(rowNumber, salonNameIndex + 1).setValue('TEAM hair');
      if (statusIndex !== -1) sheet.getRange(rowNumber, statusIndex + 1).setValue('active');
      if (visibleIndex !== -1) sheet.getRange(rowNumber, visibleIndex + 1).setValue(true);
      if (updatedAtIndex !== -1) sheet.getRange(rowNumber, updatedAtIndex + 1).setValue(new Date());
    }

    if (isTestRow) {
      if (statusIndex !== -1) sheet.getRange(rowNumber, statusIndex + 1).setValue('inactive');
      if (visibleIndex !== -1) sheet.getRange(rowNumber, visibleIndex + 1).setValue(false);
      if (updatedAtIndex !== -1) sheet.getRange(rowNumber, updatedAtIndex + 1).setValue(new Date());
    }
  });

  if (!hasTeamHair) {
    const newRow = new Array(sheet.getLastColumn()).fill('');
    if (memberIdIndex !== -1) newRow[memberIdIndex] = 'K-1';
    if (salonNameIndex !== -1) newRow[salonNameIndex] = 'TEAM hair';
    if (statusIndex !== -1) newRow[statusIndex] = 'active';
    if (visibleIndex !== -1) newRow[visibleIndex] = true;
    const createdAtIndex = getIndex(['createdAt', '作成日', '登録日']);
    if (createdAtIndex !== -1) newRow[createdAtIndex] = new Date();
    if (updatedAtIndex !== -1) newRow[updatedAtIndex] = new Date();
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, newRow.length).setValues([newRow]);
  }
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
  }
}

function sendOrderNotificationEmails_(ss, summary, invoiceSettings, orderRules) {
  const settings = getNotificationSettings_(ss);
  const subject = `【Kimikea Connect Order】注文受付 ${summary.orderNo}`;
  const adminBody = buildOrderEmailBody_(summary);
  const franchiseBody = buildFranchiseEmailBody_(summary, invoiceSettings);
  const invoicePdf = createInvoicePdf_(summary, invoiceSettings, orderRules);

  sendMailList_(settings.adminEmails, subject, adminBody, [invoicePdf], settings.senderName);
  if (settings.sendFranchiseEmail && summary.franchiseEmail) {
    sendMailList_([summary.franchiseEmail], subject, franchiseBody, [invoicePdf], settings.senderName);
  }
  if (settings.sendGrowEmail) {
    sendMailList_(settings.growEmails, subject, adminBody, [], settings.senderName);
  }
}

function getNotificationSettings_(ss) {
  const sheet = ss.getSheetByName(KCO_CONFIG.SETTINGS);
  const settings = {
    adminEmails: [],
    senderName: 'Kimikea Connect Order',
    sendFranchiseEmail: true,
    sendGrowEmail: false,
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
    if (item === 'grow通知メール' && enabled) {
      settings.sendGrowEmail = true;
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
  return summary.details.map((row) => [
    `${row[1]} / ${row[2]}`,
    `数量：${row[3]}袋`,
    `単価：${formatYen_(row[4])}`,
    `小計：${formatYen_(row[5])}`,
  ].join('\n')).join('\n---\n');
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

function sendMailList_(emails, subject, body, attachments, senderName) {
  const uniqueEmails = Array.from(new Set((emails || []).filter(Boolean)));
  uniqueEmails.forEach((email) => {
    MailApp.sendEmail({
      to: email,
      subject,
      body,
      attachments: attachments || [],
      name: senderName || 'Kimikea Connect Order',
    });
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
  return String(value || '')
    .split(/[,、\n]/)
    .map((email) => email.trim())
    .filter(Boolean);
}

function isTruthy_(value) {
  const text = String(value || '').trim().toUpperCase();
  return value === true || text === 'TRUE' || text === 'ON' || text === 'YES' || text === '1' || text === '送信';
}

function formatYen_(value) {
  return `¥${Number(value || 0).toLocaleString('ja-JP')}`;
}

function getProductMap_() {
  const products = getVisibleProducts_();
  const map = {};
  products.forEach((product) => {
    map[createProductKey_(product.category, product.color)] = product;
  });
  return map;
}

function createSessionKey_(sessionToken) {
  return `KCO_SESSION_${String(sessionToken || '').trim()}`;
}

function getSessionFranchise_(sessionToken) {
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
    JSON.stringify({ franchiseId: franchise.franchiseId }),
    KCO_CONFIG.SESSION_SECONDS
  );
  return franchise;
}

function getFranchiseOrders_(franchiseId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ordersSheet = ss.getSheetByName(KCO_CONFIG.ORDERS);
  const detailsSheet = ss.getSheetByName(KCO_CONFIG.ORDER_DETAILS);
  if (!ordersSheet || ordersSheet.getLastRow() <= 1) return [];

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
        category: String(row[detailIndex['商品カテゴリー']] || ''),
        color: String(row[detailIndex['カラー']] || ''),
        quantity: Number(row[detailIndex['数量']] || 0),
        unitPrice: Number(row[detailIndex['単価']] || 0),
        subtotal: Number(row[detailIndex['小計']] || 0),
      });
    });
  }

  return orderValues.slice(1)
    .filter((row) => String(row[orderIndex['加盟店ID']] || '').trim() === franchiseId)
    .map((row) => {
      const orderNo = String(row[orderIndex['注文番号']] || '');
      const orderDate = row[orderIndex['注文日時']];
      return {
        orderNo,
        orderDate: orderDate instanceof Date
          ? Utilities.formatDate(orderDate, Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm')
          : String(orderDate || ''),
        totalBags: Number(row[orderIndex['合計袋数']] || 0),
        shippingFee: Number(row[orderIndex['送料']] || 0),
        productTotal: Number(row[orderIndex['商品合計']] || 0),
        invoiceTotal: Number(row[orderIndex['請求合計']] || 0),
        shippingStatus: String(row[orderIndex['発送状況']] || '発送準備'),
        note: String(row[orderIndex['備考']] || ''),
        items: detailsByOrder[orderNo] || [],
      };
    })
    .reverse();
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
    && String(row[orderIndex['加盟店ID']] || '').trim() === franchise.franchiseId
  ));
  if (!orderRow) throw new Error('注文履歴が見つかりません。');

  const detailValues = detailsSheet.getDataRange().getValues();
  const detailIndex = createIndex_(detailValues[0]);
  const detailRows = detailValues.slice(1)
    .filter((row) => String(row[detailIndex['注文番号']] || '') === targetOrderNo)
    .map((row) => [
      targetOrderNo,
      row[detailIndex['商品カテゴリー']],
      row[detailIndex['カラー']],
      Number(row[detailIndex['数量']] || 0),
      Number(row[detailIndex['単価']] || 0),
      Number(row[detailIndex['小計']] || 0),
      Number(row[detailIndex['仕入単価']] || 0),
      Number(row[detailIndex['利益']] || 0),
    ]);

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
    shippingFee: Number(orderRow[orderIndex['送料']] || 0),
    productTotal: Number(orderRow[orderIndex['商品合計']] || 0),
    invoiceTotal: Number(orderRow[orderIndex['請求合計']] || 0),
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
  const franchiseNameIndex = findHeaderIndex(['salonName', '加盟店名']);
  const emailIndex = findHeaderIndex(['email', 'メールアドレス']);
  const phoneIndex = findHeaderIndex(['phone', '電話', '電話番号']);
  const postalCodeIndex = findHeaderIndex(['postalCode', '郵便番号']);
  const addressIndex = findHeaderIndex(['address', '住所']);
  const contactNameIndex = findHeaderIndex(['contactName', '担当者', '担当者名']);
  const membershipStatusIndex = findHeaderIndex(['membershipStatus', '会員ステータス', '加盟店ステータス', 'ステータス']);
  const createdAtIndex = findHeaderIndex(['createdAt', '作成日', '登録日']);
  const updatedAtIndex = findHeaderIndex(['updatedAt', '更新日']);
  const visibleIndex = findHeaderIndex(['表示']);

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

  return values.slice(1)
    .map((row) => {
      const rawStatus = membershipStatusIndex === -1 ? '' : String(row[membershipStatusIndex] || '').trim();
      const visible = visibleIndex === -1 ? true : isVisible_(row[visibleIndex]);
      const membershipStatus = normalizeMembershipStatus_(rawStatus, visible);
      const postalCode = postalCodeIndex === -1 ? '' : String(row[postalCodeIndex] || '').trim();
      const address = addressIndex === -1 ? '' : String(row[addressIndex] || '').trim();
      return {
        franchiseId: String(row[franchiseIdIndex] || '').trim(),
        memberId: String(row[franchiseIdIndex] || '').trim(),
        franchiseName: String(row[franchiseNameIndex] || '').trim(),
        salonName: String(row[franchiseNameIndex] || '').trim(),
        contactName: contactNameIndex === -1 ? '' : String(row[contactNameIndex] || '').trim(),
        email: String(row[emailIndex] || '').trim(),
        phone: normalizePhone_(row[phoneIndex]),
        postalCode,
        address,
        fullAddress: [postalCode, address].filter(Boolean).join(' '),
        membershipStatus,
        createdAt: createdAtIndex === -1 ? '' : row[createdAtIndex],
        updatedAt: updatedAtIndex === -1 ? '' : row[updatedAtIndex],
        visible: membershipStatus === 'active',
      };
    })
    .filter((franchise) => franchise.visible)
    .filter((franchise) => franchise.franchiseId && franchise.franchiseName);
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
  return String(value || '').trim().toLowerCase();
}

function normalizePhone_(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[^\d]/g, '');
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

function normalize_(value) {
  return String(value || '').trim().replace(/\s/g, '').toLowerCase();
}

function showProductCount_() {
  const count = getVisibleProducts_().length;
  SpreadsheetApp.getUi().alert(`Webアプリに表示される商品は ${count} 件です。`);
}
