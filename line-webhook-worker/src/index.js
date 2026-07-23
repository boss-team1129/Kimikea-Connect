const LINE_REPLY_ENDPOINT = 'https://api.line.me/v2/bot/message/reply';
const LINE_PUSH_ENDPOINT = 'https://api.line.me/v2/bot/message/push';
const DEFAULT_KIMIKEA_CONNECT_URL = 'https://boss-team1129.github.io/Kimikea-Connect/index.html';
const DEFAULT_ORDER_API_URL = 'https://script.google.com/macros/s/AKfycbyWxvyWZ7_qTkCgvkuim-h_AhDQEHag7xexg8iDqyHE-toaRA6ttQPpNjUaNfTyTYhA/exec';
const LINE_MENU_ITEMS = [
  { label: 'エクステを注文する', view: 'order' },
  { label: 'スタイル図鑑を見る', view: 'stylebook' },
  { label: 'カラーチャートを見る', view: 'color-chart' },
  { label: '講習を見る', view: 'academy' },
  { label: '加盟店マップ', view: 'map' },
  { label: 'AI診断をする', view: 'ai-diagnosis' },
];

export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);
    if (request.method === 'GET') {
      return jsonResponse({
        ok: true,
        app: 'Kimikea LINE Webhook Worker',
        message: 'Webhook is ready.',
      });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'Method Not Allowed' }, 405);
    }

    if (requestUrl.pathname === '/order-notification') {
      return handleOrderNotificationRequest(request, env);
    }

    const rawBody = await request.text();
    const signature = request.headers.get('x-line-signature') || '';

    if (!env.LINE_CHANNEL_SECRET || !env.LINE_CHANNEL_ACCESS_TOKEN) {
      return jsonResponse({ ok: false, error: 'LINE secrets are not configured.' }, 500);
    }

    const isValidSignature = await verifyLineSignature(
      rawBody,
      signature,
      env.LINE_CHANNEL_SECRET
    );

    if (!isValidSignature) {
      return jsonResponse({ ok: false, error: 'Invalid signature.' }, 401);
    }

    let payload;
    try {
      payload = JSON.parse(rawBody || '{}');
    } catch (error) {
      return jsonResponse({ ok: false, error: 'Invalid JSON payload.' }, 400);
    }

    const events = Array.isArray(payload.events) ? payload.events : [];

    if (events.length === 0) {
      return jsonResponse({ ok: true, handled: 0 });
    }

    const connectUrl = normalizeBaseUrl(env.KIMIKEA_CONNECT_URL || DEFAULT_KIMIKEA_CONNECT_URL);
    const orderApiUrl = normalizeBaseUrl(env.ORDER_API_URL || DEFAULT_ORDER_API_URL);
    const replyResults = [];

    for (const event of events) {
      const result = await handleLineEvent(event, env.LINE_CHANNEL_ACCESS_TOKEN, connectUrl, orderApiUrl);
      replyResults.push(result);
    }

    return jsonResponse({
      ok: true,
      handled: events.length,
      replies: replyResults,
    });
  },
};

export async function handleLineEvent(event, channelAccessToken, connectUrl, orderApiUrl = DEFAULT_ORDER_API_URL) {
  if (!event || event.type !== 'message' || !event.replyToken) {
    return { skipped: true, reason: 'unsupported event' };
  }

  const message = event.message || {};
  let replyMessage;
  if (message.type === 'text') {
    const text = message.text || '';
    const linkToken = parseLineLinkToken(text);
    if (linkToken || isLineLinkCommandText(text)) {
      if (!linkToken) {
        replyMessage = buildLineLinkFormatErrorMessage();
      } else if (!event.source || !event.source.userId) {
        replyMessage = {
          type: 'text',
          text: 'LINEユーザー情報を確認できませんでした。LINE公式アカウントとの1対1トークで、もう一度「連携 コード」を送信してください。',
        };
      } else {
        replyMessage = await buildLineLinkResultMessage(linkToken, event.source.userId, orderApiUrl);
      }
    } else {
      replyMessage = buildReplyMessageForText(text, connectUrl);
    }
  } else {
    replyMessage = buildDefaultGuideMessage(connectUrl);
  }

  const response = await fetch(LINE_REPLY_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${channelAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      replyToken: event.replyToken,
      messages: [replyMessage],
    }),
  });

  const responseText = await response.text();

  if (!response.ok) {
    console.error('LINE reply failed', {
      status: response.status,
      body: responseText,
    });
  }

  return {
    replied: response.ok,
    status: response.status,
  };
}

