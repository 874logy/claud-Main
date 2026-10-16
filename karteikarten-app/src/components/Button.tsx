import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { useColors } from '../lib/theme';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  style?: ViewStyle;
};

export function Button({ label, onPress, variant = 'primary', disabled, style }: Props) {
  const c = useColors();
  const bg = variant === 'primary' ? c.accent : 'transparent';
  const fg = variant === 'primary' ? c.onAccent : variant === 'danger' ? c.bad : c.text;
  const border = variant === 'primary' ? c.accent : variant === 'danger' ? c.bad : c.line;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
        style,
      ]}>
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 16, fontWeight: '600' },
});
