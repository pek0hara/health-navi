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
  console.log('Handling event:', event.type);

  // メッセージイベントの場合
  if (event.type === 'message' && event.message.type === 'text') {
    const { replyToken } = event;
    const { text } = event.message;

    console.log('Text message received:', text);

    // Quick Replyで3択の選択肢を提供
    const replyMessage: line.TextMessage = {
      type: 'text',
      text: '健康活動を選択してください',
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type: 'message',
              label: '散歩',
              text: '散歩',
            },
          },
          {
            type: 'action',
            action: {
              type: 'message',
              label: '筋トレ',
              text: '筋トレ',
            },
          },
          {
            type: 'action',
            action: {
              type: 'message',
              label: '瞑想',
              text: '瞑想',
            },
          },
        ],
      },
    };

    try {
      console.log('Sending reply with quick reply options...');
      await client.replyMessage({
        replyToken,
        messages: [replyMessage],
      });
      console.log('Reply sent successfully');
    } catch (err) {
      console.error('Error replying to message:', err);
      if (err instanceof Error) {
        console.error('Error details:', err.message);
      }
    }
  }

  // フォローイベントの場合
  if (event.type === 'follow') {
    const { replyToken } = event;
    console.log('Follow event received');

    const welcomeMessage: line.TextMessage = {
      type: 'text',
      text: 'フォローありがとうございます！健康ナビへようこそ。',
    };

    try {
      console.log('Sending welcome message...');
      await client.replyMessage({
        replyToken,
        messages: [welcomeMessage],
      });
      console.log('Welcome message sent successfully');
    } catch (err) {
      console.error('Error replying to follow event:', err);
      if (err instanceof Error) {
        console.error('Error details:', err.message);
      }
    }
  }
}

// POST: Webhook受信エンドポイント
export async function POST(req: NextRequest) {
  try {
    console.log('Webhook received');
    const body = await req.text();
    const signature = req.headers.get('x-line-signature');

    console.log('Environment check:', {
      hasAccessToken: !!process.env.LINE_CHANNEL_ACCESS_TOKEN,
      hasSecret: !!process.env.LINE_CHANNEL_SECRET,
      hasSignature: !!signature,
    });

    if (!signature) {
      console.error('No signature provided');
      return NextResponse.json(
        { error: 'No signature' },
        { status: 400 }
      );
    }

    // 署名の検証
    if (!line.validateSignature(body, config.channelSecret || '', signature)) {
      console.error('Invalid signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    const events: line.WebhookEvent[] = JSON.parse(body).events;
    console.log('Events received:', events.length, 'event(s)');
    console.log('Event types:', events.map(e => e.type));

    // 各イベントを処理
    await Promise.all(events.map(handleEvent));

    console.log('Events processed successfully');
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
