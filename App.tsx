import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';

import {
  disableNotifications,
  enableNotifications,
  hasSeenIntro,
  isEnabled,
  markIntroSeen,
  notificationsSupported,
  refreshRegistration,
} from './src/notifications';
import {
  blockAuthor,
  isHidden,
  loadModeration,
  reportPost,
  type Moderation,
} from './src/moderation';
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

  const [notifyOn, setNotifyOn] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [showIntro, setShowIntro] = useState(false);

  useEffect(() => {
    if (!notificationsSupported) return;
    isEnabled().then(async (on) => {
      setNotifyOn(on);
      // Offer the explainer once, to people who haven't turned it on.
      if (!on && !(await hasSeenIntro())) setShowIntro(true);
    });
    refreshRegistration();
    // Tapping "Today's workout is up" jumps to today and pulls fresh comments.
    const sub = Notifications.addNotificationResponseReceivedListener(() => {
      setDaysAgo(0);
      load(0, false);
    });
    return () => sub.remove();
  }, [load]);

  const toggleNotifications = async () => {
    setNotifyBusy(true);
    const error = notifyOn ? await disableNotifications() : await enableNotifications();
    setNotifyBusy(false);
    if (error) Alert.alert('Notifications', error);
    else setNotifyOn(!notifyOn);
  };

  const dismissIntro = () => {
    setShowIntro(false);
    markIntroSeen();
  };

  const enableFromIntro = async () => {
    dismissIntro();
    if (!notifyOn) await toggleNotifications();
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load(daysAgo, false);
    setRefreshing(false);
  };

  // Content moderation (Apple Guideline 1.2): let users report/hide posts and block authors.
  const [mod, setMod] = useState<Moderation>({ authors: new Set(), posts: new Set() });
  useEffect(() => {
    loadModeration().then(setMod);
  }, []);

  const moderate = (post: WorkoutPost) => {
    Alert.alert('Report or hide', `Posted by u/${post.author}`, [
      {
        text: 'Report this post',
        style: 'destructive',
        onPress: async () => {
          await reportPost(post);
          setMod(await loadModeration());
          Alert.alert('Thanks', 'This post has been reported and hidden. We review reports within 24 hours.');
        },
      },
      {
        text: `Hide posts from u/${post.author}`,
        onPress: async () => {
          await blockAuthor(post.author);
          setMod(await loadModeration());
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const visiblePosts = (workout?.posts ?? []).filter((p) => !isHidden(p, mod));
  const [top, ...others] = visiblePosts;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <NotifyIntro
        c={c}
        visible={showIntro}
        busy={notifyBusy}
        onEnable={enableFromIntro}
        onDismiss={dismissIntro}
      />
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.appName, { color: c.accent }]}>OTF Workouts</Text>
          <Text style={[styles.subtitle, { color: c.muted }]}>Today's OTF class, as the community posted it</Text>
        </View>
        {notificationsSupported && (
          <Pressable
            onPress={toggleNotifications}
            disabled={notifyBusy}
            accessibilityRole="switch"
            accessibilityState={{ checked: notifyOn, busy: notifyBusy }}
            accessibilityLabel="Notify me when today's workout is posted"
            style={[styles.bell, { backgroundColor: notifyOn ? c.accent : c.chip }]}
          >
            {notifyBusy ? (
              <ActivityIndicator size="small" color={notifyOn ? '#FFFFFF' : c.accent} />
            ) : (
              <Text style={[styles.bellText, { color: notifyOn ? '#FFFFFF' : c.text }]}>
                {notifyOn ? '🔔 On' : '🔕 Notify me'}
              </Text>
            )}
          </Pressable>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.days} contentContainerStyle={styles.daysContent}>
        {Array.from({ length: DAYS_BACK }, (_, i) => (
          <Pressable
            key={i}
            onPress={() => setDaysAgo(i)}
            style={[styles.dayChip, { backgroundColor: i === daysAgo ? c.accent : c.chip }]}
          >
            <Text numberOfLines={1} style={[styles.dayChipText, { color: i === daysAgo ? '#FFFFFF' : c.text }]}>
              {dayLabel(i)}
            </Text>
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
              Sample data. Set EXPO_PUBLIC_API_URL to your server to load the real daily workout.
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
            <WorkoutImages c={c} urls={top.imageUrls} />
            <Credit c={c} post={top} onReport={() => moderate(top)} />

            {others.length > 0 && (
              <>
                <Text style={[styles.moreHeading, { color: c.muted }]}>OTHER STUDIOS' VERSIONS ({others.length})</Text>
                {others.map((post) => (
                  <OtherPost key={post.id} c={c} post={post} onReport={() => moderate(post)} />
                ))}
              </>
            )}

            <Pressable onPress={() => Linking.openURL(workout.threadUrl)}>
              <Text style={[styles.link, { color: c.accent }]}>Open the full thread on Reddit ↗</Text>
            </Pressable>
          </>
        )}

        <Text style={[styles.disclaimer, { color: c.muted }]}>
          Workouts are posted by r/orangetheory members and can differ between studios. Tap “Report” on any post to flag
          content or hide a poster. This app is unofficial and not affiliated with Orangetheory Fitness.
        </Text>
        <Pressable onPress={() => Linking.openURL('https://anthonygeranio.github.io/otfworkouts/terms.html')}>
          <Text style={[styles.termsLink, { color: c.muted }]}>Terms of Use</Text>
        </Pressable>
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
      {lines.map((line, i) => {
        // Overview reads as sentences; workout blocks read as bullets, with
        // "→" transition lines set apart.
        if (station === 'notes') {
          return (
            <Text key={i} style={[styles.noteLine, { color: c.text }]}>
              {line}
            </Text>
          );
        }
        if (line.startsWith('→')) {
          return (
            <Text key={i} style={[styles.transition, { color: c.muted }]}>
              {line}
            </Text>
          );
        }
        return (
          <View key={i} style={styles.bulletRow}>
            <Text style={[styles.bulletDot, { color: meta.tint }]}>•</Text>
            <Text style={[styles.bulletText, { color: c.text }]}>{line}</Text>
          </View>
        );
      })}
    </View>
  );
}

function NotifyIntro({
  c,
  visible,
  busy,
  onEnable,
  onDismiss,
}: {
  c: Colors;
  visible: boolean;
  busy: boolean;
  onEnable: () => void;
  onDismiss: () => void;
}) {
  const points: [string, string][] = [
    ['⚡', 'Know the moment it drops. We watch the r/orangetheory thread and ping you as soon as the workout is posted — no digging through comments.'],
    ['🕕', 'A heads-up before class. The alert usually lands within ~10 minutes of the workout being posted, so you can plan your morning.'],
    ['😴', 'Never at a bad hour. Alerts are held until 6am your time — you get one a day, and nothing overnight.'],
  ];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: c.card }]}>
          <Text style={styles.modalEmoji}>🔔</Text>
          <Text style={[styles.modalTitle, { color: c.text }]}>Get today's workout first</Text>
          <Text style={[styles.modalSubtitle, { color: c.muted }]}>
            Turn on notifications and we'll send you the day's OTF class as soon as it's posted.
          </Text>
          {points.map(([icon, text]) => (
            <View key={icon} style={styles.modalPoint}>
              <Text style={styles.modalPointIcon}>{icon}</Text>
              <Text style={[styles.modalPointText, { color: c.text }]}>{text}</Text>
            </View>
          ))}
          <Pressable
            onPress={onEnable}
            disabled={busy}
            style={[styles.modalPrimary, { backgroundColor: c.accent }]}
            accessibilityRole="button"
          >
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.modalPrimaryText}>Turn on notifications</Text>}
          </Pressable>
          <Pressable onPress={onDismiss} accessibilityRole="button">
            <Text style={[styles.modalSecondary, { color: c.muted }]}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function WorkoutImages({ c, urls }: { c: Colors; urls?: string[] }) {
  if (!urls?.length) return null;
  return (
    <>
      {urls.map((url) => (
        <Image
          key={url}
          source={{ uri: url }}
          style={[styles.workoutImage, { borderColor: c.border }]}
          resizeMode="contain"
          accessibilityLabel="Workout posted as an image"
        />
      ))}
    </>
  );
}

