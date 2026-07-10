# Kimikea Connect Style Book 保存設計

作成日: 2026-07-10

## 現在の画面

`docs/stylebook/` のレシピ投稿画面は、スマホで1ページ完結で登録できる構成。

画面上でできること:

- 施術写真の選択
- 使用カラーと本数の複数登録
- 合計本数の自動計算
- 下書き保存
- 投稿する
- 編集
- 削除
- 公開レシピ検索

GitHub Pages上でApps Script URLを未設定の場合は、確認用としてブラウザ内保存を使う。

```text
ブラウザ localStorage
key: kimikea_stylebook_recipes_v2
```

## 本運用の保存先

本運用ではGoogleスプレッドシートを保存先にする。

作成するシート:

- レシピ一覧
- レシピカラー詳細

Apps Script:

- `stylebook_apps_script.gs`

画像保存先:

- Google Drive
- フォルダ名: `Kimikea Connect Stylebook Images`

## レシピ一覧

| 列 | 内容 |
| --- | --- |
| レシピID | recipe-で始まる一意ID |
| ステータス | draft / published / deleted |
| 登録日 | 施術事例の登録日 |
| レシピ名 | 表示名 |
| 施術タイプ | イヤリングカラー、インナーカラーなど |
| ベースの髪色 | ベースカラー |
| ベースレベル | 例: 9レベル |
| 合計本数 | 使用本数合計 |
| 担当サロン名 | 登録サロン |
| 担当者名 | 登録者 |
| コメント | 提案メモ、仕上がり説明 |
| おすすめタグ | カンマ区切り |
| 難易度 | 1〜5 |
| 写真URL | Google Drive等に保存した画像URL |
| 写真ファイルID | Google DriveファイルID |
| 投稿者ID | 将来ログイン連携で利用 |
| 作成日時 | システム作成日時 |
| 更新日時 | システム更新日時 |

## レシピカラー詳細

| 列 | 内容 |
| --- | --- |
| レシピID | レシピ一覧と紐づくID |
| カラー順 | 表示順 |
| 商品カテゴリー | ダークカラー、ライトカラー、原色 |
| カラー名 | growカラー名・番号 |
| 使用本数 | 色ごとの本数 |
| 色見本 | 画面表示用カラーコード |

## 次の開発

1. Apps Scriptへ `stylebook_apps_script.gs` を貼り付ける
2. `setupKimikeaStylebook()` を実行してシートとDriveフォルダを作成する
3. Webアプリとしてデプロイする
4. 発行URLを `docs/stylebook/script.js` の `STYLEBOOK_API_URL` に設定する
5. GitHub Pagesへ反映する
6. 将来ログイン連携で、サロン名・担当者名を自動入力する
