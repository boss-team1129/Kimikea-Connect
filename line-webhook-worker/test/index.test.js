import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildKimikeaUrl,
  buildReplyMessageForText,
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

test('returns default 5 item guide for other messages', () => {
  const message = buildReplyMessageForText('こんにちは', baseUrl);
  assert.equal(message.type, 'flex');
  assert.equal(message.contents.body.contents[0].text, 'Kimikea Connect');
  assert.equal(message.contents.footer.contents.length, 5);
  assert.deepEqual(
    message.contents.footer.contents.map((item) => item.action.uri),
    [
      `${baseUrl}?view=order`,
      `${baseUrl}?view=ai-diagnosis`,
      `${baseUrl}?view=color-chart`,
      `${baseUrl}?view=academy`,
      `${baseUrl}?view=map`,
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
