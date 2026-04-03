import React from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/theme';

interface Category {
  name: string;
  emoji: string;
  count: number;
}

const CATEGORIES: Category[] = [
  { name: 'ВКР и дипломы', emoji: '🎓', count: 13 },
  { name: 'Самостоятельные работы', emoji: '📝', count: 162 },
  { name: 'Отчёты по практике', emoji: '📋', count: 17 },
  { name: 'Методические материалы', emoji: '📖', count: 18 },
  { name: 'Курсовые', emoji: '📚', count: 6 },
  { name: 'Конспекты лекций', emoji: '📑', count: 5 },
  { name: 'НПР', emoji: '🔬', count: 4 },
  { name: 'Рефераты', emoji: '📄', count: 4 },
  { name: 'Эссе', emoji: '✍️', count: 3 },
  { name: 'Другое', emoji: '📁', count: 3 },
];

const COURSES = ['1 курс', '2 курс', '3 курс', '4 курс'];

export default function CategoriesScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];

  const renderCategory = ({ item }: { item: Category }) => (
    <Pressable
      style={[styles.categoryCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
      onPress={() => Alert.alert(item.name, `${item.count} документов`)}
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Разделы</Text>
      </View>

      <FlatList
        data={CATEGORIES}
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
                  onPress={() => Alert.alert(course, 'Фильтр по курсу')}
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
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  headerTitle: { fontSize: 28, fontWeight: '700' },
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
