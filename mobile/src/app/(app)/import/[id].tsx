import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { type ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { Button, Card, Message, Screen, TextField } from '@/components/ui';
import { bagKeys } from '@/lib/bags';
import {
  confirmImport,
  findExistingCoffee,
  type ImportJob,
  importKeys,
  rejectImport,
  retryImport,
  useImportJob,
} from '@/lib/imports';
import {
  type ExtractedField,
  type Extraction,
  formFromExtraction,
  isUncertain,
  ROAST_LEVELS,
  type ReviewForm,
  reviewedFromForm,
} from '@/lib/review';
import { colors, radius, space, typography } from '@/lib/theme';

type CoffeeTextKey = {
  [K in keyof ReviewForm['coffee']]: ReviewForm['coffee'][K] extends string ? K : never;
}[keyof ReviewForm['coffee']];

type BagKey = keyof ReviewForm['bag'];

interface FieldConfig<K> {
  key: K;
  label: string;
  placeholder?: string;
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad';
  multiline?: boolean;
}

const COFFEE_FIELDS: FieldConfig<CoffeeTextKey>[] = [
  { key: 'name', label: 'Name' },
  { key: 'roaster', label: 'Roaster' },
  { key: 'country', label: 'Country' },
  { key: 'region', label: 'Region' },
  { key: 'producer', label: 'Producer' },
  { key: 'process', label: 'Process' },
  { key: 'varieties', label: 'Varieties', placeholder: 'Geisha 70%, Bourbon 30%' },
  { key: 'altitude_masl', label: 'Altitude (metres)', keyboardType: 'number-pad' },
  { key: 'tasting_notes', label: 'Tasting notes', placeholder: 'jasmine, bergamot' },
  { key: 'description', label: 'Description', multiline: true },
];

const BAG_FIELDS: FieldConfig<BagKey>[] = [
  { key: 'roast_date', label: 'Roast date', placeholder: 'YYYY-MM-DD' },
  { key: 'initial_grams', label: 'Weight (grams)', keyboardType: 'decimal-pad' },
  { key: 'price', label: 'Price', keyboardType: 'decimal-pad' },
  { key: 'currency', label: 'Currency', placeholder: 'EUR' },
  { key: 'vendor', label: 'Bought from' },
];

function hintFor(field: ExtractedField<unknown>): string | undefined {
  return isUncertain(field) ? `Please check: ${Math.round(field.confidence * 100)}% sure` : undefined;
}

function describeConfirmError(err: Error): string {
  if ((err as { code?: string }).code === '23505') {
    return 'You already have a coffee with this name from this roaster. Add the bag to that coffee, or change the name.';
  }
  return err.message;
}

export default function ImportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: job, error, isLoading } = useImportJob(id);

  if (isLoading) {
    return (
      <Centered>
        <ActivityIndicator color={colors.primary} />
      </Centered>
    );
  }

  if (error || !job) {
    return (
      <Centered>
        <Message tone="error">{error?.message ?? 'This import could not be found.'}</Message>
      </Centered>
    );
  }

  switch (job.status) {
    case 'pending':
    case 'extracting':
      return (
        <Centered>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={typography.heading}>Reading the label…</Text>
          <Text style={[typography.muted, styles.centerText]}>
            This usually takes under a minute. You can leave this screen; the import keeps going.
          </Text>
        </Centered>
      );
    case 'failed':
      return <Failed job={job} />;
    case 'extracted':
      return <Review key={job.processed_at ?? job.id} job={job} />;
    case 'confirmed':
      return <Finished title="Added to your beans" />;
    case 'rejected':
      return <Finished title="Import discarded" />;
  }
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <Screen edges={['bottom', 'left', 'right']} style={styles.centered}>
      {children}
    </Screen>
  );
}

function Finished({ title }: { title: string }) {
  return (
    <Centered>
      <Text style={typography.heading}>{title}</Text>
      <Button title="Go to my beans" onPress={() => router.navigate('/')} />
    </Centered>
  );
}

function useDiscard(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => rejectImport(jobId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: importKeys.all });
      router.back();
    },
  });
}

function Failed({ job }: { job: ImportJob }) {
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: () => retryImport(job.id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: importKeys.job(job.id) }),
  });
  const discard = useDiscard(job.id);

  return (
    <Screen edges={['bottom', 'left', 'right']} style={styles.padded}>
      <Text style={typography.heading}>This import didn&apos;t work</Text>
      <Message tone="error">{job.error_message ?? 'Something went wrong while reading the source.'}</Message>
      {retry.error ? <Message tone="error">{retry.error.message}</Message> : null}
      {discard.error ? <Message tone="error">{discard.error.message}</Message> : null}
      <Button title="Try again" onPress={() => retry.mutate()} loading={retry.isPending} disabled={discard.isPending} />
      <Button
        title="Discard"
        variant="danger"
        onPress={() => discard.mutate()}
        loading={discard.isPending}
        disabled={retry.isPending}
      />
    </Screen>
  );
}

