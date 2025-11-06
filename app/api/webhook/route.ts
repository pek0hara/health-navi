import { NextRequest, NextResponse } from 'next/server';
import * as line from '@line/bot-sdk';

// 環境変数の検証
function validateEnvVars(): { channelAccessToken: string; channelSecret: string } {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const channelSecret = process.env.LINE_CHANNEL_SECRET;

  if (!channelAccessToken || !channelSecret) {
    const missing = [];
    if (!channelAccessToken) missing.push('LINE_CHANNEL_ACCESS_TOKEN');
    if (!channelSecret) missing.push('LINE_CHANNEL_SECRET');

    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
      'Please set them in .env.local for local development or in Vercel settings for production.'
    );
  }

  return { channelAccessToken, channelSecret };
}

// LINE Messaging APIの設定
const envVars = validateEnvVars();
const config: line.ClientConfig = {
  channelAccessToken: envVars.channelAccessToken,
  channelSecret: envVars.channelSecret,
};

const client = new line.messagingApi.MessagingApiClient(config);

// Webhookイベントの処理
async function handleEvent(event: line.WebhookEvent): Promise<void> {
  // メッセージイベントの場合
  if (event.type === 'message' && event.message.type === 'text') {
    const { replyToken } = event;
    const { text } = event.message;

    // オウム返しの例
    const echo: line.TextMessage = {
      type: 'text',
      text: `受信しました: ${text}`,
    };

    try {
      await client.replyMessage({
        replyToken,
        messages: [echo],
      });
      console.log(`Successfully replied to message: "${text}"`);
    } catch (err) {
      console.error('Error replying to message:', {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        replyToken,
        messageText: text,
      });
      throw err; // エラーを再スローして上位で検知できるようにする
    }
  }

  // フォローイベントの場合
  if (event.type === 'follow') {
    const { replyToken } = event;
    const welcomeMessage: line.TextMessage = {
      type: 'text',
      text: 'フォローありがとうございます！健康ナビへようこそ。',
    };

    try {
      await client.replyMessage({
        replyToken,
        messages: [welcomeMessage],
      });
      console.log('Successfully replied to follow event');
    } catch (err) {
      console.error('Error replying to follow event:', {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        replyToken,
      });
      throw err; // エラーを再スローして上位で検知できるようにする
    }
  }
}

// POST: Webhook受信エンドポイント
export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get('x-line-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'No signature' },
        { status: 400 }
      );
    }

    // 署名の検証
    if (!line.validateSignature(body, config.channelSecret, signature)) {
      console.error('Signature validation failed');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // リクエストボディのパースと検証
    const parsedBody = JSON.parse(body);
    const events: line.WebhookEvent[] = parsedBody.events;

    if (!Array.isArray(events)) {
      console.error('Invalid webhook body: events is not an array', parsedBody);
      return NextResponse.json(
        { error: 'Invalid webhook body' },
        { status: 400 }
      );
    }

    console.log(`Received ${events.length} webhook event(s)`);

    // 各イベントを処理
    const results = await Promise.allSettled(events.map(handleEvent));

    // 失敗したイベントをログ出力
    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      console.error(`Failed to process ${failures.length} event(s):`, failures);
    }

    console.log(`Successfully processed ${results.length - failures.length}/${results.length} events`);

    return NextResponse.json({ message: 'ok' });
  } catch (err) {
    console.error('Webhook error:', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET: 疎通確認用
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'LINE Webhook endpoint is running'
  });
}
