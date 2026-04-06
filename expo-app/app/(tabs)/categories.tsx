import React, { useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/theme';
import { useCatalog } from '../../hooks/useCatalog';
import { getCategoryEmoji } from '../../services/catalog';

interface Category {
  name: string;
  emoji: string;
  count: number;
}

const COURSES = ['1 курс', '2 курс', '3 курс', '4 курс'];

export default function CategoriesScreen() {
  const colors = Colors.dark;
  const router = useRouter();
  const { documents, loading } = useCatalog();

  const categories = useMemo<Category[]>(() => {
    const counts: Record<string, number> = {};
    for (const doc of documents) {
      const cat = doc.category || 'Другое';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, count]) => ({
        name,
        emoji: getCategoryEmoji(name),
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [documents]);

  const handleCategoryPress = (categoryName: string) => {
    router.push({ pathname: '/', params: { category: categoryName } });
  };

  const handleCoursePress = (course: string) => {
    router.push({ pathname: '/', params: { category: course } });
  };

  const renderCategory = ({ item }: { item: Category }) => (
    <Pressable
      style={[styles.categoryCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
      onPress={() => handleCategoryPress(item.name)}
    >
      <Text style={styles.categoryEmoji}>{item.emoji}</Text>
      <Text style={[styles.categoryName, { color: colors.text }]} numberOfLines={2}>
        {item.name}
      </Text>
      <Text style={[styles.categoryCount, { color: colors.textSecondary }]}>
        {item.count} док.
      </Text>
    </Pressable>
  );

  if (loading && documents.length === 0) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Разделы</Text>
        <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
          {documents.length} документов
        </Text>
      </View>

      <FlatList
        data={categories}
        keyExtractor={(item) => item.name}
        renderItem={renderCategory}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        ListFooterComponent={
          <View style={styles.coursesSection}>
            <Text style={[styles.coursesTitle, { color: colors.text }]}>
              Подборки по курсам
            </Text>
            <View style={styles.coursesRow}>
              {COURSES.map((course) => (
                <Pressable
                  key={course}
                  style={[styles.courseBtn, { backgroundColor: colors.tintLight, borderColor: colors.accent }]}
                  onPress={() => handleCoursePress(course)}
                >
                  <Text style={[styles.courseBtnText, { color: colors.accent }]}>{course}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  headerTitle: { fontSize: 28, fontWeight: '700' },
  headerSubtitle: { fontSize: 14, marginTop: 4 },
  grid: { paddingHorizontal: 16, paddingBottom: 32 },
  row: { justifyContent: 'space-between', marginBottom: 10 },
  categoryCard: {
    width: '48%',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  categoryEmoji: { fontSize: 32, marginBottom: 8 },
  categoryName: { fontSize: 14, fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  categoryCount: { fontSize: 12 },
  coursesSection: { paddingTop: 20, paddingHorizontal: 4 },
  coursesTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  coursesRow: { flexDirection: 'row', justifyContent: 'space-between' },
  courseBtn: {
    flex: 1,
    marginHorizontal: 4,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  courseBtnText: { fontSize: 13, fontWeight: '700' },
});
