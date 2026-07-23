# Kimikea LINE Webhook Worker

NPO法人シールエクステ協会きみけあのLINE公式アカウントと、Kimikea ConnectをつなぐCloudflare Workers版Webhookです。

Apps Script版でLINE DevelopersのVerifyが `302 Found` になる場合でも、Cloudflare Workersはリダイレクトせず `HTTP 200` を直接返せます。

## 重要

- Kimikea Connect本体、Order API、Stylebook API、既存Apps Scriptは変更しません。
- `LINE_CHANNEL_SECRET` と `LINE_CHANNEL_ACCESS_TOKEN` はコードに書きません。
- 秘密情報はCloudflare WorkersのSecretsへ登録します。
- LINE Developersの検証リクエスト `{"destination":"...","events":[]}` にも `HTTP 200` を返します。

## ファイル構成

```text
line-webhook-worker/
  package.json
  wrangler.toml
  src/
    index.js
  dashboard-worker.js
  test/
    index.test.js
  README.md
```

## 返信ルール

| LINEの文字 | 返信 |
| --- | --- |
| 注文 / 注文したい / エクステ注文 | Kimikea Connect注文ページボタン |
| スタイル図鑑 / 図鑑 / スタイル / 作品 / デザイン | スタイル図鑑ボタン |
| AI診断 / 診断 / 似合うエクステ | AI診断画面ボタン |
| カラーチャート / カラー / 色を見る / 色一覧 | カラーチャート画面ボタン |
| 講習 / 講習日 / スクール | 講習案内ページボタン |
| 加盟店 / 近くのサロン / マップ | 加盟店マップボタン |
| その他 | 注文・スタイル図鑑・カラーチャート・講習・加盟店マップ・AI診断の6択 |

## 方法A: Macからコマンドでデプロイする方法

一番おすすめです。GitHubにこのフォルダを置いたまま、そのままデプロイできます。

### 1. Cloudflareアカウントを作る

1. ブラウザでCloudflareを開きます。
2. アカウントを作成します。
3. メール認証を完了します。
4. Cloudflare Dashboardへログインします。

### 2. Macでフォルダを開く

ターミナルを開き、以下を実行します。

```bash
cd /Users/take/Documents/Codex/Kimikea-Connect/line-webhook-worker
```

### 3. 必要なものを入れる

```bash
npm install
```

### 4. Cloudflareへログイン

```bash
npx wrangler login
```

ブラウザが開いたら、Cloudflareへのアクセスを許可します。

### 5. Secretsを登録

LINE Developersで確認した `Channel secret` を登録します。

```bash
npx wrangler secret put LINE_CHANNEL_SECRET
```

入力待ちになったら、Channel secretを貼り付けてEnterします。

次に `Channel access token` を登録します。

```bash
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
```

入力待ちになったら、Channel access tokenを貼り付けてEnterします。

### 6. デプロイ前チェック

```bash
npm run check
npm test
```

どちらもエラーが出なければOKです。

### 7. Deploy

```bash
npx wrangler deploy
```

成功すると、次のようなURLが表示されます。

```text
https://kimikea-line-webhook.あなたの名前.workers.dev
```

このURLをコピーします。

## 方法B: Cloudflare Dashboardから貼り付ける方法

コマンド操作が不安な場合はこちらです。

### 1. Workerを作成

1. Cloudflare Dashboardへログインします。
2. 左メニューから `Workers & Pages` を開きます。
3. `Create application` を押します。
4. `Worker` を選びます。
5. Worker名を `kimikea-line-webhook` にします。
6. `Deploy` を押して一度作成します。

### 2. コードを貼り替え

1. 作成したWorkerを開きます。
2. `Edit code` を押します。
3. 既存コードをすべて削除します。
4. このフォルダの `dashboard-worker.js` の全文を貼り付けます。
5. `Save and deploy` を押します。

### 3. 環境変数を設定

1. Workerの画面へ戻ります。
2. `Settings` を開きます。
3. `Variables` を開きます。
4. `Environment Variables` に以下を追加します。

```text
KIMIKEA_CONNECT_URL
https://boss-team1129.github.io/Kimikea-Connect/index.html
```

これは秘密情報ではないので、通常の環境変数でOKです。

### 4. Secretsを設定

同じ `Variables` 画面で、Secretsへ以下を追加します。

```text
LINE_CHANNEL_SECRET
```

値にはLINE DevelopersのChannel secretを入れます。

次にもう1つ追加します。

```text
LINE_CHANNEL_ACCESS_TOKEN
```

値にはMessaging APIのChannel access tokenを入れます。

保存したら、必要に応じて `Deployments` から最新状態を再デプロイします。

### 5. Worker URLを確認

Workerの画面に表示されるURLをコピーします。

例:

```text
https://kimikea-line-webhook.あなたの名前.workers.dev
```

ブラウザでこのURLを開き、以下のようなJSONが表示されればWorkerは動いています。

```json
{"ok":true,"app":"Kimikea LINE Webhook Worker","message":"Webhook is ready."}
```

## LINE DevelopersへWebhook URLを設定

1. LINE Developers Consoleを開きます。
2. 対象のProviderを開きます。
3. NPO法人シールエクステ協会きみけあのMessaging APIチャネルを開きます。
4. `Messaging API` タブを開きます。
5. `Webhook settings` の `Webhook URL` にWorker URLを貼ります。
6. `Use webhook` をオンにします。
7. `Verify` を押します。

成功すれば `Success` のような表示になります。  
このWorkerは `events: []` でも `HTTP 200` を返すため、Apps Script版のような `302 Found` は発生しません。

## LINE公式アカウント側の確認

LINE Official Account Managerで以下を確認します。

- Webhook: オン
- 応答メッセージ: 必要に応じてオフ
- あいさつメッセージ: 運用方針に合わせて設定

自動応答がオンのままだと、Webhook返信と二重になる場合があります。

## 実機テスト

LINE公式アカウントへ以下を送ります。

```text
注文したい
```

注文ページボタンが返ればOKです。

続けて確認します。

```text
講習日を知りたい
近くのサロン
スタイル図鑑を見たい
AI診断をしたい
カラーチャートを見たい
こんにちは
```

それぞれ講習案内、加盟店マップ、スタイル図鑑、AI診断、カラーチャート、6択メニューが返れば完了です。

## トラブル時

### Verifyで401になる

`LINE_CHANNEL_SECRET` が違う可能性があります。  
LINE DevelopersのChannel secretをコピーし直して、CloudflareのSecretへ再登録してください。

### メッセージ返信が来ない

`LINE_CHANNEL_ACCESS_TOKEN` が違う、または期限切れの可能性があります。  
Messaging APIのChannel access tokenを再発行して、CloudflareのSecretへ再登録してください。

### Worker URLをブラウザで開くと動くがLINEだけ失敗する

LINE DevelopersのWebhook URL欄に、古いApps Script URLが残っていないか確認してください。  
必ず `workers.dev` のURLを設定してください。

## GitHubへ置くときの注意

GitHubへ入れてよいもの:

- `package.json`
- `wrangler.toml`
- `src/index.js`
- `dashboard-worker.js`
- `test/index.test.js`
- `README.md`

GitHubへ入れてはいけないもの:

- LINE Channel secret
- LINE Channel access token
- `.dev.vars`
- `.env`
