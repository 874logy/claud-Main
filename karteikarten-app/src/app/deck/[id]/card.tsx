import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputInstance,
} from 'react-native';

import { Button } from '../../../components/Button';
import { deleteCard, getCard, saveCard } from '../../../lib/db';
import { useColors } from '../../../lib/theme';

export default function CardEditorScreen() {
  const params = useLocalSearchParams<{ id: string; cardId?: string }>();
  const deckId = Number(params.id);
  const cardId = params.cardId ? Number(params.cardId) : undefined;
  const db = useSQLiteContext();
  const c = useColors();
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [savedCount, setSavedCount] = useState(0);
  const frontRef = useRef<TextInputInstance>(null);
  const backRef = useRef<TextInputInstance>(null);

  useEffect(() => {
    if (!cardId) return;
    getCard(db, cardId).then((card) => {
      if (!card) return;
      setFront(card.front);
      setBack(card.back);
    });
  }, [db, cardId]);

  const canSave = front.trim() !== '' && back.trim() !== '';

  async function save(addAnother: boolean) {
    if (!canSave) return;
    await saveCard(db, { id: cardId, deckId, front: front.trim(), back: back.trim() });
    if (addAnother) {
      setFront('');
      setBack('');
      setSavedCount((n) => n + 1);
      frontRef.current?.focus();
    } else {
      router.back();
    }
  }

  function confirmDelete() {
    if (!cardId) return;
    Alert.alert('Karte löschen?', 'Die Karte wird endgültig aus dem Stapel entfernt.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          await deleteCard(db, cardId);
          router.back();
        },
      },
    ]);
  }

  const inputStyle = [styles.input, { color: c.text, backgroundColor: c.surface, borderColor: c.line }];

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: c.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: cardId ? 'Karte bearbeiten' : 'Neue Karte' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: c.muted }]}>Vorderseite (Frage)</Text>
        <TextInput
          ref={frontRef}
          autoFocus={!cardId}
          multiline
          value={front}
          onChangeText={setFront}
          placeholder="z. B. the library"
          placeholderTextColor={c.muted}
          style={inputStyle}
          submitBehavior="submit"
          returnKeyType="next"
          onSubmitEditing={() => backRef.current?.focus()}
        />
        <Text style={[styles.label, { color: c.muted }]}>Rückseite (Antwort)</Text>
        <TextInput
          ref={backRef}
          multiline
          value={back}
          onChangeText={setBack}
          placeholder="z. B. die Bibliothek"
          placeholderTextColor={c.muted}
          style={inputStyle}
        />
        {savedCount > 0 && (
          <Text style={[styles.saved, { color: c.good }]}>
            {savedCount} {savedCount === 1 ? 'Karte' : 'Karten'} gespeichert
          </Text>
        )}
        {cardId ? (
          <>
            <Button label="Speichern" onPress={() => save(false)} disabled={!canSave} />
            <Button label="Karte löschen" variant="danger" onPress={confirmDelete} />
          </>
        ) : (
          <>
            <Button label="Speichern und nächste Karte" onPress={() => save(true)} disabled={!canSave} />
            <Button label="Speichern und schließen" variant="secondary" onPress={() => save(false)} disabled={!canSave} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 12 },
  label: { fontSize: 14, fontWeight: '600' },
  input: { fontSize: 17, borderWidth: 1, borderRadius: 12, padding: 14, minHeight: 90, textAlignVertical: 'top' },
  saved: { fontSize: 14, fontWeight: '600' },
});
