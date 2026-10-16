import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { listDecks, type Deck } from '../lib/db';
import { useColors } from '../lib/theme';

export default function DeckListScreen() {
  const db = useSQLiteContext();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [decks, setDecks] = useState<Deck[]>([]);

  useFocusEffect(
    useCallback(() => {
      listDecks(db).then(setDecks);
    }, [db])
  );

  const dueTotal = decks.reduce((sum, d) => sum + d.due, 0);

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <FlatList
        data={decks}
        keyExtractor={(d) => String(d.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Text style={[styles.summary, { color: c.muted }]}>
            {decks.length === 0
              ? 'Noch keine Stapel'
              : dueTotal > 0
                ? `Heute fällig: ${dueTotal} ${dueTotal === 1 ? 'Karte' : 'Karten'}`
                : 'Alles gelernt für heute'}
          </Text>
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { color: c.muted }]}>
            Lege deinen ersten Stapel an, zum Beispiel „Englisch Vokabeln“ oder „Biologie Kapitel 3“.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/deck/${item.id}`)}
            style={({ pressed }) => [
              styles.deck,
              { backgroundColor: c.surface, borderColor: c.line, opacity: pressed ? 0.8 : 1 },
            ]}>
            <View style={styles.deckText}>
              <Text style={[styles.deckName, { color: c.text }]} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={[styles.deckMeta, { color: c.muted }]}>
                {item.total} {item.total === 1 ? 'Karte' : 'Karten'}
              </Text>
            </View>
            {item.due > 0 && (
              <View style={[styles.badge, { backgroundColor: c.accent }]}>
                <Text style={[styles.badgeText, { color: c.onAccent }]}>{item.due} fällig</Text>
              </View>
            )}
          </Pressable>
        )}
      />
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16), borderColor: c.line }]}>
        <Button label="Neuer Stapel" onPress={() => router.push('/deck/new')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { padding: 16, gap: 10 },
  summary: { fontSize: 14, fontWeight: '600', marginBottom: 6, letterSpacing: 0.3 },
  empty: { fontSize: 16, lineHeight: 23, marginTop: 24 },
  deck: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  deckText: { flex: 1, gap: 4 },
  deckName: { fontSize: 18, fontWeight: '600' },
  deckMeta: { fontSize: 14 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
