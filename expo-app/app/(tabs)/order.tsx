import React, { useState } from 'react';
import {
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
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/theme';

const WORK_TYPES = [
  'Курсовая работа',
  'ВКР / Дипломная',
  'Реферат',
  'Отчёт по практике',
  'Контрольная работа',
  'Эссе',
  'Другое',
];

export default function OrderScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const [step, setStep] = useState(0);
  const [topic, setTopic] = useState('');
  const [workType, setWorkType] = useState('');
  const [deadline, setDeadline] = useState('');
  const [contactVk, setContactVk] = useState('');
  const [contactTg, setContactTg] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const canNext = step === 0 ? topic.trim().length > 0 && workType.length > 0
    : step === 1 ? (contactVk || contactTg || contactPhone || contactEmail).trim().length > 0
    : true;

  const handleSubmit = () => {
    setSubmitted(true);
  };

  const handleReset = () => {
    setStep(0);
    setTopic('');
    setWorkType('');
    setDeadline('');
    setContactVk('');
    setContactTg('');
    setContactPhone('');
    setContactEmail('');
    setComment('');
    setSubmitted(false);
  };

  if (submitted) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <Text style={styles.successIcon}>✅</Text>
        <Text style={[styles.successTitle, { color: colors.text }]}>Заявка отправлена!</Text>
        <Text style={[styles.successDesc, { color: colors.textSecondary }]}>
          Мы свяжемся с вами в ближайшее время{'\n'}для уточнения деталей заказа
        </Text>
        <Pressable
          style={[styles.primaryBtn, { backgroundColor: colors.accent }]}
          onPress={handleReset}
        >
          <Text style={[styles.primaryBtnText, { color: colors.accentText }]}>Новый заказ</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Заказать работу</Text>
        </View>

        {/* Step indicator */}
        <View style={styles.steps}>
          {[0, 1, 2].map((s) => (
            <React.Fragment key={s}>
              {s > 0 && (
                <View style={[styles.stepLine, { backgroundColor: s <= step ? colors.accent : colors.inputBorder }]} />
              )}
              <View
                style={[
                  styles.stepDot,
                  {
                    backgroundColor: s <= step ? colors.accent : 'transparent',
                    borderColor: s <= step ? colors.accent : colors.inputBorder,
                  },
                ]}
              >
                <Text style={[styles.stepNum, { color: s <= step ? colors.accentText : colors.textMuted }]}>
                  {s + 1}
                </Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* Step 1: Topic & Work type */}
        {step === 0 && (
          <View style={styles.stepContent}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Тема работы</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
              placeholder="Например: Психология личности"
              placeholderTextColor={colors.placeholder}
              value={topic}
              onChangeText={setTopic}
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>Тип работы</Text>
            <View style={styles.typesGrid}>
              {WORK_TYPES.map((t) => (
                <Pressable
                  key={t}
                  style={[
                    styles.typeChip,
                    {
                      backgroundColor: workType === t ? colors.accent : colors.mutedBackground,
                      borderColor: workType === t ? colors.accent : colors.inputBorder,
                    },
                  ]}
                  onPress={() => setWorkType(t)}
                >
                  <Text
                    style={[styles.typeChipText, { color: workType === t ? colors.accentText : colors.textSecondary }]}
                  >
                    {t}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Step 2: Deadline & Contacts */}
        {step === 1 && (
          <View style={styles.stepContent}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Срок сдачи</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
              placeholder="Например: 15 мая 2026"
              placeholderTextColor={colors.placeholder}
              value={deadline}
              onChangeText={setDeadline}
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>Контакты (минимум один)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
              placeholder="VK (ссылка или id)"
              placeholderTextColor={colors.placeholder}
              value={contactVk}
              onChangeText={setContactVk}
            />
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
              placeholder="Telegram (@username)"
              placeholderTextColor={colors.placeholder}
              value={contactTg}
              onChangeText={setContactTg}
              autoCapitalize="none"
            />
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
              placeholder="Телефон"
              placeholderTextColor={colors.placeholder}
              value={contactPhone}
              onChangeText={setContactPhone}
              keyboardType="phone-pad"
            />
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
              placeholder="Email"
              placeholderTextColor={colors.placeholder}
              value={contactEmail}
              onChangeText={setContactEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
        )}

        {/* Step 3: Comment & Submit */}
        {step === 2 && (
          <View style={styles.stepContent}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Комментарий к заказу</Text>
            <TextInput
              style={[
                styles.input,
                styles.textArea,
                { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text },
              ]}
              placeholder="Дополнительные требования, пожелания..."
              placeholderTextColor={colors.placeholder}
              value={comment}
              onChangeText={setComment}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />

            <View style={[styles.summary, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
              <Text style={[styles.summaryTitle, { color: colors.text }]}>Итого</Text>
              <Text style={[styles.summaryRow, { color: colors.textSecondary }]}>Тип: {workType}</Text>
              <Text style={[styles.summaryRow, { color: colors.textSecondary }]}>Тема: {topic}</Text>
              {deadline ? (
                <Text style={[styles.summaryRow, { color: colors.textSecondary }]}>Срок: {deadline}</Text>
              ) : null}
            </View>
          </View>
        )}

        {/* Navigation buttons */}
        <View style={styles.nav}>
          {step > 0 && (
            <Pressable
              style={[styles.secondaryBtn, { borderColor: colors.inputBorder }]}
              onPress={() => setStep(step - 1)}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>Назад</Text>
            </Pressable>
          )}
          <Pressable
            style={[
              styles.primaryBtn,
              { backgroundColor: canNext ? colors.accent : colors.mutedBackground, flex: step > 0 ? 1 : undefined },
            ]}
            onPress={() => {
              if (!canNext) {
                Alert.alert('Заполните обязательные поля');
                return;
              }
              if (step < 2) setStep(step + 1);
              else handleSubmit();
            }}
          >
            <Text style={[styles.primaryBtnText, { color: canNext ? colors.accentText : colors.textMuted }]}>
              {step < 2 ? 'Далее' : 'Отправить заявку'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: 40 },
  header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 8 },
  headerTitle: { fontSize: 28, fontWeight: '700' },
  steps: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 20 },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNum: { fontSize: 14, fontWeight: '700' },
  stepLine: { width: 48, height: 2 },
  stepContent: { paddingHorizontal: 20 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  input: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 4,
  },
  textArea: { height: 120, paddingTop: 14 },
  typesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  typeChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  typeChipText: { fontSize: 14, fontWeight: '600' },
  summary: { marginTop: 20, padding: 16, borderRadius: 16, borderWidth: 1 },
  summaryTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  summaryRow: { fontSize: 14, marginBottom: 4 },
  nav: { flexDirection: 'row', paddingHorizontal: 20, paddingTop: 24, gap: 12 },
  primaryBtn: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    height: 52,
    paddingHorizontal: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { fontSize: 16, fontWeight: '600' },
  successIcon: { fontSize: 64, marginBottom: 16 },
  successTitle: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  successDesc: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
});