function Review({ job }: { job: ImportJob }) {
  const queryClient = useQueryClient();
  const extraction = job.extracted as unknown as Extraction;
  const [form, setForm] = useState<ReviewForm>(() => formFromExtraction(extraction));
  const [addToExisting, setAddToExisting] = useState(true);

  // Checked once, against what Claude read. The user decides what a match means.
  const match = useQuery({
    queryKey: ['coffee-match', job.id],
    queryFn: () => findExistingCoffee(extraction.coffee.name.value ?? '', extraction.coffee.roaster.value ?? ''),
  });
  const existing = match.data ?? null;
  const existingCoffeeId = existing && addToExisting ? existing.id : null;

  const confirm = useMutation({
    // Validation errors thrown by reviewedFromForm surface as mutation errors.
    mutationFn: async () => confirmImport(job.id, reviewedFromForm(form, existingCoffeeId)),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: bagKeys.all }),
        queryClient.invalidateQueries({ queryKey: importKeys.all }),
      ]);
      router.navigate('/');
    },
  });
  const discard = useDiscard(job.id);

  const setCoffeeText = (key: CoffeeTextKey) => (value: string) =>
    setForm((f) => ({ ...f, coffee: { ...f.coffee, [key]: value } }));
  const setBagText = (key: BagKey) => (value: string) => setForm((f) => ({ ...f, bag: { ...f.bag, [key]: value } }));

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={100}
        style={styles.flex}>
        <ScrollView contentContainerStyle={styles.review} keyboardShouldPersistTaps="handled">
          {extraction.warnings.map((warning) => (
            <Message key={warning} tone="warning">
              {warning}
            </Message>
          ))}
          <Text style={typography.muted}>Fields highlighted in yellow are ones Claude was unsure about.</Text>

          {existing ? (
            <Card>
              <Text style={typography.heading}>You already have this coffee</Text>
              <Text style={typography.muted}>{[existing.name, existing.roaster].filter(Boolean).join(' · ')}</Text>
              <View style={styles.switchRow}>
                <Text style={[typography.body, styles.flex]}>Add this as a new bag of it</Text>
                <Switch value={addToExisting} onValueChange={setAddToExisting} trackColor={{ true: colors.primary }} />
              </View>
            </Card>
          ) : null}

          {existingCoffeeId === null ? (
            <Card>
              <Text style={typography.heading}>Coffee</Text>
              {COFFEE_FIELDS.map((field) => (
                <TextField
                  key={field.key}
                  label={field.label}
                  placeholder={field.placeholder}
                  keyboardType={field.keyboardType}
                  multiline={field.multiline}
                  value={form.coffee[field.key]}
                  onChangeText={setCoffeeText(field.key)}
                  flagged={isUncertain(extraction.coffee[field.key])}
                  hint={hintFor(extraction.coffee[field.key])}
                />
              ))}

              <Text style={typography.label}>Roast level</Text>
              <View style={[styles.chips, isUncertain(extraction.coffee.roast_level) && styles.chipsFlagged]}>
                {ROAST_LEVELS.map((level) => {
                  const selected = form.coffee.roast_level === level.value;
                  return (
                    <Pressable
                      key={level.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() =>
                        setForm((f) => ({ ...f, coffee: { ...f.coffee, roast_level: selected ? null : level.value } }))
                      }
                      style={[styles.chip, selected && styles.chipSelected]}>
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{level.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.switchRow}>
                <Text style={[typography.body, styles.flex]}>Decaf</Text>
                <Switch
                  value={form.coffee.is_decaf}
                  onValueChange={(isDecaf) => setForm((f) => ({ ...f, coffee: { ...f.coffee, is_decaf: isDecaf } }))}
                  trackColor={{ true: colors.primary }}
                />
              </View>
            </Card>
          ) : null}

          <Card>
            <Text style={typography.heading}>This bag</Text>
            {BAG_FIELDS.map((field) => (
              <TextField
                key={field.key}
                label={field.label}
                placeholder={field.placeholder}
                keyboardType={field.keyboardType}
                value={form.bag[field.key]}
                onChangeText={setBagText(field.key)}
                flagged={isUncertain(extraction.bag[field.key])}
                hint={hintFor(extraction.bag[field.key])}
              />
            ))}
          </Card>

          {confirm.error ? <Message tone="error">{describeConfirmError(confirm.error)}</Message> : null}
          {discard.error ? <Message tone="error">{discard.error.message}</Message> : null}

          <Button
            title="Add to my beans"
            onPress={() => confirm.mutate()}
            loading={confirm.isPending}
            disabled={discard.isPending}
          />
          <Button
            title="Discard"
            variant="danger"
            onPress={() => discard.mutate()}
            loading={discard.isPending}
            disabled={confirm.isPending}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    gap: space.md,
  },
  centerText: {
    textAlign: 'center',
  },
  padded: {
    padding: space.lg,
    gap: space.md,
  },
  review: {
    padding: space.lg,
    paddingBottom: space.xxl,
    gap: space.lg,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    padding: space.xs,
    borderRadius: radius.md,
  },
  chipsFlagged: {
    backgroundColor: colors.warningSurface,
  },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 14,
    color: colors.text,
  },
  chipTextSelected: {
    color: colors.onPrimary,
    fontWeight: '600',
  },
});
