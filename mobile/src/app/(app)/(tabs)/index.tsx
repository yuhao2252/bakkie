import { Link, router } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Message, Screen } from '@/components/ui';
import { type BagOverview, useBagsOnHand } from '@/lib/bags';
import { colors, radius, space, typography } from '@/lib/theme';

function roastAge(days: number | null): string {
  if (days === null) return 'Roast date unknown';
  if (days <= 0) return 'Roasted today';
  if (days === 1) return 'Roasted yesterday';
  return `Roasted ${days} days ago`;
}

function BagCard({ bag }: { bag: BagOverview }) {
  const percent = Math.max(0, Math.min(100, bag.percent_remaining ?? 0));
  const grams = Math.max(0, Math.round(bag.grams_remaining ?? 0));
  const origin = [bag.roaster_name, bag.country].filter(Boolean).join(' · ');

  return (
    <Card>
      <View style={styles.titleBlock}>
        <Text style={typography.heading}>{bag.coffee_name}</Text>
        {origin ? <Text style={typography.muted}>{origin}</Text> : null}
      </View>

      <View style={styles.meter} accessibilityLabel={`${percent}% left`}>
        <View style={[styles.meterFill, { width: `${percent}%` }]} />
      </View>

      <View style={styles.meta}>
        <Text style={typography.body}>{grams} g left</Text>
        <Text style={typography.muted}>{roastAge(bag.days_since_roast)}</Text>
      </View>

      {bag.tasting_notes && bag.tasting_notes.length > 0 ? (
        <Text style={typography.muted}>{bag.tasting_notes.join(', ')}</Text>
      ) : null}
    </Card>
  );
}

export default function BeansScreen() {
  const { data, error, isLoading, isRefetching, refetch } = useBagsOnHand();

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={typography.title}>Beans</Text>
        <Link href="/settings" style={styles.headerLink}>
          Settings
        </Link>
      </View>

      <FlatList
        data={data ?? []}
        keyExtractor={(bag) => bag.bag_id ?? ''}
        renderItem={({ item }) => <BagCard bag={item} />}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
        ListHeaderComponent={error ? <Message tone="error">{error.message}</Message> : null}
        ListEmptyComponent={
          isLoading ? null : (
            <View style={styles.empty}>
              <Text style={typography.heading}>No beans yet</Text>
              <Text style={[typography.muted, styles.centerText]}>
                Add a bag from a roaster&apos;s web page or from photos of its label.
              </Text>
              <Button title="Add coffee" onPress={() => router.navigate('/add')} />
            </View>
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  headerLink: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '500',
  },
  list: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xxl,
    gap: space.md,
  },
  titleBlock: {
    gap: space.xs,
  },
  meter: {
    height: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  empty: {
    alignItems: 'center',
    gap: space.md,
    paddingTop: space.xxl,
  },
  centerText: {
    textAlign: 'center',
  },
});
