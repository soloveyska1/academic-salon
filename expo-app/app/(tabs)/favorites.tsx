import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/theme';

interface Doc {
  file: string;
  filename: string;
  title: string;
  category: string;
  subject: string;
  size: string;
}

const FAVORITES: Doc[] = [];

function getFileColor(filename: string, colors: typeof Colors.light): string {
  if (filename.endsWith('.pdf')) return colors.pdf;
  if (filename.endsWith('.pptx')) return colors.pptx;
  return colors.docx;
}

function getFileIcon(filename: string): string {
  if (filename.endsWith('.pdf')) return 'PDF';
  if (filename.endsWith('.pptx')) return 'PPT';
  return 'DOC';
}

export default function FavoritesScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];

  const renderCard = ({ item }: { item: Doc }) => (
    <Pressable
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
    >
      <View style={[styles.fileIcon, { backgroundColor: getFileColor(item.filename, colors) + '18' }]}>
        <Text style={[styles.fileIconText, { color: getFileColor(item.filename, colors) }]}>
          {getFileIcon(item.filename)}
        </Text>
      </View>
      <View style={styles.cardContent}>
        <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
          {item.category} &middot; {item.subject}
        </Text>
        <Text style={[styles.cardSize, { color: colors.muted }]}>{item.size}</Text>
      </View>
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Избранное</Text>
      </View>

      {FAVORITES.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>⭐</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            Нет сохранённых работ
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
            Добавляйте документы в избранное,{'\n'}чтобы быстро находить их здесь
          </Text>
        </View>
      ) : (
        <FlatList
          data={FAVORITES}
          keyExtractor={(item) => item.file}
          renderItem={renderCard}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  headerTitle: { fontSize: 28, fontWeight: '700' },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  card: {
    flexDirection: 'row',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    alignItems: 'center',
  },
  fileIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  fileIconText: { fontSize: 13, fontWeight: '800' },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  cardMeta: { fontSize: 12, marginBottom: 2 },
  cardSize: { fontSize: 11 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
