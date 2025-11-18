import { NextRequest, NextResponse } from 'next/server';
import * as line from '@line/bot-sdk';
import {
  getOrCreateUser,
  getUserHabits,
  setUserHabits,
  initDatabase,
  logHabit,
  getTodayHabitLogs,
  getHabitStats,
} from '@/lib/db';

// LINE Messaging APIの設定
const config: line.ClientConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
};

const client = new line.messagingApi.MessagingApiClient(config);

// データベース初期化フラグ
let dbInitialized = false;

// デフォルトの健康習慣
const DEFAULT_HABITS = ['散歩', '筋トレ', '瞑想'];

// Webhookイベントの処理
async function handleEvent(event: line.WebhookEvent): Promise<void> {
  console.log('Handling event:', event.type);

  // データベース初期化（初回のみ）
  if (!dbInitialized) {
    try {
      await initDatabase();
      dbInitialized = true;
    } catch (error) {
      console.error('Failed to initialize database:', error);
    }
  }

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

    try {
      // ユーザーを取得または作成
      const user = await getOrCreateUser(lineUserId);
      const habitsData = await getUserHabits(user.id);
      const habits = habitsData.length > 0
        ? habitsData.map(h => h.name)
        : DEFAULT_HABITS;

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

        // データベースに保存
        await setUserHabits(user.id, habitNames);

        // 現在の日付を取得（MM/DD形式）
        const currentDate = new Date();
        const datePrefix = `${currentDate.getMonth() + 1}/${currentDate.getDate()}`;

        const quickReplyItems: line.QuickReplyItem[] = habitNames.map((habit) => ({
          type: 'action',
          action: {
            type: 'message',
            label: `${datePrefix} ${habit}`,
            text: `${datePrefix} ${habit}`,
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
        const todayLogs = await getTodayHabitLogs(user.id);

        // 現在の日付を取得（MM/DD形式）
        const currentDate = new Date();
        const datePrefix = `${currentDate.getMonth() + 1}/${currentDate.getDate()}`;

        const quickReplyItems: line.QuickReplyItem[] = habits.map((habit) => ({
          type: 'action',
          action: {
            type: 'message',
            label: `${datePrefix} ${habit}`,
            text: `${datePrefix} ${habit}`,
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

        // 統計情報も追加
        quickReplyItems.push({
          type: 'action',
          action: {
            type: 'message',
            label: '統計を見る',
            text: '/統計',
          },
        });

        const todayLogText = todayLogs.length > 0
          ? `\n\n【今日の記録】\n${todayLogs.map(log => {
              const time = new Date(log.logged_at).toLocaleTimeString('ja-JP', {
                timeZone: 'Asia/Tokyo',
                hour: '2-digit',
                minute: '2-digit'
              });
              return `✓ ${log.habit_name} (${time})`;
            }).join('\n')}`
          : '\n\n今日はまだ記録がありません。';

        await client.replyMessage({
          replyToken,
          messages: [{
            type: 'text',
            text: `あなたの健康習慣：\n${habits.map((h, i) => `${i + 1}. ${h}`).join('\n')}${todayLogText}\n\n実施した活動を選択してください。`,
            quickReply: {
              items: quickReplyItems,
            },
          }],
        });
        return;
      }

      if (text === '/統計') {
        // 7日間の統計を表示
        const stats = await getHabitStats(user.id, 7);

        if (stats.length === 0) {
          await client.replyMessage({
            replyToken,
            messages: [{
              type: 'text',
              text: 'まだ記録がありません。\n習慣を実施したら記録してみましょう！',
            }],
          });
          return;
        }

        const statsText = stats.map((stat, i) => {
          const lastLogged = new Date(stat.last_logged).toLocaleDateString('ja-JP', {
            timeZone: 'Asia/Tokyo',
            month: 'short',
            day: 'numeric'
          });
          return `${i + 1}. ${stat.habit_name}: ${stat.count}回\n   最終: ${lastLogged}`;
        }).join('\n');

        await client.replyMessage({
          replyToken,
          messages: [{
            type: 'text',
            text: `【過去7日間の統計】\n${statsText}`,
          }],
        });
        return;
      }

      // 通常のメッセージへの応答（習慣を記録）
      // 日付プレフィックスを削除して習慣名を抽出（例: "11/19 散歩" -> "散歩"）
      const datePattern = /^\d{1,2}\/\d{1,2}\s+/;
      const habitName = text.replace(datePattern, '');

      // 習慣名として認識されるか確認
      const isHabit = habits.includes(habitName);

      if (isHabit) {
        // 習慣をDBに記録（日付なしの習慣名のみ）
        await logHabit(user.id, habitName);
      }

      // 今日の記録を取得
      const todayLogs = await getTodayHabitLogs(user.id);

      // 現在の日付を取得（MM/DD形式）
      const currentDate = new Date();
      const datePrefix = `${currentDate.getMonth() + 1}/${currentDate.getDate()}`;

      const quickReplyItems: line.QuickReplyItem[] = habits.map((habit) => ({
        type: 'action',
        action: {
          type: 'message',
          label: `${datePrefix} ${habit}`,
          text: `${datePrefix} ${habit}`,
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
          label: '統計を見る',
          text: '/統計',
        },
      });

      // 現在の日時を取得
      const now = new Date();
      const dateStr = now.toLocaleDateString('ja-JP', {
        timeZone: 'Asia/Tokyo',
        month: 'long',
        day: 'numeric',
        weekday: 'short'
      });
      const timeStr = now.toLocaleTimeString('ja-JP', {
        timeZone: 'Asia/Tokyo',
        hour: '2-digit',
        minute: '2-digit'
      });

      const todayCount = todayLogs.length;
      const message = isHabit
        ? `✓ 「${habitName}」を記録しました！\n\n📅 ${dateStr} ${timeStr}\n🎯 今日の記録: ${todayCount}件\n\n次の活動を選択してください。`
        : `「${text}」を受信しました。\n\n📅 ${dateStr} ${timeStr}\n\n習慣を選択してください。`;

      await client.replyMessage({
        replyToken,
        messages: [{
          type: 'text',
          text: message,
          quickReply: {
            items: quickReplyItems,
          },
        }],
      });
    } catch (error) {
      console.error('Error processing message:', error);
      // エラーの場合は簡単な応答を返す
      await client.replyMessage({
        replyToken,
        messages: [{
          type: 'text',
          text: 'エラーが発生しました。もう一度お試しください。',
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

    try {
      // プロフィール情報を取得してユーザー作成
      let profile;
      try {
        profile = await client.getProfile(lineUserId);
      } catch (err) {
        console.error('Error getting profile:', err);
      }

      const user = await getOrCreateUser(lineUserId, profile);

      // デフォルトの習慣を設定
      await setUserHabits(user.id, DEFAULT_HABITS);

      // 現在の日付を取得（MM/DD形式）
      const currentDate = new Date();
      const datePrefix = `${currentDate.getMonth() + 1}/${currentDate.getDate()}`;

      const welcomeMessage: line.TextMessage = {
        type: 'text',
        text: 'フォローありがとうございます！健康ナビへようこそ。\n\nデフォルトの健康習慣を設定しました：\n1. 散歩\n2. 筋トレ\n3. 瞑想\n\n変更する場合は「/設定 習慣1,習慣2,習慣3」と入力してください。',
        quickReply: {
          items: [
            {
              type: 'action',
              action: {
                type: 'message',
                label: `${datePrefix} 散歩`,
                text: `${datePrefix} 散歩`,
              },
            },
            {
              type: 'action',
              action: {
                type: 'message',
                label: `${datePrefix} 筋トレ`,
                text: `${datePrefix} 筋トレ`,
              },
            },
            {
              type: 'action',
              action: {
                type: 'message',
                label: `${datePrefix} 瞑想`,
                text: `${datePrefix} 瞑想`,
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
      hasDatabase: !!process.env.POSTGRES_URL,
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
    message: 'LINE Webhook endpoint is running with NeonDB',
    database: !!process.env.POSTGRES_URL ? 'connected' : 'not configured',
  });
}
