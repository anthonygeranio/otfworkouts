import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';

import type { DailyWorkout, Station, WorkoutPost } from './src/types';
import { dateFor, loadWorkout } from './src/workouts';

const DAYS_BACK = 7;

const palette = {
  light: { bg: '#F6F4F1', card: '#FFFFFF', text: '#1C1917', muted: '#78716C', border: '#E7E5E4', accent: '#EA580C', chip: '#EDEAE6' },
  dark: { bg: '#0F0E0D', card: '#1C1A18', text: '#F5F5F4', muted: '#A8A29E', border: '#2E2B28', accent: '#FB923C', chip: '#26231F' },
};

const STATION_META: Record<Station, { label: string; icon: string; tint: string }> = {
  tread: { label: 'Tread', icon: '🏃', tint: '#EA580C' },
  row: { label: 'Rower', icon: '🚣', tint: '#0891B2' },
  floor: { label: 'Floor', icon: '🏋️', tint: '#7C3AED' },
  notes: { label: 'Overview', icon: '📝', tint: '#78716C' },
};

function dayLabel(daysAgo: number): string {
  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  const [y, m, d] = dateFor(daysAgo).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Home />
    </SafeAreaProvider>
  );
}

function Home() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = palette[scheme];
  const [daysAgo, setDaysAgo] = useState(0);
  const [workout, setWorkout] = useState<DailyWorkout | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (day: number, preferCache: boolean) => {
    setError(null);
    try {
      setWorkout(await loadWorkout(day, preferCache));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load(daysAgo, true).finally(() => setLoading(false));
  }, [daysAgo, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(daysAgo, false);
    setRefreshing(false);
  };

  const [top, ...others] = workout?.posts ?? [];

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <View style={styles.header}>
        <Text style={[styles.appName, { color: c.accent }]}>Class Preview</Text>
        <Text style={[styles.subtitle, { color: c.muted }]}>Today's class, as the community posted it</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.days} contentContainerStyle={styles.daysContent}>
        {Array.from({ length: DAYS_BACK }, (_, i) => (
          <Pressable
            key={i}
            onPress={() => setDaysAgo(i)}
            style={[styles.dayChip, { backgroundColor: i === daysAgo ? c.accent : c.chip }]}
          >
            <Text style={[styles.dayChipText, { color: i === daysAgo ? '#FFFFFF' : c.text }]}>{dayLabel(i)}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
      >
        {workout?.source === 'sample' && (
          <View style={[styles.banner, { borderColor: c.accent }]}>
            <Text style={[styles.bannerText, { color: c.text }]}>
              Sample data. Add a Reddit client id to load the real daily thread.
            </Text>
          </View>
        )}

        {loading ? (
          <ActivityIndicator style={styles.centered} color={c.accent} />
        ) : error ? (
          <Empty c={c} title="Couldn't load the thread" body={`${error}. Pull down to try again.`} />
        ) : !workout || !top ? (
          <Empty
            c={c}
            title="Nothing posted yet"
            body={daysAgo === 0 ? 'The community usually posts after the first classes. Pull down to check again.' : 'No workout was found for this day.'}
          />
        ) : (
          <>
            <View style={styles.titleRow}>
              <Text style={[styles.dayTitle, { color: c.text }]}>{dayLabel(daysAgo)}</Text>
              {workout.template && (
                <View style={[styles.templateBadge, { backgroundColor: c.accent }]}>
                  <Text style={styles.templateText}>{workout.template}</Text>
                </View>
              )}
            </View>

            {top.sections.map((section, i) => (
              <SectionCard key={i} c={c} station={section.station} title={section.title} lines={section.lines} />
            ))}
            <Credit c={c} post={top} />

            {others.length > 0 && (
              <>
                <Text style={[styles.moreHeading, { color: c.muted }]}>OTHER STUDIOS' VERSIONS ({others.length})</Text>
                {others.map((post) => (
                  <OtherPost key={post.id} c={c} post={post} />
                ))}
              </>
            )}

            <Pressable onPress={() => Linking.openURL(workout.threadUrl)}>
              <Text style={[styles.link, { color: c.accent }]}>Open the full thread on Reddit ↗</Text>
            </Pressable>
          </>
        )}

        <Text style={[styles.disclaimer, { color: c.muted }]}>
          Workouts are posted by r/orangetheory members and can differ between studios. This app is unofficial and not
          affiliated with Orangetheory Fitness.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

type Colors = (typeof palette)['light'];

function SectionCard({ c, station, title, lines }: { c: Colors; station: Station; title: string; lines: string[] }) {
  const meta = STATION_META[station];
  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border, borderLeftColor: meta.tint }]}>
      <Text style={[styles.cardTitle, { color: meta.tint }]}>
        {meta.icon}  {station === 'notes' ? meta.label : title}
      </Text>
      {lines.map((line, i) => (
        <Text key={i} style={[styles.cardLine, { color: c.text }]}>
          {line}
        </Text>
      ))}
    </View>
  );
}

function Credit({ c, post }: { c: Colors; post: WorkoutPost }) {
  return (
    <Pressable onPress={() => Linking.openURL(post.permalink)}>
      <Text style={[styles.credit, { color: c.muted }]}>
        ▲ {post.score} · posted by u/{post.author} · view comment ↗
      </Text>
    </Pressable>
  );
}

function OtherPost({ c, post }: { c: Colors; post: WorkoutPost }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.other, { backgroundColor: c.card, borderColor: c.border }]}>
      <Pressable onPress={() => setOpen(!open)} style={styles.otherHeader}>
        <Text style={[styles.otherTitle, { color: c.text }]}>u/{post.author}</Text>
        <Text style={{ color: c.muted }}>
          ▲ {post.score}  {open ? '▾' : '▸'}
        </Text>
      </Pressable>
      {open && (
        <View style={styles.otherBody}>
          {post.sections.map((s, i) => (
            <SectionCard key={i} c={c} station={s.station} title={s.title} lines={s.lines} />
          ))}
          <Credit c={c} post={post} />
        </View>
      )}
    </View>
  );
}

function Empty({ c, title, body }: { c: Colors; title: string; body: string }) {
  return (
    <View style={styles.centered}>
      <Text style={[styles.emptyTitle, { color: c.text }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: c.muted }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  appName: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, marginTop: 2 },
  days: { flexGrow: 0 },
  daysContent: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  dayChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  dayChipText: { fontSize: 14, fontWeight: '600' },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  banner: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, padding: 10 },
  bannerText: { fontSize: 13 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  dayTitle: { fontSize: 22, fontWeight: '700' },
  templateBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  templateText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  card: { borderWidth: 1, borderLeftWidth: 4, borderRadius: 12, padding: 14, gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  cardLine: { fontSize: 15, lineHeight: 22 },
  credit: { fontSize: 13, textAlign: 'right' },
  moreHeading: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginTop: 16 },
  other: { borderWidth: 1, borderRadius: 12 },
  otherHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 14 },
  otherTitle: { fontWeight: '600' },
  otherBody: { paddingHorizontal: 10, paddingBottom: 10, gap: 8 },
  link: { fontSize: 15, fontWeight: '600', textAlign: 'center', marginTop: 12 },
  centered: { alignItems: 'center', paddingVertical: 48, gap: 6 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyBody: { fontSize: 14, textAlign: 'center', maxWidth: 280 },
  disclaimer: { fontSize: 12, textAlign: 'center', marginTop: 24, lineHeight: 18 },
});
