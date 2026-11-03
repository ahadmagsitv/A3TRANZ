import React, { memo } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { chrome, colors, iconSize, radii } from '../theme/tokens';
import { text } from '../theme/typography';

/** The topbar `.iconbtn` that opens (and closes) the inline search row. */
export const SearchButton = memo(function SearchButton({
  open,
  onPress,
}: {
  open: boolean;
  onPress: () => void;
}) {
  const Glyph = open ? X : Search;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={open ? 'Close search' : 'Search'}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.iconbtn, pressed ? styles.pressed : null]}
    >
      <Glyph size={iconSize.iconBtn} color={colors.text} strokeWidth={2.2} />
    </Pressable>
  );
});

/** The input row shown under the topbar while search is open. */
export const SearchInput = memo(function SearchInput({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (q: string) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.row}>
      <Search size={iconSize.input} color={colors.placeholder} strokeWidth={2} />
      <TextInput
        autoFocus
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
        accessibilityLabel={placeholder}
        style={styles.input}
      />
    </View>
  );
});

/** Case-insensitive "does any of these fields contain the query". */
export const matchesQuery = (
  query: string,
  ...fields: (string | null | undefined)[]
): boolean => {
  const q = query.trim().toLowerCase();
  return !q || fields.some(f => f?.toLowerCase().includes(q));
};

const styles = StyleSheet.create({
  iconbtn: {
    width: chrome.iconButton,
    height: chrome.iconButton,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  pressed: { opacity: 0.7 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    marginHorizontal: 18,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  input: { flex: 1, ...text(500, 15), color: colors.text, padding: 0 },
});
