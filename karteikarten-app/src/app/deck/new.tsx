import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '../../components/Button';
import { createDeck } from '../../lib/db';
import { useColors } from '../../lib/theme';

export default function NewDeckScreen() {
  const db = useSQLiteContext();
  const c = useColors();
  const [name, setName] = useState('');
  const trimmed = name.trim();

  async function save() {
    if (!trimmed) return;
    const id = await createDeck(db, trimmed);
    router.dismiss();
    router.push(`/deck/${id}`);
  }

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <Text style={[styles.label, { color: c.muted }]}>Name des Stapels</Text>
      <TextInput
        autoFocus
        value={name}
        onChangeText={setName}
        placeholder="z. B. Englisch Vokabeln"
        placeholderTextColor={c.muted}
        returnKeyType="done"
        onSubmitEditing={save}
        style={[styles.input, { color: c.text, backgroundColor: c.surface, borderColor: c.line }]}
      />
      <Button label="Stapel anlegen" onPress={save} disabled={!trimmed} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, gap: 12 },
  label: { fontSize: 14, fontWeight: '600' },
  input: { fontSize: 17, borderWidth: 1, borderRadius: 12, padding: 14 },
});