function Credit({ c, post, onReport }: { c: Colors; post: WorkoutPost; onReport: () => void }) {
  return (
    <View style={styles.creditRow}>
      <Pressable onPress={() => Linking.openURL(post.permalink)} style={styles.creditFlex}>
        <Text style={[styles.credit, { color: c.muted }]}>
          {post.score != null ? `▲ ${post.score} · ` : ''}posted by u/{post.author} · view comment ↗
        </Text>
      </Pressable>
      <Pressable onPress={onReport} hitSlop={10} accessibilityLabel="Report or hide this post">
        <Text style={[styles.reportBtn, { color: c.muted }]}>⋯ Report</Text>
      </Pressable>
    </View>
  );
}

function OtherPost({ c, post, onReport }: { c: Colors; post: WorkoutPost; onReport: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.other, { backgroundColor: c.card, borderColor: c.border }]}>
      <Pressable onPress={() => setOpen(!open)} style={styles.otherHeader}>
        <Text style={[styles.otherTitle, { color: c.text }]}>u/{post.author}</Text>
        <Text style={{ color: c.muted }}>{open ? '▾' : '▸'}</Text>
      </Pressable>
      {open && (
        <View style={styles.otherBody}>
          {post.sections.map((s, i) => (
            <SectionCard key={i} c={c} station={s.station} title={s.title} lines={s.lines} />
          ))}
          <WorkoutImages c={c} urls={post.imageUrls} />
          <Credit c={c} post={post} onReport={onReport} />
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  headerText: { flex: 1 },
  bell: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, minWidth: 64, alignItems: 'center' },
  bellText: { fontSize: 13, fontWeight: '700' },
  appName: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, marginTop: 2 },
  days: { flexGrow: 0, flexShrink: 0, height: 52 },
  daysContent: { alignItems: 'center', paddingHorizontal: 16, gap: 8 },
  dayChip: { justifyContent: 'center', height: 36, paddingHorizontal: 16, borderRadius: 999 },
  dayChipText: { fontSize: 14, fontWeight: '600' },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  banner: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, padding: 10 },
  bannerText: { fontSize: 13 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  dayTitle: { fontSize: 22, fontWeight: '700' },
  templateBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  templateText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  card: { borderWidth: 1, borderLeftWidth: 4, borderRadius: 12, padding: 14, gap: 4 },
  cardTitle: { fontSize: 17, fontWeight: '800', marginBottom: 8 },
  noteLine: { fontSize: 15, lineHeight: 22, marginBottom: 4 },
  bulletRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  bulletDot: { fontSize: 15, lineHeight: 22, fontWeight: '900' },
  bulletText: { flex: 1, fontSize: 15, lineHeight: 22 },
  transition: { fontSize: 13, fontStyle: 'italic', marginTop: 2, marginBottom: 6 },
  workoutImage: { width: '100%', height: 320, borderRadius: 12, borderWidth: 1 },
  creditRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 },
  creditFlex: { flex: 1 },
  credit: { fontSize: 13 },
  reportBtn: { fontSize: 13, fontWeight: '600' },
  termsLink: { fontSize: 12, textAlign: 'center', marginTop: 8, textDecorationLine: 'underline' },
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
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 },
  modalCard: { borderRadius: 20, padding: 24 },
  modalEmoji: { fontSize: 40, textAlign: 'center' },
  modalTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  modalSubtitle: { fontSize: 15, lineHeight: 21, textAlign: 'center', marginTop: 8, marginBottom: 16 },
  modalPoint: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  modalPointIcon: { fontSize: 20, width: 24, textAlign: 'center' },
  modalPointText: { flex: 1, fontSize: 14, lineHeight: 20 },
  modalPrimary: { borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  modalPrimaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  modalSecondary: { textAlign: 'center', fontSize: 15, fontWeight: '600', paddingVertical: 14 },
});
