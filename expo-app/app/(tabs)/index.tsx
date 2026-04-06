import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/theme';
import { useCatalog } from '../../hooks/useCatalog';
import { useBookmarks } from '../../hooks/useBookmarks';
import {
  getDocumentTitle,
  getFileExtension,
  searchDocuments,
} from '../../services/catalog';
import { Document } from '../../types/document';

const PAGE_SIZE = 15;

const FILTERS = ['Все', 'Курсовые', 'ВКР', 'Рефераты', 'Практика'];

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

export default function CatalogScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string }>();

  const { documents, loading, error, refresh } = useCatalog();
  const { toggle, isBookmarked } = useBookmarks();

  const [activeFilter, setActiveFilter] = useState(params.category ?? 'Все');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [refreshing, setRefreshing] = useState(false);

  // Filter by category
  const categoryFiltered = useMemo(() => {
    if (activeFilter === 'Все') return documents;
    return documents.filter((d) => {
      const cat = (d.category || '').toLowerCase();
      if (activeFilter === 'Практика') return cat.includes('практик');
      return cat.includes(activeFilter.toLowerCase());
    });
  }, [documents, activeFilter]);

  // Apply search
  const filteredDocs = useMemo(() => {
    if (!searchQuery.trim()) return categoryFiltered;
    return searchDocuments(categoryFiltered, searchQuery);
  }, [categoryFiltered, searchQuery]);

  // Paginate
  const visibleDocs = useMemo(
    () => filteredDocs.slice(0, visibleCount),
    [filteredDocs, visibleCount],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const onEndReached = useCallback(() => {
    if (visibleCount < filteredDocs.length) {
      setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filteredDocs.length));
    }
  }, [visibleCount, filteredDocs.length]);

  const renderCard = ({ item }: { item: Document }) => {
    const title = getDocumentTitle(item);
    const bookmarked = isBookmarked(item.file);

    return (
      <Pressable
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
        onPress={() => router.push({ pathname: '/doc', params: { file: encodeURIComponent(item.file) } })}
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
          style={styles.bookmarkBtn}
          onPress={() => toggle(item.file)}
          hitSlop={8}
        >
          <Text style={{ fontSize: 18 }}>{bookmarked ? '\u2B50' : '\u2606'}</Text>
        </Pressable>
      </Pressable>
    );
  };

  // Loading skeleton or error
  if (loading && documents.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Каталог</Text>
        </View>
        <View style={styles.skeletonContainer}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View
              key={i}
              style={[styles.skeletonCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
            >
              <View style={[styles.skeletonIcon, { backgroundColor: colors.mutedBackground }]} />
              <View style={styles.skeletonLines}>
                <View style={[styles.skeletonLine, { width: '75%', backgroundColor: colors.mutedBackground }]} />
                <View style={[styles.skeletonLine, { width: '50%', backgroundColor: colors.mutedBackground }]} />
                <View style={[styles.skeletonLine, { width: '30%', backgroundColor: colors.mutedBackground }]} />
              </View>
            </View>
          ))}
          <ActivityIndicator style={{ marginTop: 16 }} color={colors.accent} />
        </View>
      </View>
    );
  }

  // Error state
  if (!loading && documents.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Каталог</Text>
        </View>
        <View style={{ padding: 32, alignItems: 'center' }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>⚠️</Text>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 8, textAlign: 'center' }}>
            Не удалось загрузить каталог
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginBottom: 16 }}>
            {error || 'Проверьте подключение к интернету'}
          </Text>
          <Pressable
            style={{ backgroundColor: colors.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
            onPress={refresh}
          >
            <Text style={{ color: '#1a1410', fontWeight: '700', fontSize: 14 }}>Повторить</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Каталог</Text>
        <Pressable
          style={[styles.searchBtn, { backgroundColor: colors.surface }]}
          onPress={() => {
            setSearchActive((prev) => !prev);
            if (searchActive) setSearchQuery('');
          }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 18 }}>
            {searchActive ? '\u2715' : '\uD83D\uDD0D'}
          </Text>
        </Pressable>
      </View>

      {searchActive && (
        <View style={styles.searchRow}>
          <TextInput
            style={[styles.searchInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
            placeholder="Поиск документов..."
            placeholderTextColor={colors.placeholder}
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text);
              setVisibleCount(PAGE_SIZE);
            }}
            autoFocus
            autoCapitalize="none"
          />
        </View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersRow}
      >
        {FILTERS.map((f) => (
          <Pressable
            key={f}
            style={[
              styles.filterPill,
              {
                backgroundColor: activeFilter === f ? colors.accent : colors.mutedBackground,
                borderColor: activeFilter === f ? colors.accent : colors.surfaceBorder,
              },
            ]}
            onPress={() => {
              setActiveFilter(f);
              setVisibleCount(PAGE_SIZE);
            }}
          >
            <Text
              style={[
                styles.filterText,
                { color: activeFilter === f ? colors.accentText : colors.textSecondary },
              ]}
            >
              {f}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <FlatList
        data={visibleDocs}
        keyExtractor={(item) => item.file}
        renderItem={renderCard}
        contentContainerStyle={styles.list}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        ListFooterComponent={
          visibleCount < filteredDocs.length ? (
            <ActivityIndicator style={{ paddingVertical: 16 }} color={colors.accent} />
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>{'\uD83D\uDCED'}</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Ничего не найдено
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 28, fontWeight: '700' },
  searchBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: { paddingHorizontal: 16, paddingBottom: 8 },
  searchInput: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  filtersRow: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterText: { fontSize: 14, fontWeight: '600' },
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
  bookmarkBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16 },
  // Skeleton styles
  skeletonContainer: { paddingHorizontal: 16, paddingTop: 16 },
  skeletonCard: {
    flexDirection: 'row',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    alignItems: 'center',
  },
  skeletonIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    marginRight: 12,
  },
  skeletonLines: { flex: 1, gap: 8 },
  skeletonLine: { height: 12, borderRadius: 6 },
});
