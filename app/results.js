import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  useWindowDimensions,
} from "react-native";

/* optional deps */
let LinearGradient = View;
try {
  LinearGradient = require("expo-linear-gradient").LinearGradient || View;
} catch {}
let Haptics;
try {
  Haptics = require("expo-haptics");
} catch {}

/* theme + scale */
const useTheme = () => {
  const scheme = useColorScheme();
  const light = {
    bg: "#F6F7FB",
    surface: "rgba(255,255,255,0.94)",
    text: "#0F1115",
    muted: "#5F6778",
    outline: "rgba(10,20,40,0.10)",
    primary: "#675CFF",
    success: "#10B981",
    warn: "#EAB308",
    danger: "#EF4444",
    gradient: { start: "#F7F8FF", end: "#ECEBFF" },
  };
  const dark = {
    bg: "#0B0F16",
    surface: "rgba(22,27,34,0.88)",
    text: "#E8EBF2",
    muted: "#9AA3B2",
    outline: "rgba(255,255,255,0.08)",
    primary: "#8B7CFF",
    success: "#34D399",
    warn: "#FACC15",
    danger: "#FF6B70",
    gradient: { start: "#0D1019", end: "#171A26" },
  };
  return { ...(useColorScheme() === "dark" ? dark : light), scheme };
};

const useScale = () => {
  const { width } = useWindowDimensions();
  return Math.max(0.9, Math.min(1.2, width / 390));
};

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const colorFor = (t, n) =>
  n >= 85 ? t.success : n >= 70 ? t.primary : n >= 55 ? t.warn : t.danger;

