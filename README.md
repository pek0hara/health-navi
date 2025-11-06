# Health Navi - LINE Webhook

LINE Messaging APIを使用した健康ナビゲーションBotのWebhookサーバーです。

## 機能

- LINE MessagingAPIからのWebhookイベントを受信
- テキストメッセージへの自動応答
- フォローイベントの処理
- 署名検証によるセキュリティ確保

## セットアップ

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.local`ファイルを作成して、LINE APIの認証情報を設定します：

```bash
cp .env.local.example .env.local
```

`.env.local`を編集して以下の値を設定：

```
LINE_CHANNEL_ACCESS_TOKEN=your_channel_access_token_here
LINE_CHANNEL_SECRET=your_channel_secret_here
```

これらの値は[LINE Developers Console](https://developers.line.biz/console/)から取得できます。

### 3. ローカルでの開発

```bash
npm run dev
```

開発サーバーが http://localhost:3000 で起動します。

Webhookエンドポイント: `http://localhost:3000/api/webhook`

ローカル開発時にLINEからWebhookを受け取るには、[ngrok](https://ngrok.com/)などのトンネリングツールを使用してください：

```bash
ngrok http 3000
```

## Vercelへのデプロイ

### 方法1: Vercel CLIを使用

1. Vercel CLIをインストール：

```bash
npm i -g vercel
```

2. デプロイ：

```bash
vercel
```

3. 本番環境へデプロイ：

```bash
vercel --prod
```

### 方法2: GitHubと連携

1. このプロジェクトをGitHubリポジトリにプッシュ
2. [Vercel Dashboard](https://vercel.com/dashboard)にアクセス
3. "New Project"をクリック
4. GitHubリポジトリをインポート
5. 環境変数を設定：
   - `LINE_CHANNEL_ACCESS_TOKEN`
   - `LINE_CHANNEL_SECRET`
6. "Deploy"をクリック

## 環境変数の設定（Vercel）

Vercelダッシュボードで環境変数を設定：

1. プロジェクト → Settings → Environment Variables
2. 以下の変数を追加：
   - `LINE_CHANNEL_ACCESS_TOKEN`: LINEチャネルアクセストークン
   - `LINE_CHANNEL_SECRET`: LINEチャネルシークレット

## LINE Webhook URLの設定

デプロイ後、LINE Developers Consoleで以下の設定を行います：

1. [LINE Developers Console](https://developers.line.biz/console/)にアクセス
2. チャネルを選択
3. "Messaging API"タブを開く
4. Webhook URLに以下を設定：
   ```
   https://your-vercel-domain.vercel.app/api/webhook
   ```
5. "Verify"ボタンでWebhookが正常に動作するか確認
6. "Use webhook"を有効化

## APIエンドポイント

### POST /api/webhook

LINE MessagingAPIからのWebhookイベントを受信します。

### GET /api/webhook

疎通確認用のエンドポイント。以下のレスポンスを返します：

```json
{
  "status": "ok",
  "message": "LINE Webhook endpoint is running"
}
```

## カスタマイズ

Webhookイベントの処理をカスタマイズするには、[app/api/webhook/route.ts](app/api/webhook/route.ts#L15)の`handleEvent`関数を編集してください。

## トラブルシューティング

### Webhookが動作しない場合

1. 環境変数が正しく設定されているか確認
2. Vercelのログを確認：`vercel logs`
3. LINE Developers Consoleで署名検証が有効になっているか確認

### ローカル開発でWebhookをテストしたい場合

ngrokを使用してローカルサーバーを公開：

```bash
# ターミナル1
npm run dev

# ターミナル2
ngrok http 3000
```

ngrokのURLをLINE Developers ConsoleのWebhook URLに設定してテストできます。

## 技術スタック

- [Next.js 15](https://nextjs.org/)
- [TypeScript](https://www.typescriptlang.org/)
- [@line/bot-sdk](https://www.npmjs.com/package/@line/bot-sdk)
- [Vercel](https://vercel.com/)

## ライセンス

MIT
