import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../../components/Button';
import { deleteDeck, getDeck, listCards, MAX_BOX, resetDeck, type Card } from '../../../lib/db';
import { boxColor, useColors } from '../../../lib/theme';

export default function DeckScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deckId = Number(id);
  const db = useSQLiteContext();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [cards, setCards] = useState<Card[]>([]);

  const load = useCallback(async () => {
    const deck = await getDeck(db, deckId);
    if (!deck) return router.back();
    setName(deck.name);
    setCards(await listCards(db, deckId));
  }, [db, deckId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const now = Date.now();
  const due = cards.filter((card) => card.due_at <= now).length;
  const perBox = Array.from({ length: MAX_BOX }, (_, i) => cards.filter((card) => card.box === i + 1).length);

  function confirmDelete() {
    Alert.alert('Stapel löschen?', `„${name}“ und alle ${cards.length} Karten werden endgültig gelöscht.`, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          await deleteDeck(db, deckId);
          router.back();
        },
      },
    ]);
  }

  function confirmReset() {
    Alert.alert('Fortschritt zurücksetzen?', 'Alle Karten kommen zurück in Fach 1 und sind sofort fällig.', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Zurücksetzen', onPress: () => resetDeck(db, deckId).then(load) },
    ]);
  }

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <Stack.Screen options={{ title: name }} />
      <FlatList
        data={cards}
        keyExtractor={(card) => String(card.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.sectionLabel, { color: c.muted }]}>Fortschritt nach Fach</Text>
            <View style={styles.boxes}>
              {perBox.map((count, i) => (
                <View key={i} style={[styles.box, { backgroundColor: c.surface, borderColor: c.line }]}>
                  <Text style={[styles.boxCount, { color: boxColor(c, i + 1) }]}>{count}</Text>
                  <Text style={[styles.boxLabel, { color: c.muted }]}>Fach {i + 1}</Text>
                </View>
              ))}
            </View>
            <Text style={[styles.hint, { color: c.muted }]}>
              Gewusste Karten wandern ein Fach weiter und kommen nach 3, 7, 14 und 30 Tagen wieder. Nicht gewusste kommen morgen wieder. Fach 5 heißt: sitzt.
            </Text>
            <Button
              label={due > 0 ? `Lernen · ${due} fällig` : 'Heute nichts fällig'}
              onPress={() => router.push(`/deck/${deckId}/study`)}
              disabled={due === 0}
            />
            <Text style={[styles.sectionLabel, { color: c.muted, marginTop: 8 }]}>
              {cards.length} {cards.length === 1 ? 'Karte' : 'Karten'}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { color: c.muted }]}>
            Dieser Stapel ist noch leer. Füge unten die erste Karte hinzu.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Karte bearbeiten"
            onPress={() => router.push({ pathname: '/deck/[id]/card', params: { id: deckId, cardId: item.id } })}
            style={({ pressed }) => [
              styles.card,
              { backgroundColor: c.surface, borderColor: c.line, opacity: pressed ? 0.8 : 1 },
            ]}>
            <View style={[styles.dot, { backgroundColor: boxColor(c, item.box) }]} />
            <View style={styles.cardText}>
              <Text style={[styles.front, { color: c.text }]} numberOfLines={2}>
                {item.front}
              </Text>
              <Text style={[styles.back, { color: c.muted }]} numberOfLines={1}>
                {item.back}
              </Text>
            </View>
          </Pressable>
        )}
        ListFooterComponent={
          cards.length > 0 ? (
            <View style={styles.danger}>
              <Button label="Fortschritt zurücksetzen" variant="secondary" onPress={confirmReset} />
              <Button label="Stapel löschen" variant="danger" onPress={confirmDelete} />
            </View>
          ) : (
            <View style={styles.danger}>
              <Button label="Stapel löschen" variant="danger" onPress={confirmDelete} />
            </View>
          )
        }
      />
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16), borderColor: c.line }]}>
        <Button
          label="Karte hinzufügen"
          variant="secondary"
          onPress={() => router.push({ pathname: '/deck/[id]/card', params: { id: deckId } })}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { padding: 16, gap: 8 },
  header: { gap: 12, marginBottom: 4 },
  sectionLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  boxes: { flexDirection: 'row', gap: 6 },
  box: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  boxCount: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  boxLabel: { fontSize: 11, marginTop: 2 },
  hint: { fontSize: 14, lineHeight: 20 },
  empty: { fontSize: 16, lineHeight: 23, marginTop: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  cardText: { flex: 1, gap: 3 },
  front: { fontSize: 16, fontWeight: '500' },
  back: { fontSize: 14 },
  danger: { gap: 10, marginTop: 24 },
  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
