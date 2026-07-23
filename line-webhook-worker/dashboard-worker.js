const LINE_REPLY_ENDPOINT = 'https://api.line.me/v2/bot/message/reply';
const DEFAULT_KIMIKEA_CONNECT_URL = 'https://boss-team1129.github.io/Kimikea-Connect/index.html';
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
    const replyResults = [];

    for (const event of events) {
      const result = await handleLineEvent(event, env.LINE_CHANNEL_ACCESS_TOKEN, connectUrl);
      replyResults.push(result);
    }

    return jsonResponse({
      ok: true,
      handled: events.length,
      replies: replyResults,
    });
  },
};

async function handleLineEvent(event, channelAccessToken, connectUrl) {
  if (!event || event.type !== 'message' || !event.replyToken) {
    return { skipped: true, reason: 'unsupported event' };
  }

  const message = event.message || {};
  const replyMessage = message.type === 'text'
    ? buildReplyMessageForText(message.text || '', connectUrl)
    : buildDefaultGuideMessage(connectUrl);

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

function buildReplyMessageForText(messageText, connectUrl = DEFAULT_KIMIKEA_CONNECT_URL) {
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

function buildDefaultGuideMessage(connectUrl = DEFAULT_KIMIKEA_CONNECT_URL) {
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

function buildSingleFeatureMessage(title, text, label, uri) {
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

function buildSingleButtonMessage(title, text, label, uri) {
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

async function verifyLineSignature(rawBody, signature, channelSecret) {
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

function buildKimikeaUrl(connectUrl, view) {
  const baseUrl = normalizeBaseUrl(connectUrl || DEFAULT_KIMIKEA_CONNECT_URL);
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}view=${encodeURIComponent(view)}`;
}

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_KIMIKEA_CONNECT_URL).trim();
}

function normalizeText(value) {
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
