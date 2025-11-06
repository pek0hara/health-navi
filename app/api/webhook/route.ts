import { NextRequest, NextResponse } from 'next/server';
import * as line from '@line/bot-sdk';

// LINE Messaging APIの設定
const config: line.ClientConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
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
    } catch (err) {
      console.error('Error replying to message:', err);
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
    } catch (err) {
      console.error('Error replying to follow event:', err);
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
    if (!line.validateSignature(body, config.channelSecret || '', signature)) {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    const events: line.WebhookEvent[] = JSON.parse(body).events;

    // 各イベントを処理
    await Promise.all(events.map(handleEvent));

    return NextResponse.json({ message: 'ok' });
  } catch (err) {
    console.error('Webhook error:', err);
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
