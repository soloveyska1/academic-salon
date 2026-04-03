import React, { useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/theme';
import { useCatalog } from '../../hooks/useCatalog';
import { useBookmarks } from '../../hooks/useBookmarks';
import { getDocumentTitle, getFileExtension } from '../../services/catalog';
import { Document } from '../../types/document';

function getFileColor(filename: string, colors: typeof Colors.light): string {
  const ext = getFileExtension(filename);
  if (ext === 'pdf') return colors.pdf;
  if (ext === 'pptx' || ext === 'ppt') return colors.pptx;
  return colors.docx;
}

function getFileIcon(filename: string): string {
  const ext = getFileExtension(filename);
  if (ext === 'pdf') return 'PDF';
  if (ext === 'pptx' || ext === 'ppt') return 'PPT';
  return 'DOC';
}

export default function FavoritesScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const router = useRouter();
  const { documents, loading } = useCatalog();
  const { bookmarks, toggle } = useBookmarks();

  const favorited = useMemo(
    () => documents.filter((d) => bookmarks.has(d.file)),
    [documents, bookmarks],
  );

  const renderCard = ({ item }: { item: Document }) => {
    const title = getDocumentTitle(item);

    return (
      <Pressable
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
        onPress={() => router.push(`/doc/${encodeURIComponent(item.file)}`)}
      >
        <View style={[styles.fileIcon, { backgroundColor: getFileColor(item.file, colors) + '18' }]}>
          <Text style={[styles.fileIconText, { color: getFileColor(item.file, colors) }]}>
            {getFileIcon(item.file)}
          </Text>
        </View>
        <View style={styles.cardContent}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
            {title}
          </Text>
          <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
            {item.category} &middot; {item.subject}
          </Text>
          <Text style={[styles.cardSize, { color: colors.muted }]}>{item.size}</Text>
        </View>
        <Pressable
          style={styles.removeBtn}
          onPress={() => toggle(item.file)}
          hitSlop={8}
        >
          <Text style={{ fontSize: 18, color: colors.red }}>{'\u2715'}</Text>
        </Pressable>
      </Pressable>
    );
  };

  if (loading && documents.length === 0) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Избранное</Text>
        {favorited.length > 0 && (
          <Text style={[styles.headerCount, { color: colors.textSecondary }]}>
            {favorited.length} док.
          </Text>
        )}
      </View>

      {favorited.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>{'\u2B50'}</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            Нет сохранённых работ
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
            Добавляйте документы в избранное,{'\n'}чтобы быстро находить их здесь
          </Text>
        </View>
      ) : (
        <FlatList
          data={favorited}
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
  centerContent: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  headerTitle: { fontSize: 28, fontWeight: '700' },
  headerCount: { fontSize: 14 },
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
  removeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