async function handleOrderNotificationRequest(request, env) {
  const providedSecret = request.headers.get('x-kimikea-notify-secret') || '';
  const expectedSecret = env.LINE_ORDER_NOTIFY_SECRET || '';
  if (!expectedSecret || !timingSafeEqual(providedSecret, expectedSecret)) {
    return jsonResponse({ ok: false, error: 'Unauthorized.' }, 401);
  }
  if (!env.LINE_CHANNEL_ACCESS_TOKEN) {
    return jsonResponse({ ok: false, error: 'LINE channel access token is not configured.' }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return jsonResponse({ ok: false, error: 'Invalid JSON payload.' }, 400);
  }

  if (payload.type !== 'orderAccepted') {
    return jsonResponse({ ok: false, error: 'Unsupported notification type.' }, 400);
  }

  const lineUserId = String(payload.lineUserId || '').trim();
  if (!lineUserId) {
    return jsonResponse({ ok: false, error: 'lineUserId is required.' }, 400);
  }

  const connectUrl = normalizeBaseUrl(env.KIMIKEA_CONNECT_URL || DEFAULT_KIMIKEA_CONNECT_URL);
  const message = buildOrderAcceptedMessage(payload, connectUrl);
  const response = await fetch(LINE_PUSH_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [message],
    }),
  });
  const responseText = await response.text();
  if (!response.ok) {
    return jsonResponse({
      ok: false,
      status: response.status,
      error: responseText,
    }, 502);
  }

  return jsonResponse({
    ok: true,
    status: response.status,
  });
}

export function buildOrderAcceptedMessage(payload, connectUrl = DEFAULT_KIMIKEA_CONNECT_URL) {
  const orderId = String(payload.orderId || '').trim();
  const orderedAt = String(payload.orderedAt || '').trim();
  const totalAmount = Number(payload.totalAmount || 0);
  const invoiceUrl = sanitizeHttpsUrl(payload.invoiceUrl || '');
  const items = Array.isArray(payload.items) ? payload.items : [];
  const itemLines = items.length
    ? items.slice(0, 12).map((item) => {
      const category = String(item.category || '').trim();
      const colorName = String(item.colorName || item.color || '').trim();
      const productCode = String(item.productCode || '').trim();
      const quantity = Number(item.quantity || 0);
      return `${category || 'カラー'} / ${colorName || '名称未設定'} / ${productCode || '-'} × ${quantity}`;
    }).join('\n')
    : '明細を確認中です';
  const invoiceNote = invoiceUrl
    ? '請求書は、ご登録のメールアドレスへ送信します。'
    : '請求書は、ご登録のメールアドレスへ送信します。\n請求書はメール送信後に確認できます。';

  return {
    type: 'flex',
    altText: `注文受付通知 ${orderId || ''}`.trim(),
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '20px',
        backgroundColor: '#FFFDF8',
        contents: [
          {
            type: 'text',
            text: '📦 ご注文ありがとうございます',
            weight: 'bold',
            size: 'lg',
            color: '#2A2118',
            wrap: true,
          },
          {
            type: 'text',
            text: 'ご注文を受け付けました。',
            size: 'sm',
            color: '#6D604F',
            wrap: true,
          },
          {
            type: 'box',
            layout: 'vertical',
            spacing: 'xs',
            margin: 'md',
            contents: [
              buildFlexText(`注文番号：${orderId || '-'}`, true),
              buildFlexText(`注文日：${orderedAt || '-'}`, false),
            ],
          },
          {
            type: 'text',
            text: `【注文内容】\n${itemLines}`,
            size: 'sm',
            color: '#2A2118',
            wrap: true,
            margin: 'md',
          },
          {
            type: 'text',
            text: `合計金額：${formatYen(totalAmount)}円`,
            weight: 'bold',
            size: 'md',
            color: '#B17522',
            wrap: true,
          },
          {
            type: 'text',
            text: invoiceNote,
            size: 'xs',
            color: '#7A6A55',
            wrap: true,
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '16px',
        backgroundColor: '#FFFDF8',
        contents: [
          buildUriButton('注文履歴を見る', buildKimikeaUrlWithParams(connectUrl, 'mypage', { tab: 'orders' }), true),
          buildUriButton('追加注文する', buildKimikeaUrl(connectUrl, 'order'), false),
          invoiceUrl
            ? buildUriButton('請求書を確認する', invoiceUrl, false)
            : buildUriButton('請求書を確認する', buildKimikeaUrlWithParams(connectUrl, 'mypage', { tab: 'orders' }), false),
          {
            type: 'button',
            style: 'secondary',
            height: 'sm',
            color: '#F2E8D4',
            action: {
              type: 'message',
              label: '問い合わせる',
              text: `注文番号：${orderId || ''}について問い合わせ`,
            },
          },
        ],
      },
      styles: {
        footer: {
          separator: true,
          separatorColor: '#E8D8B8',
        },
      },
    },
  };
}

