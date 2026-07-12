# Kimikea Connect Stylebook 実運用保存設計

更新日: 2026-07-12

## 運用方針

スタイル図鑑は、加盟店スタッフがスマホから投稿した施術写真とレシピを、GoogleスプレッドシートとGoogle Driveへ保存する。

GitHub Pagesは画面表示を担当し、保存・編集・削除・保存解除などのデータ操作はApps Script Webアプリが担当する。

## 本番保存先

- 投稿データ: Googleスプレッドシート
- 画像データ: Google Drive
- 画像フォルダ名: `Kimikea Connect Stylebook Images`
- Apps Scriptコード: `stylebook_apps_script.gs`

## 作成されるシート

- `style_posts`: 投稿、下書き、削除済み投稿
- `style_saves`: ユーザーごとの保存スタイル
- `style_colors`: エクステカラー
- `style_types`: 施術スタイル
- `style_shops`: 店舗
- `style_staff`: 担当者
- `style_users`: 投稿者、管理者、権限

## 画面側の接続設定

`stylebook/script.js` の上部にある以下へ、Apps ScriptのWebアプリURLを設定する。

```js
const STYLEBOOK_API_URL = 'ここにApps Script WebアプリURLを入れる';
```

URLが未設定の場合は、画面確認用としてブラウザ内保存で動作する。本番運用では必ずURLを設定する。

## 初期設定手順

1. Googleスプレッドシートを作成する
2. 拡張機能 > Apps Script を開く
3. `stylebook_apps_script.gs` の内容を貼り付ける
4. `setupKimikeaStylebook()` を手動実行する
5. 権限許可を行う
6. Webアプリとしてデプロイする
7. 発行URLを `STYLEBOOK_API_URL` に設定する
8. GitHub Pagesへ反映する

## 権限ルール

- `member`: 投稿、下書き、保存、自分の投稿編集・削除
- `contributor`: memberと同じ。既存互換用
- `shop_admin`: 将来の店舗管理者拡張用
- `headquarters_admin`: 全投稿の編集、削除、復元、完全削除

処理側でも、投稿者本人または本部管理者だけが編集・削除できるように確認する。

## 投稿で保存する情報

- 投稿ID
- タイトル
- コメント
- メイン画像URL
- 追加画像URL
- 使用カラー
- 施術スタイル
- 使用本数
- 店舗
- 担当者
- 投稿者
- 投稿日時
- 更新日時
- 保存数
- ステータス: `draft` / `published` / `deleted`

## 動作確認

本番URL設定後、以下を確認する。

1. スマホで写真を選択して投稿する
2. 投稿後すぐ図鑑一覧に表示される
3. ページをリロードしても残る
4. 画像がGoogle Driveに保存される
5. 下書き保存、編集、投稿、削除ができる
6. 保存したスタイルがマイページ導線から確認できる
