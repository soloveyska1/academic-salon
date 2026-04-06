import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Colors } from '../../constants/theme';
import { submitOrder } from '../../services/orders';

const WORK_TYPES = [
  'Курсовая работа',
  'ВКР / Дипломная',
  'Реферат',
  'Отчёт по практике',
  'Контрольная работа',
  'Эссе',
  'Другое',
] as const;

const DEADLINE_PRESETS = [
  'Срочно',
  '3 дня',
  'Неделя',
  '2 недели',
  'Есть время',
] as const;

const CONTACT_METHODS = ['VK', 'Telegram', 'Телефон', 'Email'] as const;

const CONTACT_PLACEHOLDERS: Record<(typeof CONTACT_METHODS)[number], string> = {
  VK: 'Ссылка или id во ВКонтакте',
  Telegram: '@username',
  Телефон: '+7...',
  Email: 'mail@example.com',
};

function paramValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default function OrderScreen() {
  const colors = Colors.dark;
  const params = useLocalSearchParams<{ topic?: string | string[]; workType?: string | string[] }>();

  const [topic, setTopic] = useState(paramValue(params.topic));
  const [workType, setWorkType] = useState(paramValue(params.workType));
  const [deadlinePreset, setDeadlinePreset] = useState('');
  const [deadlineDetails, setDeadlineDetails] = useState('');
  const [contactMethod, setContactMethod] = useState<(typeof CONTACT_METHODS)[number]>('Telegram');
  const [primaryContact, setPrimaryContact] = useState('');
  const [reserveContact, setReserveContact] = useState('');
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const nextTopic = paramValue(params.topic);
    const nextType = paramValue(params.workType);
    if (nextTopic) setTopic(nextTopic);
    if (nextType) setWorkType(nextType);
  }, [params.topic, params.workType]);

  const deadline = useMemo(() => {
    if (deadlineDetails.trim()) return deadlineDetails.trim();
    return deadlinePreset;
  }, [deadlineDetails, deadlinePreset]);

  const canSubmit = topic.trim().length > 0 && workType.length > 0 && primaryContact.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) {
      Alert.alert('Проверьте форму', 'Нужны тема, тип работы и хотя бы один контакт.');
      return;
    }

    setSubmitting(true);
    try {
      const contacts = [`${contactMethod}: ${primaryContact.trim()}`];
      if (reserveContact.trim()) {
        contacts.push(`Дополнительно: ${reserveContact.trim()}`);
      }

      const result = await submitOrder({
        workType,
        topic: topic.trim(),
        subject: '',
        deadline,
        contact: contacts.join(' | '),
        comment: comment.trim(),
      });

      if (result.ok) {
        setSubmitted(true);
      } else {
        Alert.alert('Не удалось отправить заявку', result.error || 'Попробуйте ещё раз чуть позже.');
      }
    } catch {
      Alert.alert('Не удалось отправить заявку', 'Проверьте соединение и попробуйте ещё раз.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setTopic('');
    setWorkType('');
    setDeadlinePreset('');
    setDeadlineDetails('');
    setContactMethod('Telegram');
    setPrimaryContact('');
    setReserveContact('');
    setComment('');
    setSubmitted(false);
  };

  if (submitted) {
    return (
      <View style={[styles.successScreen, { backgroundColor: colors.background }]}>
        <Text style={styles.successEmoji}>✦</Text>
        <Text style={[styles.successTitle, { color: colors.text }]}>Заявка отправлена</Text>
        <Text style={[styles.successText, { color: colors.textSecondary }]}>
          Мы посмотрим тему, срок и свяжемся с вами по указанному контакту.
        </Text>
        <Pressable
          style={[styles.primaryButton, { backgroundColor: colors.accent }]}
          onPress={handleReset}
        >
          <Text style={[styles.primaryButtonText, { color: colors.accentText }]}>Новая заявка</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.kicker, { color: colors.accent }]}>Индивидуальная работа</Text>
          <Text style={[styles.title, { color: colors.text }]}>Заказать</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Тема, срок и удобный контакт. Остальное уточним уже по делу.
          </Text>
        </View>

        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          <Text style={[styles.heroTitle, { color: colors.text }]}>Под вашу тему и требования</Text>
          <Text style={[styles.heroText, { color: colors.textSecondary }]}>
            Подскажем формат, сориентируем по сроку и соберём работу под ваш запрос.
          </Text>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Что нужно сделать</Text>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Тема</Text>
          <TextInput
            style={[
              styles.input,
              styles.topicInput,
              { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text },
            ]}
            placeholder="Например: Социальная адаптация подростков"
            placeholderTextColor={colors.placeholder}
            multiline
            value={topic}
            onChangeText={setTopic}
            textAlignVertical="top"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Тип работы</Text>
          <View style={styles.chipsWrap}>
            {WORK_TYPES.map((item) => {
              const active = workType === item;
              return (
                <Pressable
                  key={item}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? colors.tintLight : colors.mutedBackground,
                      borderColor: active ? colors.accent : colors.inputBorder,
                    },
                  ]}
                  onPress={() => setWorkType(item)}
                >
                  <Text style={[styles.chipText, { color: active ? colors.accent : colors.textSecondary }]}>
                    {item}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Срок</Text>
          <View style={styles.chipsWrap}>
            {DEADLINE_PRESETS.map((item) => {
              const active = deadlinePreset === item;
              return (
                <Pressable
                  key={item}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? colors.tintLight : colors.mutedBackground,
                      borderColor: active ? colors.accent : colors.inputBorder,
                    },
                  ]}
                  onPress={() => setDeadlinePreset(item)}
                >
                  <Text style={[styles.chipText, { color: active ? colors.accent : colors.textSecondary }]}>
                    {item}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
            placeholder="Если нужно, укажите точную дату или пояснение"
            placeholderTextColor={colors.placeholder}
            value={deadlineDetails}
            onChangeText={setDeadlineDetails}
          />
        </View>

        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Куда ответить</Text>
          <View style={styles.chipsWrap}>
            {CONTACT_METHODS.map((item) => {
              const active = contactMethod === item;
              return (
                <Pressable
                  key={item}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? colors.tintLight : colors.mutedBackground,
                      borderColor: active ? colors.accent : colors.inputBorder,
                    },
                  ]}
                  onPress={() => setContactMethod(item)}
                >
                  <Text style={[styles.chipText, { color: active ? colors.accent : colors.textSecondary }]}>
                    {item}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
            placeholder={CONTACT_PLACEHOLDERS[contactMethod]}
            placeholderTextColor={colors.placeholder}
            value={primaryContact}
            onChangeText={setPrimaryContact}
            autoCapitalize={contactMethod === 'Email' || contactMethod === 'Telegram' ? 'none' : 'sentences'}
            keyboardType={contactMethod === 'Телефон' ? 'phone-pad' : contactMethod === 'Email' ? 'email-address' : 'default'}
          />

          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
            placeholder="Дополнительный контакт, если нужен"
            placeholderTextColor={colors.placeholder}
            value={reserveContact}
            onChangeText={setReserveContact}
            autoCapitalize="none"
          />
        </View>

        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Комментарий</Text>
          <TextInput
            style={[
              styles.input,
              styles.commentInput,
              { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text },
            ]}
            placeholder="Можно добавить требования преподавателя или важные детали"
            placeholderTextColor={colors.placeholder}
            multiline
            value={comment}
            onChangeText={setComment}
            textAlignVertical="top"
          />
        </View>

        <View style={[styles.summaryCard, { backgroundColor: colors.bg3, borderColor: colors.surfaceBorder }]}>
          <Text style={[styles.summaryTitle, { color: colors.text }]}>Проверка перед отправкой</Text>
          <Text style={[styles.summaryRow, { color: colors.textSecondary }]}>
            Тип: {workType || 'не выбран'}
          </Text>
          <Text style={[styles.summaryRow, { color: colors.textSecondary }]}>
            Срок: {deadline || 'уточним с вами'}
          </Text>
          <Text style={[styles.summaryRow, { color: colors.textSecondary }]}>
            Контакт: {primaryContact.trim() ? `${contactMethod} — ${primaryContact.trim()}` : 'не указан'}
          </Text>
        </View>

        <Pressable
          style={[
            styles.primaryButton,
            {
              backgroundColor: canSubmit && !submitting ? colors.accent : colors.mutedBackground,
              opacity: submitting ? 0.86 : 1,
            },
          ]}
          onPress={handleSubmit}
        >
          {submitting ? (
            <ActivityIndicator color={colors.accentText} />
          ) : (
            <Text style={[styles.primaryButtonText, { color: canSubmit ? colors.accentText : colors.textMuted }]}>
              Отправить заявку
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    paddingHorizontal: 18,
    paddingTop: 58,
    paddingBottom: 42,
    gap: 16,
  },
  header: {
    gap: 8,
    paddingHorizontal: 2,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 24,
  },
  heroCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    gap: 8,
  },
  heroTitle: {
    fontSize: 19,
    fontWeight: '700',
  },
  heroText: {
    fontSize: 14,
    lineHeight: 22,
  },
  sectionCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 15,
  },
  topicInput: {
    minHeight: 110,
    paddingTop: 14,
    paddingBottom: 14,
  },
  commentInput: {
    minHeight: 120,
    paddingTop: 14,
    paddingBottom: 14,
  },
  summaryCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    gap: 8,
  },
  summaryTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  summaryRow: {
    fontSize: 14,
    lineHeight: 22,
  },
  primaryButton: {
    minHeight: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    marginTop: 4,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '800',
  },
  successScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  successEmoji: {
    fontSize: 44,
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 10,
  },
  successText: {
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 28,
  },
});
