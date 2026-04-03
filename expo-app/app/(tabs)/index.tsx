import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/theme';

interface Doc {
  file: string;
  filename: string;
  title: string;
  category: string;
  subject: string;
  course: string;
  size: string;
  exists: boolean;
}

const SAMPLE_DOCS: Doc[] = [
  { file: 'files/sample1.docx', filename: 'sample1.docx', title: 'Курсовая по психологии личности', category: 'Курсовые', subject: 'Психология', course: '2 курс', size: '145.2 KB', exists: true },
  { file: 'files/sample2.pdf', filename: 'sample2.pdf', title: 'ВКР: Социальная адаптация детей-сирот', category: 'ВКР и дипломы', subject: 'Социальная работа', course: '4 курс', size: '2.1 MB', exists: true },
  { file: 'files/sample3.docx', filename: 'sample3.docx', title: 'Отчёт по производственной практике', category: 'Отчёты по практике', subject: 'Психология', course: '3 курс', size: '89.4 KB', exists: true },
  { file: 'files/sample4.docx', filename: 'sample4.docx', title: 'Реферат: Девиантное поведение подростков', category: 'Рефераты', subject: 'Психология', course: '1 курс', size: '52.1 KB', exists: true },
  { file: 'files/sample5.pdf', filename: 'sample5.pdf', title: 'Конспект лекций по конфликтологии', category: 'Конспекты лекций', subject: 'Конфликтология', course: '2 курс', size: '312.5 KB', exists: true },
];

const FILTERS = ['Все', 'Курсовые', 'ВКР', 'Рефераты', 'Практика'];

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

export default function CatalogScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState('Все');
  const [refreshing, setRefreshing] = useState(false);

  const filteredDocs = activeFilter === 'Все'
    ? SAMPLE_DOCS
    : SAMPLE_DOCS.filter((d) => {
        if (activeFilter === 'Практика') return d.category.includes('практик');
        return d.category.toLowerCase().includes(activeFilter.toLowerCase());
      });

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const renderCard = ({ item }: { item: Doc }) => (
    <Pressable
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
      onPress={() => router.push(`/doc/${encodeURIComponent(item.file)}`)}
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Каталог</Text>
        <Pressable style={[styles.searchBtn, { backgroundColor: colors.surface }]}>
          <Text style={{ color: colors.textSecondary, fontSize: 18 }}>🔍</Text>
        </Pressable>
      </View>

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
            onPress={() => setActiveFilter(f)}
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
        data={filteredDocs}
        keyExtractor={(item) => item.file}
        renderItem={renderCard}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyIcon]}>📭</Text>
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
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16 },
});
