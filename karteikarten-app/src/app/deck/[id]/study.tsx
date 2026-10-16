import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../../components/Button';
import { BOX_INTERVAL_DAYS, listDueCards, recordAnswer, type Card } from '../../../lib/db';
import { useColors } from '../../../lib/theme';

export default function StudyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deckId = Number(id);
  const db = useSQLiteContext();
  const c = useColors();
  const insets = useSafeAreaInsets();

  const [queue, setQueue] = useState<Card[] | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [stats, setStats] = useState({ known: 0, unknown: 0 });
  const flip = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    listDueCards(db, deckId).then(setQueue);
  }, [db, deckId]);

  function turn() {
    const toBack = !flipped;
    setFlipped(toBack);
    Haptics.selectionAsync();
    Animated.spring(flip, { toValue: toBack ? 1 : 0, useNativeDriver: true, friction: 8, tension: 60 }).start();
  }

  async function answer(knewIt: boolean) {
    if (!queue) return;
    const card = queue[index];
    await recordAnswer(db, card, knewIt);
    Haptics.notificationAsync(
      knewIt ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning
    );
    setStats((s) => (knewIt ? { ...s, known: s.known + 1 } : { ...s, unknown: s.unknown + 1 }));
    // Nicht gewusste Karten kommen in dieser Runde noch einmal dran.
    if (!knewIt) setQueue([...queue, { ...card, box: 1 }]);
    flip.setValue(0);
    setFlipped(false);
    setIndex((i) => i + 1);
  }

  if (!queue) return <View style={[styles.screen, { backgroundColor: c.bg }]} />;

  const done = index >= queue.length;
  if (done) {
    const total = stats.known + stats.unknown;
    return (
      <View style={[styles.screen, styles.center, { backgroundColor: c.bg, paddingBottom: insets.bottom + 16 }]}>
        <Text style={[styles.doneTitle, { color: c.text }]}>Runde geschafft</Text>
        <Text style={[styles.doneText, { color: c.muted }]}>
          {total === 0
            ? 'In diesem Stapel ist gerade nichts fällig.'
            : `${stats.known} von ${total} Antworten gewusst. Wiederholte Karten kommen nach Plan wieder: morgen, in 3, 7, 14 und 30 Tagen.`}
        </Text>
        <Button label="Zurück zum Stapel" onPress={() => router.back()} style={styles.doneButton} />
      </View>
    );
  }

  const card = queue[index];
  const frontRotate = flip.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRotate = flip.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  const nextDays = BOX_INTERVAL_DAYS[Math.min(card.box + 1, BOX_INTERVAL_DAYS.length - 1)];
  const progress = index / queue.length;

  return (
    <View style={[styles.screen, { backgroundColor: c.bg, paddingBottom: Math.max(insets.bottom, 16) }]}>
      <View style={styles.progressRow}>
        <View style={[styles.track, { backgroundColor: c.line }]}>
          <View style={[styles.fill, { backgroundColor: c.accent, width: `${progress * 100}%` }]} />
        </View>
        <Text style={[styles.counter, { color: c.muted }]}>
          {index + 1} / {queue.length}
        </Text>
      </View>

      <Pressable
        style={styles.cardArea}
        onPress={turn}
        accessibilityRole="button"
        accessibilityLabel={flipped ? `Antwort: ${card.back}` : `Frage: ${card.front}`}
        accessibilityHint="Tippen zum Umdrehen">
        <Animated.View
          style={[
            styles.card,
            { backgroundColor: c.surface, borderColor: c.line, transform: [{ perspective: 1000 }, { rotateY: frontRotate }] },
          ]}>
          <Text style={[styles.side, { color: c.muted }]}>Frage · Fach {card.box}</Text>
          <Text style={[styles.cardText, { color: c.text }]}>{card.front}</Text>
          <Text style={[styles.tapHint, { color: c.muted }]}>Tippen zum Umdrehen</Text>
        </Animated.View>
        <Animated.View
          style={[
            styles.card,
            styles.cardBack,
            { backgroundColor: c.surface, borderColor: c.accent, transform: [{ perspective: 1000 }, { rotateY: backRotate }] },
          ]}>
          <Text style={[styles.side, { color: c.accent }]}>Antwort</Text>
          <Text style={[styles.cardText, { color: c.text }]}>{card.back}</Text>
        </Animated.View>
      </Pressable>

      <Text style={[styles.statsLine, { color: c.muted }]}>
        Gewusst {stats.known} · Nicht gewusst {stats.unknown}
      </Text>

      {flipped ? (
        <View style={styles.answerRow}>
          <Button label="Nicht gewusst" variant="danger" onPress={() => answer(false)} style={styles.answer} />
          <Button
            label={nextDays === 1 ? 'Gewusst · morgen' : `Gewusst · ${nextDays} Tage`}
            onPress={() => answer(true)}
            style={styles.answer}
          />
        </View>
      ) : (
        <Button label="Antwort zeigen" variant="secondary" onPress={turn} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 16, paddingTop: 16, gap: 14 },
  center: { justifyContent: 'center', gap: 12 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  counter: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  cardArea: { flex: 1 },
  card: {
    ...StyleSheet.absoluteFill,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    justifyContent: 'center',
    backfaceVisibility: 'hidden',
  },
  cardBack: { borderWidth: 2 },
  side: { position: 'absolute', top: 20, left: 24, fontSize: 13, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  cardText: { fontSize: 26, lineHeight: 34, fontWeight: '600', textAlign: 'center' },
  tapHint: { position: 'absolute', bottom: 20, alignSelf: 'center', fontSize: 13 },
  statsLine: { fontSize: 14, textAlign: 'center', fontVariant: ['tabular-nums'] },
  answerRow: { flexDirection: 'row', gap: 10 },
  answer: { flex: 1 },
  doneTitle: { fontSize: 30, fontWeight: '700' },
  doneText: { fontSize: 17, lineHeight: 25 },
  doneButton: { marginTop: 12 },
});