function buildFlexText(text, bold) {
  return {
    type: 'text',
    text,
    size: 'sm',
    weight: bold ? 'bold' : 'regular',
    color: '#2A2118',
    wrap: true,
  };
}

function buildUriButton(label, uri, primary) {
  return {
    type: 'button',
    style: primary ? 'primary' : 'secondary',
    height: 'sm',
    color: primary ? '#B78A35' : '#F2E8D4',
    action: {
      type: 'uri',
      label,
      uri,
    },
  };
}

async function buildLineLinkResultMessage(token, lineUserId, orderApiUrl) {
  try {
    const result = await callOrderApiJsonp(orderApiUrl, 'linkLineAccountByToken', [token, lineUserId]);
    return {
      type: 'text',
      text: `LINE連携が完了しました。\n${result.salonName || 'Kimikea Connect'} の注文受付通知をLINEで受け取れます。`,
    };
  } catch (error) {
    return {
      type: 'text',
      text: `LINE連携に失敗しました。\n${error && error.message ? error.message : String(error)}\n\nKimikea Connectのマイページから連携コードを再発行してください。`,
    };
  }
}

async function callOrderApiJsonp(orderApiUrl, api, args) {
  const callbackName = '__kimikeaLineWebhook';
  const url = new URL(orderApiUrl || DEFAULT_ORDER_API_URL);
  url.searchParams.set('api', api);
  url.searchParams.set('args', JSON.stringify(args || []));
  url.searchParams.set('callback', callbackName);
  url.searchParams.set('v', String(Date.now()));
  const response = await fetch(url.toString(), { method: 'GET' });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Order API error: ${response.status}`);
  }
  const match = text.match(new RegExp(`^${callbackName}\\((.*)\\);?$`, 's'));
  if (!match) {
    throw new Error('Order APIの応答形式を確認できませんでした。');
  }
  const payload = JSON.parse(match[1]);
  if (!payload || !payload.ok) {
    throw new Error((payload && payload.error) || '連携処理に失敗しました。');
  }
  return payload.data || {};
}

export function parseLineLinkToken(text) {
  const normalized = String(text || '').normalize('NFKC').trim();
  const match = normalized.match(/^(?:LINE)?連携[\s:：　-]*([A-Z0-9]{6,16})$/i);
  return match ? match[1].toUpperCase() : '';
}

export function isLineLinkCommandText(text) {
  return /^(?:LINE)?連携(?:\s|$|[:：-])/i.test(String(text || '').normalize('NFKC').trim());
}

function buildLineLinkFormatErrorMessage() {
  return {
    type: 'text',
    text: 'LINE連携コードを確認できませんでした。\nKimikea Connectのマイページで発行した文章を、そのまま送信してください。\n\n例：連携 ABC123',
  };
}

export function buildReplyMessageForText(messageText, connectUrl = DEFAULT_KIMIKEA_CONNECT_URL) {
  const normalizedText = normalizeText(messageText);

  if (containsAny(normalizedText, ['注文', '注文したい', 'エクステ注文'])) {
    return buildSingleFeatureMessage(
      'エクステ注文',
      'Kimikea Connectの注文ページを開きます。',
      '注文ページを開く',
      buildKimikeaUrl(connectUrl, 'order')
    );
  }

  if (containsAny(normalizedText, ['AI診断', '診断', '似合うエクステ'])) {
    return buildSingleFeatureMessage(
      'AI診断',
      '質問診断と写真シミュレーターから、似合うエクステを探せます。',
      'AI診断を開く',
      buildKimikeaUrl(connectUrl, 'ai-diagnosis')
    );
  }

  if (containsAny(normalizedText, ['スタイル図鑑', '図鑑', 'スタイル', '作品', 'デザイン'])) {
    return buildSingleFeatureMessage(
      'スタイル図鑑',
      '施術写真やデザイン、使用カラーを確認できます。',
      'スタイル図鑑を見る',
      buildKimikeaUrl(connectUrl, 'stylebook')
    );
  }

  if (containsAny(normalizedText, ['カラーチャート', 'カラー', '色を見る', '色一覧'])) {
    return buildSingleFeatureMessage(
      'カラーチャート',
      'GROWカラーを画像付きで確認できます。',
      'カラーを見る',
      buildKimikeaUrl(connectUrl, 'color-chart')
    );
  }

  if (containsAny(normalizedText, ['講習', '講習日', 'スクール'])) {
    return buildSingleFeatureMessage(
      '講習案内',
      '講習内容・日程・受講案内を確認できます。',
      '講習案内を見る',
      buildKimikeaUrl(connectUrl, 'academy')
    );
  }

  if (containsAny(normalizedText, ['加盟店', '近くのサロン', 'マップ'])) {
    return buildSingleFeatureMessage(
      '加盟店マップ',
      'お近くの加盟店・コーディネーターを探せます。',
      '加盟店マップを見る',
      buildKimikeaUrl(connectUrl, 'map')
    );
  }

  return buildDefaultGuideMessage(connectUrl);
}

export function buildDefaultGuideMessage(connectUrl = DEFAULT_KIMIKEA_CONNECT_URL) {
  return {
    type: 'flex',
    altText: 'Kimikea Connectのご案内',
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '20px',
        backgroundColor: '#FFFDF8',
        contents: [
          {
            type: 'text',
            text: 'Kimikea Connect',
            weight: 'bold',
            size: 'lg',
            color: '#2A2118',
          },
          {
            type: 'text',
            text: 'ご希望のメニューをお選びください。',
            size: 'sm',
            color: '#7A6A55',
            wrap: true,
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '16px',
        backgroundColor: '#FFFDF8',
        contents: LINE_MENU_ITEMS.map((item) => ({
          type: 'button',
          style: item.view === 'order' ? 'primary' : 'secondary',
          height: 'sm',
          color: item.view === 'order' ? '#B78A35' : '#F2E8D4',
          action: {
            type: 'uri',
            label: item.label,
            uri: buildKimikeaUrl(connectUrl, item.view),
          },
        })),
      },
      styles: {
        footer: {
          separator: true,
          separatorColor: '#E8D8B8',
        },
      },
    },
  };
}

export function buildSingleFeatureMessage(title, text, label, uri) {
  return {
    type: 'flex',
    altText: `${title}を開く`,
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '20px',
        backgroundColor: '#FFFDF8',
        contents: [
          {
            type: 'text',
            text: title,
            weight: 'bold',
            size: 'lg',
            color: '#2A2118',
          },
          {
            type: 'text',
            text,
            size: 'sm',
            color: '#7A6A55',
            wrap: true,
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '16px',
        backgroundColor: '#FFFDF8',
        contents: [
          {
            type: 'button',
            style: 'primary',
            height: 'sm',
            color: '#B78A35',
            action: {
              type: 'uri',
              label,
              uri,
            },
          },
        ],
      },
      styles: {
        footer: {
          separator: true,
          separatorColor: '#E8D8B8',
        },
      },
    },
  };
}

export function buildSingleButtonMessage(title, text, label, uri) {
  return {
    type: 'template',
    altText: `${title}を開く`,
    template: {
      type: 'buttons',
      title,
      text,
      actions: [
        {
          type: 'uri',
          label,
          uri,
        },
      ],
    },
  };
}

export async function verifyLineSignature(rawBody, signature, channelSecret) {
  if (!signature || !channelSecret) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(rawBody)
  );
  const expectedSignature = arrayBufferToBase64(digest);

  return timingSafeEqual(expectedSignature, signature);
}

export function buildKimikeaUrl(connectUrl, view) {
  const baseUrl = normalizeBaseUrl(connectUrl || DEFAULT_KIMIKEA_CONNECT_URL);
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}view=${encodeURIComponent(view)}`;
}

export function buildKimikeaUrlWithParams(connectUrl, view, params = {}) {
  const url = new URL(normalizeBaseUrl(connectUrl || DEFAULT_KIMIKEA_CONNECT_URL));
  url.searchParams.set('view', view);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

function sanitizeHttpsUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return '';
    return url.toString();
  } catch (error) {
    return '';
  }
}

function formatYen(value) {
  return Number(value || 0).toLocaleString('ja-JP');
}

export function normalizeBaseUrl(value) {
  return String(value || DEFAULT_KIMIKEA_CONNECT_URL).trim();
}

export function normalizeText(value) {
  return String(value || '')
    .replace(/\u3000/g, ' ')
    .trim()
    .toLowerCase();
}

function containsAny(text, keywords) {
  return keywords.some((keyword) => text.includes(normalizeText(keyword)));
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function timingSafeEqual(left, right) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;

  let diff = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= leftBytes[index] ^ rightBytes[index];
  }

  return diff === 0;
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}
