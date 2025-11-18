import { NextRequest, NextResponse } from 'next/server';
import * as line from '@line/bot-sdk';
import { prisma } from '@/lib/prisma';

// LINE Messaging APIの設定
const config: line.ClientConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
};

const client = new line.messagingApi.MessagingApiClient(config);

// ユーザーを取得または作成
async function getOrCreateUser(lineUserId: string, profile?: any) {
  let user = await prisma.user.findUnique({
    where: { lineId: lineUserId },
    include: { healthHabits: { orderBy: { order: 'asc' } } },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        lineId: lineUserId,
        displayName: profile?.displayName,
        pictureUrl: profile?.pictureUrl,
        statusMessage: profile?.statusMessage,
      },
      include: { healthHabits: { orderBy: { order: 'asc' } } },
    });
  }

  return user;
}

// 健康習慣を設定
async function setHealthHabits(userId: string, habits: string[]) {
  // 最大3つまで
  const habitsToSet = habits.slice(0, 3);

  // 既存の習慣を削除
  await prisma.healthHabit.deleteMany({
    where: { userId },
  });

  // 新しい習慣を作成
  await prisma.healthHabit.createMany({
    data: habitsToSet.map((name, index) => ({
      userId,
      name,
      order: index + 1,
    })),
  });
}

// ユーザーの健康習慣を取得
async function getUserHabits(userId: string) {
  return await prisma.healthHabit.findMany({
    where: { userId, isActive: true },
    orderBy: { order: 'asc' },
  });
}

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

    // ユーザーを取得または作成
    const user = await getOrCreateUser(lineUserId);
    const habits = await getUserHabits(user.id);

    // コマンド処理
    if (text.startsWith('/設定 ')) {
      // 習慣設定コマンド: /設定 散歩,筋トレ,瞑想
      const habitNames = text.replace('/設定 ', '').split(',').map(h => h.trim());

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

      await setHealthHabits(user.id, habitNames);

      await client.replyMessage({
        replyToken,
        messages: [{
          type: 'text',
          text: `健康習慣を設定しました：\n${habitNames.map((h, i) => `${i + 1}. ${h}`).join('\n')}`,
        }],
      });
      return;
    }

    if (text === '/習慣' || text === '/確認') {
      // 現在の習慣を確認
      if (habits.length === 0) {
        await client.replyMessage({
          replyToken,
          messages: [{
            type: 'text',
            text: '健康習慣が設定されていません。\n\n/設定 散歩,筋トレ,瞑想\nのように設定してください。',
          }],
        });
        return;
      }

      // 習慣をQuick Replyで表示
      const quickReplyItems: line.QuickReplyItem[] = habits.map((habit) => ({
        type: 'action',
        action: {
          type: 'message',
          label: habit.name,
          text: habit.name,
        },
      }));

      await client.replyMessage({
        replyToken,
        messages: [{
          type: 'text',
          text: `あなたの健康習慣：\n${habits.map((h, i) => `${i + 1}. ${h.name}`).join('\n')}\n\n実施した活動を選択してください。`,
          quickReply: {
            items: quickReplyItems,
          },
        }],
      });
      return;
    }

    // 習慣が設定されている場合、選択肢として表示
    if (habits.length > 0) {
      const quickReplyItems: line.QuickReplyItem[] = habits.map((habit) => ({
        type: 'action',
        action: {
          type: 'message',
          label: habit.name,
          text: habit.name,
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
          text: `「${text}」を記録しました！\n\n次の活動を選択してください。`,
          quickReply: {
            items: quickReplyItems,
          },
        }],
      });
    } else {
      // 習慣が未設定の場合、デフォルトの選択肢を表示
      await client.replyMessage({
        replyToken,
        messages: [{
          type: 'text',
          text: '健康習慣を設定してください。\n\n例: /設定 散歩,筋トレ,瞑想',
          quickReply: {
            items: [
              {
                type: 'action',
                action: {
                  type: 'message',
                  label: '散歩・筋トレ・瞑想',
                  text: '/設定 散歩,筋トレ,瞑想',
                },
              },
              {
                type: 'action',
                action: {
                  type: 'message',
                  label: 'ヨガ・ランニング・水泳',
                  text: '/設定 ヨガ,ランニング,水泳',
                },
              },
              {
                type: 'action',
                action: {
                  type: 'message',
                  label: '読書・瞑想・ストレッチ',
                  text: '/設定 読書,瞑想,ストレッチ',
                },
              },
            ],
          },
        }],
      });
    }
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

    // プロフィール情報を取得してユーザー作成
    try {
      const profile = await client.getProfile(lineUserId);
      await getOrCreateUser(lineUserId, profile);
    } catch (err) {
      console.error('Error getting profile:', err);
      await getOrCreateUser(lineUserId);
    }

    const welcomeMessage: line.TextMessage = {
      type: 'text',
      text: 'フォローありがとうございます！健康ナビへようこそ。\n\nまず、あなたの健康習慣を設定しましょう。\n\n例: /設定 散歩,筋トレ,瞑想',
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type: 'message',
              label: '散歩・筋トレ・瞑想',
              text: '/設定 散歩,筋トレ,瞑想',
            },
          },
          {
            type: 'action',
            action: {
              type: 'message',
              label: 'ヨガ・ランニング・水泳',
              text: '/設定 ヨガ,ランニング,水泳',
            },
          },
          {
            type: 'action',
            action: {
              type: 'message',
              label: '読書・瞑想・ストレッチ',
              text: '/設定 読書,瞑想,ストレッチ',
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
    message: 'LINE Webhook endpoint is running'
  });
}