export default function Results() {
  const { payload } = useLocalSearchParams();
  const t = useTheme();
  const s = useScale();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(t, s), [t, s]);

  const [data, setData] = useState(null);
  useEffect(() => {
    try {
      setData(JSON.parse(decodeURIComponent(payload)));
    } catch {
      setData(null);
    }
  }, [payload]);

  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 420, useNativeDriver: true }).start();
  }, [fade]);

  if (!data) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
        <StatusBar barStyle={t.scheme === "dark" ? "light-content" : "dark-content"} />
        <View style={styles.center}>
          <Text style={styles.muted}>No results to show.</Text>
          <Pressable
            onPress={() => router.replace("/setup")}
            style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.9 }]}
            android_ripple={{ color: "rgba(0,0,0,0.06)" }}
          >
            <Text style={styles.ghostText}>Start New Session</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const { setup, results } = data;
  const overall = clamp(Math.round(results?.overall?.score ?? 0), 0, 100);
  const summary = results?.overall?.summary || "Summary not available.";
  const items = Array.isArray(results?.items) ? results.items : [];

  const shareIt = async () => {
    try {
      await Share.share({
        title: "Interview Practice Results",
        message: `Overall: ${overall}/100\n${summary}\n\nMode: ${setup?.mode} • Level: ${setup?.level}\nTopics: ${setup?.topics?.join(", ") || "—"}`,
      });
    } catch {}
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={t.scheme === "dark" ? "light-content" : "dark-content"}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View
          style={[
            styles.container,
            {
              opacity: fade,
              transform: [
                {
                  translateY: fade.interpolate({
                    inputRange: [0, 1],
                    outputRange: [8, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Results</Text>
            <Text style={styles.subtitle}>
              {setup?.role || setup?.major} • {setup?.level} • {setup?.mode}
            </Text>
          </View>

          {/* Score card */}
          <View style={styles.scoreCard}>
            <View style={styles.scoreRingWrap}>
              <View
                style={[styles.scoreRing, { borderColor: colorFor(t, overall) }]}
              >
                <Text style={styles.scoreText}>{overall}</Text>
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>Overall</Text>
              <Text style={styles.summary}>{summary}</Text>
            </View>
          </View>

          {/* Rubric */}
          <View style={styles.rubric}>
            {["clarity", "structure", "relevance"].map((k) => {
              const avg = Math.round(
                (items.reduce((a, it) => a + (it?.scores?.[k] ?? 0), 0) /
                  Math.max(1, items.length)) *
                  10
              );
              const v = clamp(avg, 0, 100);
              return (
                <View key={k} style={styles.rRow}>
                  <Text style={styles.rLabel}>
                    {k[0].toUpperCase() + k.slice(1)}
                  </Text>
                  <View style={styles.rBar}>
                    <View
                      style={[
                        styles.rFill,
                        { width: `${v}%`, backgroundColor: colorFor(t, v) },
                      ]}
                    />
                  </View>
                  <Text style={styles.rVal}>{v}</Text>
                </View>
              );
            })}
          </View>

          {/* Feedback */}
          <View style={{ marginTop: 18 }}>
            <Text style={styles.sectionTitle}>Per-Question Feedback</Text>
            {items.length === 0 && (
              <Text style={styles.muted}>No itemized feedback.</Text>
            )}
            {items.map((it, i) => (
              <View key={i} style={styles.itemCard}>
                <Text style={styles.itemTitle}>
                  Q{i + 1}. {it?.question || "—"}
                </Text>
                <View style={styles.badges}>
                  <Badge label={`Clarity ${it?.scores?.clarity ?? 0}/10`} color={t.muted} />
                  <Badge label={`Structure ${it?.scores?.structure ?? 0}/10`} color={t.muted} />
                  <Badge label={`Relevance ${it?.scores?.relevance ?? 0}/10`} color={t.muted} />
                </View>
                <Text style={styles.itemText}>{it?.feedback || "—"}</Text>
              </View>
            ))}
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              onPress={shareIt}
              style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.9 }]}
              android_ripple={{ color: "rgba(0,0,0,0.06)" }}
            >
              <Text style={styles.ghostText}>Share</Text>
            </Pressable>

            <Pressable
              onPress={() => router.replace("/setup")}
              style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.95 }]}
              android_ripple={{ color: "rgba(255,255,255,0.12)" }}
            >
              <LinearGradient
                colors={["#7C6CFF", "#5B67F6"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.btnOverlay} />
              <Text style={styles.primaryText}>Practice Again</Text>
            </Pressable>
          </View>

          <Text style={styles.footer}>
            Tip: Re-answer the weakest rubric first. Short, focused drills win.
          </Text>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Badge({ label, color }) {
  return (
    <View
      style={{
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: color,
      }}
    >
      <Text style={{ color, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

const makeStyles = (t, s) =>
  StyleSheet.create({
    safe: { flex: 1 },
    headerGrad: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 120,
    },
    scroll: {
      paddingHorizontal: 18,
      paddingBottom: 28,
      paddingTop: Platform.select({ ios: 10, android: 16, default: 16 }),
      minHeight: "100%",
      justifyContent: "center",
    },
    container: { width: "100%", maxWidth: 720, alignSelf: "center" },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    muted: { color: t.muted, marginTop: 8 },
    header: { alignItems: "center", marginBottom: 14 },
    title: {
      color: t.text,
      fontSize: Math.round(30 * s),
      fontWeight: "900",
      letterSpacing: -0.2,
    },
    subtitle: { color: t.muted, fontSize: Math.round(14.5 * s), textAlign: "center" },
    scoreCard: {
      backgroundColor: t.surface,
      borderRadius: 22,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.outline,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
      shadowColor: "#000",
      shadowOpacity: Platform.select({ ios: 0.16, default: 0 }),
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 12 },
      elevation: Platform.select({ android: 4, default: 0 }),
    },
    scoreRingWrap: { padding: 4 },
    scoreRing: {
      width: 84,
      height: 84,
      borderRadius: 42,
      borderWidth: 6,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.surface,
    },
    scoreText: { color: t.text, fontWeight: "900", fontSize: Math.round(24 * s) },
    kicker: { color: t.muted, fontWeight: "800", marginBottom: 4 },
    summary: { color: t.text, fontSize: Math.round(14.5 * s), lineHeight: Math.round(14.5 * s * 1.35) },
    rubric: { marginTop: 14, gap: 10 },
    rRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    rLabel: { width: 100, color: t.muted, fontWeight: "800" },
    rBar: {
      flex: 1,
      height: 10,
      borderRadius: 999,
      overflow: "hidden",
      backgroundColor: Platform.select({
        ios: "rgba(0,0,0,0.06)",
        android: "rgba(255,255,255,0.08)",
        default: "rgba(0,0,0,0.06)",
      }),
    },
    rFill: { height: "100%", borderRadius: 999 },
    rVal: { color: t.muted, width: 40, textAlign: "right", fontWeight: "800" },
    sectionTitle: { color: t.text, fontSize: Math.round(16 * s), fontWeight: "900", marginBottom: 8 },
    itemCard: {
      backgroundColor: t.surface,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.outline,
      padding: 14,
      marginBottom: 10,
    },
    itemTitle: { color: t.text, fontWeight: "900", marginBottom: 8 },
    badges: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
    itemText: { color: t.text, lineHeight: Math.round(14.5 * s * 1.35), fontSize: Math.round(14.5 * s) },
    actions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
    ghostBtn: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.outline,
      backgroundColor: "transparent",
    },
    ghostText: { color: t.text, fontWeight: "800" },
    primaryBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 999,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
    },
    btnOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: Platform.select({
        ios: "rgba(0,0,0,0.12)",
        android: "rgba(0,0,0,0.18)",
        default: "rgba(0,0,0,0.12)",
      }),
    },
    primaryText: { color: "#fff", fontWeight: "900" },
    footer: {
      color: t.muted,
      textAlign: "center",
      marginTop: 14,
      fontSize: Math.round(12.5 * s),
    },
  });