import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildKimikeaUrl,
  buildKimikeaUrlWithParams,
  buildOrderAcceptedMessage,
  buildReplyMessageForText,
  isLineLinkCommandText,
  parseLineLinkToken,
  verifyLineSignature,
} from '../src/index.js';
import worker from '../src/index.js';

const baseUrl = 'https://boss-team1129.github.io/Kimikea-Connect/index.html';

test('builds direct Kimikea Connect urls', () => {
  assert.equal(
    buildKimikeaUrl(baseUrl, 'order'),
    'https://boss-team1129.github.io/Kimikea-Connect/index.html?view=order'
  );
  assert.equal(
    buildKimikeaUrl(`${baseUrl}?utm=line`, 'map'),
    'https://boss-team1129.github.io/Kimikea-Connect/index.html?utm=line&view=map'
  );
  assert.equal(
    buildKimikeaUrlWithParams(baseUrl, 'mypage', { tab: 'orders' }),
    'https://boss-team1129.github.io/Kimikea-Connect/index.html?view=mypage&tab=orders'
  );
});

test('parses one time LINE link tokens', () => {
  assert.equal(parseLineLinkToken('連携 ABC123'), 'ABC123');
  assert.equal(parseLineLinkToken('連携　abc123'), 'ABC123');
  assert.equal(parseLineLinkToken('連携 7DBEED3B'), '7DBEED3B');
  assert.equal(parseLineLinkToken('LINE連携:7DBEED3B'), '7DBEED3B');
  assert.equal(parseLineLinkToken('連携-7DBEED3B'), '7DBEED3B');
  assert.equal(parseLineLinkToken('連携'), '');
  assert.equal(isLineLinkCommandText('連携 7DBEED3B'), true);
  assert.equal(isLineLinkCommandText('連携'), true);
  assert.equal(isLineLinkCommandText('こんにちは'), false);
});

test('builds order accepted LINE message', () => {
  const message = buildOrderAcceptedMessage({
    orderId: 'ORD-TEST-001',
    orderedAt: '2026/07/23 12:00',
    totalAmount: 12345,
    items: [
      { category: 'ダークカラー', colorName: 'NB', productCode: 'DC002', quantity: 2 },
    ],
  }, baseUrl);
  assert.equal(message.type, 'flex');
  assert.equal(message.contents.body.contents[0].text, '📦 ご注文ありがとうございます');
  assert.match(message.contents.body.contents[3].text, /DC002 × 2/);
  assert.equal(message.contents.footer.contents.length, 4);
  assert.equal(message.contents.footer.contents[0].action.uri, `${baseUrl}?view=mypage&tab=orders`);
});

test('routes order keywords to order page', () => {
  const message = buildReplyMessageForText('エクステ注文をお願いします', baseUrl);
  assert.equal(message.type, 'flex');
  assert.equal(message.contents.body.contents[0].text, 'エクステ注文');
  assert.equal(message.contents.footer.contents[0].action.uri, `${baseUrl}?view=order`);
});

test('routes diagnosis keywords to AI diagnosis page', () => {
  const message = buildReplyMessageForText('似合うエクステを診断したい', baseUrl);
  assert.equal(message.type, 'flex');
  assert.equal(message.contents.body.contents[0].text, 'AI診断');
  assert.equal(message.contents.footer.contents[0].action.uri, `${baseUrl}?view=ai-diagnosis`);
});

test('routes stylebook keywords to stylebook page', () => {
  const message = buildReplyMessageForText('スタイル図鑑で作品を見たい', baseUrl);
  assert.equal(message.type, 'flex');
  assert.equal(message.contents.body.contents[0].text, 'スタイル図鑑');
  assert.equal(message.contents.footer.contents[0].action.uri, `${baseUrl}?view=stylebook`);
});

test('routes color keywords to color chart page', () => {
  const message = buildReplyMessageForText('カラー一覧を見たい', baseUrl);
  assert.equal(message.type, 'flex');
  assert.equal(message.contents.body.contents[0].text, 'カラーチャート');
  assert.equal(message.contents.footer.contents[0].action.uri, `${baseUrl}?view=color-chart`);
});

test('routes academy keywords to academy page', () => {
  const message = buildReplyMessageForText('講習日はいつですか', baseUrl);
  assert.equal(message.type, 'flex');
  assert.equal(message.contents.body.contents[0].text, '講習案内');
  assert.equal(message.contents.footer.contents[0].action.uri, `${baseUrl}?view=academy`);
});

test('routes map keywords to map page', () => {
  const message = buildReplyMessageForText('近くのサロンを探したい', baseUrl);
  assert.equal(message.type, 'flex');
  assert.equal(message.contents.body.contents[0].text, '加盟店マップ');
  assert.equal(message.contents.footer.contents[0].action.uri, `${baseUrl}?view=map`);
});

test('returns default 6 item guide for other messages', () => {
  const message = buildReplyMessageForText('こんにちは', baseUrl);
  assert.equal(message.type, 'flex');
  assert.equal(message.contents.body.contents[0].text, 'Kimikea Connect');
  assert.equal(message.contents.footer.contents.length, 6);
  assert.deepEqual(
    message.contents.footer.contents.map((item) => item.action.label),
    [
      'エクステを注文する',
      'スタイル図鑑を見る',
      'カラーチャートを見る',
      '講習を見る',
      '加盟店マップ',
      'AI診断をする',
    ]
  );
  assert.deepEqual(
    message.contents.footer.contents.map((item) => item.action.uri),
    [
      `${baseUrl}?view=order`,
      `${baseUrl}?view=stylebook`,
      `${baseUrl}?view=color-chart`,
      `${baseUrl}?view=academy`,
      `${baseUrl}?view=map`,
      `${baseUrl}?view=ai-diagnosis`,
    ]
  );
});

test('verifies LINE signatures with raw body', async () => {
  const rawBody = '{"destination":"U123","events":[]}';
  const secret = 'test-secret';
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const signature = Buffer.from(digest).toString('base64');

  assert.equal(await verifyLineSignature(rawBody, signature, secret), true);
  assert.equal(await verifyLineSignature(rawBody, signature, 'wrong-secret'), false);
});

test('returns 200 for LINE verification webhook with empty events', async () => {
  const rawBody = '{"destination":"U123","events":[]}';
  const secret = 'test-secret';
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const signature = Buffer.from(digest).toString('base64');

  const response = await worker.fetch(
    new Request('https://example.com/webhook', {
      method: 'POST',
      headers: {
        'x-line-signature': signature,
        'content-type': 'application/json',
      },
      body: rawBody,
    }),
    {
      LINE_CHANNEL_SECRET: secret,
      LINE_CHANNEL_ACCESS_TOKEN: 'dummy-token',
      KIMIKEA_CONNECT_URL: baseUrl,
    }
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, handled: 0 });
});
