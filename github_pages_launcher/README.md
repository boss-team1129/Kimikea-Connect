# Kimikea Connect GitHub Pages Launcher

Kimikea ConnectをiPhoneのホーム画面へ正式アイコンで追加するための入口ページです。

## ファイル

- `index.html`
- `manifest.webmanifest`
- `apple-touch-icon.png`
- `icon-192.png`
- `icon-512.png`
- `icon-1024.png`
- `.nojekyll`

## GitHub Pagesへ公開する手順

### 1. GitHubで新しいリポジトリを作る

1. GitHubへログインします。
2. 右上の「+」から「New repository」を選びます。
3. Repository nameを `kimikea-connect-launcher` にします。
4. Publicを選びます。
5. 「Create repository」を押します。

### 2. ファイルをアップロードする

1. 作成したリポジトリで「uploading an existing file」を選びます。
2. このフォルダ内のファイルをすべてアップロードします。
3. ファイルがフォルダの中ではなく、リポジトリ直下に並んでいることを確認します。
4. 「Commit changes」を押します。

### 3. GitHub Pagesを有効にする

1. リポジトリの「Settings」を開きます。
2. 左側の「Pages」を開きます。
3. Build and deploymentのSourceで「Deploy from a branch」を選びます。
4. Branchを `main`、フォルダを `/(root)` にします。
5. 「Save」を押します。

数分後、次の形式のURLが表示されます。

```text
https://GitHubユーザー名.github.io/kimikea-connect-launcher/
```

## iPhoneのホーム画面へ追加する手順

1. 公開されたGitHub Pages URLをSafariで開きます。
2. 「自動転送を停止」を押します。
3. Safariの共有ボタンを押します。
4. 「ホーム画面に追加」を選びます。
5. 名前が `Kimikea Connect`、正式アイコンになっていることを確認して追加します。

ホーム画面から起動すると、約2秒後にKimikea ConnectのApps Script Webアプリへ移動します。

## Apps Script URLを変更する場合

`index.html`内の `APP_URL` と「Kimikea Connectを開く」ボタンの `href` を、新しいApps Script URLへ変更します。
