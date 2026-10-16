import type { SQLiteDatabase } from 'expo-sqlite';

export type Deck = {
  id: number;
  name: string;
  total: number;
  due: number;
};

export type Card = {
  id: number;
  deck_id: number;
  front: string;
  back: string;
  box: number;
  due_at: number;
};

// Leitner-System: Fach 1 = täglich, danach wachsende Abstände (in Tagen).
export const BOX_INTERVAL_DAYS = [0, 1, 3, 7, 14, 30];
export const MAX_BOX = BOX_INTERVAL_DAYS.length - 1;
const DAY_MS = 24 * 60 * 60 * 1000;

const SCHEMA_VERSION = 1;

export async function initDatabase(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if ((row?.user_version ?? 0) >= SCHEMA_VERSION) return;

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS decks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      front TEXT NOT NULL,
      back TEXT NOT NULL,
      box INTEGER NOT NULL DEFAULT 1,
      due_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS cards_deck_due ON cards (deck_id, due_at);
  `);
  await seedExampleDeck(db);
  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

const EXAMPLE_CARDS: [string, string][] = [
  ['In welchem Jahr veröffentlichte Martin Luther seine 95 Thesen?', '1517'],
  ['Wer wurde im Jahr 800 in Rom zum Kaiser gekrönt?', 'Karl der Große'],
  ['Welche zwei Elemente entdeckte Marie Curie 1898?', 'Polonium und Radium'],
  ['Wie heißt Darwins Hauptwerk von 1859?', '„Über die Entstehung der Arten“'],
  ['Mit welcher Erfindung wurde Johannes Gutenberg berühmt?', 'Buchdruck mit beweglichen Metalllettern'],
  ['Welcher Fluss markierte 49 v. Chr. Caesars Weg in den Bürgerkrieg?', 'Der Rubikon'],
  ['Wie viele Jahre verbrachte Nelson Mandela in Haft?', '27 Jahre'],
  ['In welcher Stadt wurde Albert Einstein geboren?', 'Ulm'],
];

async function seedExampleDeck(db: SQLiteDatabase) {
  const now = Date.now();
  const deck = await db.runAsync(
    'INSERT INTO decks (name, created_at) VALUES (?, ?)',
    'Beispiel: Geschichte',
    now
  );
  for (const [front, back] of EXAMPLE_CARDS) {
    await db.runAsync(
      'INSERT INTO cards (deck_id, front, back, box, due_at) VALUES (?, ?, ?, 1, ?)',
      deck.lastInsertRowId,
      front,
      back,
      now
    );
  }
}

export function listDecks(db: SQLiteDatabase) {
  return db.getAllAsync<Deck>(
    `SELECT d.id, d.name,
       COUNT(c.id) AS total,
       COALESCE(SUM(CASE WHEN c.due_at <= ? THEN 1 ELSE 0 END), 0) AS due
     FROM decks d LEFT JOIN cards c ON c.deck_id = d.id
     GROUP BY d.id ORDER BY d.created_at DESC`,
    Date.now()
  );
}

export function getDeck(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<{ id: number; name: string }>('SELECT id, name FROM decks WHERE id = ?', id);
}

export async function createDeck(db: SQLiteDatabase, name: string) {
  const result = await db.runAsync('INSERT INTO decks (name, created_at) VALUES (?, ?)', name, Date.now());
  return result.lastInsertRowId;
}


export async function deleteDeck(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM decks WHERE id = ?', id);
}

export function listCards(db: SQLiteDatabase, deckId: number) {
  return db.getAllAsync<Card>('SELECT * FROM cards WHERE deck_id = ? ORDER BY id DESC', deckId);
}

export function listDueCards(db: SQLiteDatabase, deckId: number) {
  return db.getAllAsync<Card>(
    'SELECT * FROM cards WHERE deck_id = ? AND due_at <= ? ORDER BY box ASC, due_at ASC',
    deckId,
    Date.now()
  );
}

export function getCard(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<Card>('SELECT * FROM cards WHERE id = ?', id);
}

export async function saveCard(
  db: SQLiteDatabase,
  card: { id?: number; deckId: number; front: string; back: string }
) {
  if (card.id) {
    await db.runAsync('UPDATE cards SET front = ?, back = ? WHERE id = ?', card.front, card.back, card.id);
  } else {
    await db.runAsync(
      'INSERT INTO cards (deck_id, front, back, box, due_at) VALUES (?, ?, ?, 1, ?)',
      card.deckId,
      card.front,
      card.back,
      Date.now()
    );
  }
}

export async function deleteCard(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM cards WHERE id = ?', id);
}

/** Gewusst: ein Fach weiter. Nicht gewusst: zurück in Fach 1. */
export function nextReview(box: number, knewIt: boolean, now = Date.now()) {
  const nextBox = knewIt ? Math.min(box + 1, MAX_BOX) : 1;
  return { box: nextBox, dueAt: now + BOX_INTERVAL_DAYS[nextBox] * DAY_MS };
}

export async function recordAnswer(db: SQLiteDatabase, card: Card, knewIt: boolean) {
  const { box, dueAt } = nextReview(card.box, knewIt);
  await db.runAsync('UPDATE cards SET box = ?, due_at = ? WHERE id = ?', box, dueAt, card.id);
  return box;
}

export async function resetDeck(db: SQLiteDatabase, deckId: number) {
  await db.runAsync('UPDATE cards SET box = 1, due_at = ? WHERE deck_id = ?', Date.now(), deckId);
}
