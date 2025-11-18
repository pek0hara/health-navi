import { Pool } from 'pg';

// PostgreSQL接続プールを作成
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export { pool };

// データベースを初期化（テーブルが存在しない場合は作成）
export async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        line_id TEXT UNIQUE NOT NULL,
        display_name TEXT,
        picture_url TEXT,
        status_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS health_habits (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        "order" INTEGER NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, "order")
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_health_habits_user_id
      ON health_habits(user_id);
    `);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

// ユーザー関連の操作
export async function getOrCreateUser(lineId: string, profile?: any) {
  const client = await pool.connect();
  try {
    // ユーザーを検索
    let result = await client.query(
      'SELECT * FROM users WHERE line_id = $1',
      [lineId]
    );

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // ユーザーを作成
    const userId = `user_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    result = await client.query(
      `INSERT INTO users (id, line_id, display_name, picture_url, status_message)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        userId,
        lineId,
        profile?.displayName || null,
        profile?.pictureUrl || null,
        profile?.statusMessage || null,
      ]
    );

    return result.rows[0];
  } finally {
    client.release();
  }
}

// 健康習慣関連の操作
export async function getUserHabits(userId: string) {
  const result = await pool.query(
    `SELECT * FROM health_habits
     WHERE user_id = $1 AND is_active = true
     ORDER BY "order" ASC`,
    [userId]
  );
  return result.rows;
}

export async function setUserHabits(userId: string, habits: string[]) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 既存の習慣を削除
    await client.query('DELETE FROM health_habits WHERE user_id = $1', [userId]);

    // 新しい習慣を挿入
    for (let i = 0; i < Math.min(habits.length, 3); i++) {
      const habitId = `habit_${Date.now()}_${i}_${Math.random().toString(36).substring(7)}`;
      await client.query(
        `INSERT INTO health_habits (id, user_id, name, "order", is_active)
         VALUES ($1, $2, $3, $4, true)`,
        [habitId, userId, habits[i], i + 1]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
