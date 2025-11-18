import { NextRequest, NextResponse } from 'next/server';
import * as line from '@line/bot-sdk';

// LINE Messaging APIの設定
const config: line.ClientConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
};

const client = new line.messagingApi.MessagingApiClient(config);

// 一時的なメモリストレージ (Prismaが利用可能になるまで)
const userHabitsMemory: Map<string, string[]> = new Map();

// デフォルトの健康習慣
const DEFAULT_HABITS = ['散歩', '筋トレ', '瞑想'];

// Webhookイベントの処理
async function handleEvent(event: line.WebhookEvent): Promise<void> {
  console.log('Handling event:', event.type);

  // メッセージイベントの場合
  if (event.type === 'message' && event.message.type === 'text') {
    const { replyToken } = event;
    const { text } = event.message;
    const lineUserId = event.source.userId;

    if (!lineUserId) {
      console.error('No user ID in event');
      return;
    }

    console.log('Text message received:', text);

    // ユーザーの習慣を取得（メモリから）
    let habits = userHabitsMemory.get(lineUserId) || DEFAULT_HABITS;

    // コマンド処理
    if (text.startsWith('/設定 ')) {
      // 習慣設定コマンド: /設定 散歩,筋トレ,瞑想
      const habitNames = text.replace('/設定 ', '').split(',').map(h => h.trim()).filter(h => h);

      if (habitNames.length === 0) {
        await client.replyMessage({
          replyToken,
          messages: [{
            type: 'text',
            text: '習慣を入力してください。\n\n例: /設定 散歩,筋トレ,瞑想',
          }],
        });
        return;
      }

      if (habitNames.length > 3) {
        await client.replyMessage({
          replyToken,
          messages: [{
            type: 'text',
            text: '健康習慣は最大3つまで設定できます。',
          }],
        });
        return;
      }

      // メモリに保存
      userHabitsMemory.set(lineUserId, habitNames);
      habits = habitNames;

      const quickReplyItems: line.QuickReplyItem[] = habits.map((habit) => ({
        type: 'action',
        action: {
          type: 'message',
          label: habit,
          text: habit,
        },
      }));

      await client.replyMessage({
        replyToken,
        messages: [{
          type: 'text',
          text: `健康習慣を設定しました：\n${habitNames.map((h, i) => `${i + 1}. ${h}`).join('\n')}\n\n実施した活動を選択してください。`,
          quickReply: {
            items: quickReplyItems,
          },
        }],
      });
      return;
    }

    if (text === '/習慣' || text === '/確認') {
      // 現在の習慣を確認
      const quickReplyItems: line.QuickReplyItem[] = habits.map((habit) => ({
        type: 'action',
        action: {
          type: 'message',
          label: habit,
          text: habit,
        },
      }));

      // 設定コマンドも追加
      quickReplyItems.push({
        type: 'action',
        action: {
          type: 'message',
          label: '習慣を変更',
          text: '/設定 ',
        },
      });

      await client.replyMessage({
        replyToken,
        messages: [{
          type: 'text',
          text: `あなたの健康習慣：\n${habits.map((h, i) => `${i + 1}. ${h}`).join('\n')}\n\n実施した活動を選択してください。`,
          quickReply: {
            items: quickReplyItems,
          },
        }],
      });
      return;
    }

    // 通常のメッセージへの応答
    const quickReplyItems: line.QuickReplyItem[] = habits.map((habit) => ({
      type: 'action',
      action: {
        type: 'message',
        label: habit,
        text: habit,
      },
    }));

    // 設定コマンドも追加
    quickReplyItems.push({
      type: 'action',
      action: {
        type: 'message',
        label: '習慣を確認',
        text: '/習慣',
      },
    });

    quickReplyItems.push({
      type: 'action',
      action: {
        type: 'message',
        label: '習慣を変更',
        text: '/設定 ',
      },
    });

    await client.replyMessage({
      replyToken,
      messages: [{
        type: 'text',
        text: `「${text}」を記録しました！\n\n次の活動を選択してください。`,
        quickReply: {
          items: quickReplyItems,
        },
      }],
    });
  }

  // フォローイベントの場合
  if (event.type === 'follow') {
    const { replyToken } = event;
    const lineUserId = event.source.userId;
    console.log('Follow event received');

    if (!lineUserId) {
      console.error('No user ID in follow event');
      return;
    }

    // デフォルトの習慣を設定
    userHabitsMemory.set(lineUserId, DEFAULT_HABITS);

    const welcomeMessage: line.TextMessage = {
      type: 'text',
      text: 'フォローありがとうございます！健康ナビへようこそ。\n\nデフォルトの健康習慣を設定しました：\n1. 散歩\n2. 筋トレ\n3. 瞑想\n\n変更する場合は「/設定 習慣1,習慣2,習慣3」と入力してください。',
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
          {
            type: 'action',
            action: {
              type: 'message',
              label: '習慣を変更',
              text: '/設定 ',
            },
          },
        ],
      },
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
    message: 'LINE Webhook endpoint is running (temporary version without database)'
  });
}
