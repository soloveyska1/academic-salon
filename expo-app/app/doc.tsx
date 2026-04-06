import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/theme';
import { useCatalog } from '../hooks/useCatalog';
import { useBookmarks } from '../hooks/useBookmarks';
import {
  downloadDocumentFile,
  estimatePages,
  getCategoryEmoji,
  getDocumentDescription,
  getDocumentTitle,
  getFileExtension,
  inferWorkType,
  openDocumentFile,
} from '../services/catalog';
import { getClientId, recordEvent } from '../services/stats';

function resolveParamFile(fileParam: string | string[] | undefined) {
  if (Array.isArray(fileParam)) return fileParam.join('/');
  return fileParam ?? '';
}

export default function DocumentScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const router = useRouter();
  const { file } = useLocalSearchParams<{ file?: string | string[] }>();
  const { documents, loading, error } = useCatalog();
  const { toggle, isBookmarked } = useBookmarks();
  const [busyAction, setBusyAction] = useState<'open' | 'download' | null>(null);

  const requestedFile = resolveParamFile(file);

  const document = useMemo(() => {
    const decoded = decodeURIComponent(requestedFile);
    return documents.find((item) => item.file === requestedFile || item.file === decoded);
  }, [documents, requestedFile]);

  const relatedDocuments = useMemo(() => {
    if (!document) return [];

    return documents
      .filter((item) => {
        if (item.file === document.file) return false;
        if (document.subject && item.subject === document.subject) return true;
        return item.category === document.category;
      })
      .slice(0, 3);
  }, [document, documents]);

  const title = document ? getDocumentTitle(document) : 'Документ';
  const description = document ? getDocumentDescription(document) : '';
  const bookmarked = document ? isBookmarked(document.file) : false;

  useEffect(() => {
    if (!document) return;

    let active = true;
    (async () => {
      try {
        const clientId = await getClientId();
        if (active) {
          await recordEvent(document.file, 'view', clientId);
        }
      } catch {
        // Ignore analytics failures to keep document opening instant.
      }
    })();

    return () => {
      active = false;
    };
  }, [document]);

  const runDocumentAction = async (action: 'open' | 'download') => {
    if (!document || busyAction) return;

    setBusyAction(action);
    try {
      if (action === 'open') {
        await openDocumentFile(document.file);
      } else {
        await downloadDocumentFile(document.file);
      }

      try {
        const clientId = await getClientId();
        await recordEvent(document.file, 'download', clientId);
      } catch {
        // Ignore analytics failures after a successful user action.
      }
    } catch {
      Alert.alert('Не удалось открыть файл', 'Попробуйте ещё раз или скачайте документ напрямую.');
    } finally {
      setBusyAction(null);
    }
  };

  if (loading && documents.length === 0) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (error && documents.length === 0) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Документ' }} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>Каталог недоступен</Text>
        <Text style={[styles.emptyDescription, { color: colors.textSecondary }]}>
          Не удалось загрузить данные документа. Попробуйте открыть его ещё раз.
        </Text>
        <Pressable
          style={[styles.primaryButton, { backgroundColor: colors.accent }]}
          onPress={() => router.replace('/(tabs)')}
        >
          <Text style={[styles.primaryButtonText, { color: colors.accentText }]}>К каталогу</Text>
        </Pressable>
      </View>
    );
  }

  if (!document) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Документ' }} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>Документ не найден</Text>
        <Text style={[styles.emptyDescription, { color: colors.textSecondary }]}>
          Вернитесь в каталог и попробуйте открыть материал ещё раз.
        </Text>
        <Pressable
          style={[styles.primaryButton, { backgroundColor: colors.accent }]}
          onPress={() => router.replace('/(tabs)')}
        >
          <Text style={[styles.primaryButtonText, { color: colors.accentText }]}>К каталогу</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable
            style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
            onPress={() => router.back()}
          >
            <Text style={[styles.iconButtonText, { color: colors.text }]}>←</Text>
          </Pressable>
          <Pressable
            style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
            onPress={() => toggle(document.file)}
          >
            <Text style={[styles.iconButtonText, { color: bookmarked ? colors.accent : colors.textSecondary }]}>
              {bookmarked ? '★' : '☆'}
            </Text>
          </Pressable>
        </View>

        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          <View style={styles.heroBadgeRow}>
            <View style={[styles.fileBadge, { backgroundColor: colors.docx + '18' }]}>
              <Text style={[styles.fileBadgeText, { color: colors.docx }]}>
                {getFileExtension(document.file).toUpperCase() || 'DOC'}
              </Text>
            </View>
            <Text style={[styles.categoryKicker, { color: colors.accent }]}>
              {getCategoryEmoji(document.category)} {document.category}
            </Text>
          </View>

          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          {description ? (
            <Text style={[styles.description, { color: colors.textSecondary }]}>{description}</Text>
          ) : null}

          <View style={styles.metaRow}>
            {document.subject ? (
              <View style={[styles.metaChip, { backgroundColor: colors.mutedBackground, borderColor: colors.surfaceBorder }]}>
                <Text style={[styles.metaChipText, { color: colors.textSecondary }]}>{document.subject}</Text>
              </View>
            ) : null}
            {document.course ? (
              <View style={[styles.metaChip, { backgroundColor: colors.mutedBackground, borderColor: colors.surfaceBorder }]}>
                <Text style={[styles.metaChipText, { color: colors.textSecondary }]}>{document.course}</Text>
              </View>
            ) : null}
            <View style={[styles.metaChip, { backgroundColor: colors.mutedBackground, borderColor: colors.surfaceBorder }]}>
              <Text style={[styles.metaChipText, { color: colors.textSecondary }]}>{estimatePages(document.size)} стр.</Text>
            </View>
            <View style={[styles.metaChip, { backgroundColor: colors.mutedBackground, borderColor: colors.surfaceBorder }]}>
              <Text style={[styles.metaChipText, { color: colors.textSecondary }]}>{document.size}</Text>
            </View>
          </View>

          <View style={styles.actionColumn}>
            <Pressable
              style={[styles.primaryButton, { backgroundColor: colors.accent }]}
              onPress={() => runDocumentAction('open')}
              disabled={busyAction !== null}
            >
              {busyAction === 'open' ? (
                <ActivityIndicator color={colors.accentText} />
              ) : (
                <Text style={[styles.primaryButtonText, { color: colors.accentText }]}>Открыть файл</Text>
              )}
            </Pressable>

            <Pressable
              style={[styles.secondaryButton, { backgroundColor: colors.mutedBackground, borderColor: colors.inputBorder }]}
              onPress={() => runDocumentAction('download')}
              disabled={busyAction !== null}
            >
              {busyAction === 'download' ? (
                <ActivityIndicator color={colors.textSecondary} />
              ) : (
                <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>Скачать</Text>
              )}
            </Pressable>
          </View>
        </View>

        <View style={[styles.conciergeCard, { backgroundColor: colors.bg3, borderColor: colors.surfaceBorder }]}>
          <Text style={[styles.conciergeTitle, { color: colors.text }]}>Нужна работа под свою тему?</Text>
          <Text style={[styles.conciergeText, { color: colors.textSecondary }]}>
            Возьмём этот материал за ориентир и соберём заказ под ваши требования.
          </Text>
          <Pressable
            style={[styles.conciergeButton, { backgroundColor: colors.tintLight, borderColor: colors.accent }]}
            onPress={() =>
              router.push({
                pathname: '/(tabs)/order',
                params: { topic: title, workType: inferWorkType(document) },
              })
            }
          >
            <Text style={[styles.conciergeButtonText, { color: colors.accent }]}>Перейти к заказу</Text>
          </Pressable>
        </View>

        {relatedDocuments.length > 0 ? (
          <View style={styles.relatedSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Похожие материалы</Text>
            {relatedDocuments.map((item) => (
              <Pressable
                key={item.file}
                style={[styles.relatedCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
                onPress={() => router.replace({ pathname: '/doc', params: { file: item.file } })}
              >
                <Text style={[styles.relatedTitle, { color: colors.text }]} numberOfLines={2}>
                  {getDocumentTitle(item)}
                </Text>
                <Text style={[styles.relatedMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                  {[item.category, item.subject, item.size].filter(Boolean).join(' · ')}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  scroll: {
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 42,
    gap: 18,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  iconButton: {
    width: 46,
    height: 46,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonText: {
    fontSize: 22,
    fontWeight: '700',
  },
  heroCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
    gap: 16,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  fileBadge: {
    minWidth: 58,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  fileBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  categoryKicker: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },
  description: {
    fontSize: 15,
    lineHeight: 24,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  metaChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  actionColumn: {
    gap: 10,
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    minHeight: 52,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  conciergeCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    gap: 10,
  },
  conciergeTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  conciergeText: {
    fontSize: 14,
    lineHeight: 22,
  },
  conciergeButton: {
    alignSelf: 'flex-start',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 6,
  },
  conciergeButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  relatedSection: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 2,
  },
  relatedCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 6,
  },
  relatedTitle: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  relatedMeta: {
    fontSize: 13,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 10,
  },
  emptyDescription: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
});
