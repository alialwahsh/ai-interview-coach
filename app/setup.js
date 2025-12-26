import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PixelRatio,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRevenueCat } from "../lib/RevenueCatProvider";

/* -------- optional deps with detection -------- */
let LinearGradient = View;
let HAS_GRAD = false;
try {
  const lg = require("expo-linear-gradient").LinearGradient;
  if (lg) {
    LinearGradient = lg;
    HAS_GRAD = true;
  }
} catch {}
let BlurView = View;
let HAS_BLUR = false;
try {
  const { BlurView: BV } = require("expo-blur");
  if (BV) {
    BlurView = BV;
    HAS_BLUR = true;
  }
} catch {}
let Haptics;
try {
  Haptics = require("expo-haptics");
} catch {}

/* -------- theme & scaling -------- */
const useTheme = () => {
  const scheme = useColorScheme();
  const light = {
    scheme: "light",
    bg: "#F6F8FB",
    text: "#0E1116",
    muted: "rgba(14,17,22,0.66)",
    outline: "rgba(14,17,22,0.08)",
    surface: "#FFFFFF73",
    gradA: "#C9FF5A",
    gradB: "#21C7AE",
    danger: "#EF4444",
    stroke: "rgba(0,0,0,0.06)",
    ring: "rgba(33,199,174,0.45)",
    glass: "rgba(255,255,255,0.36)",
    shadow: { opacity: 0.16, radius: 16, y: 10 },
  };
  const dark = {
    scheme: "dark",
    bg: "#0B0F16",
    text: "#E7EAF0",
    muted: "rgba(231,234,240,0.72)",
    outline: "rgba(255,255,255,0.10)",
    surface: "rgba(22,27,34,0.48)",
    gradA: "#9BFF4D",
    gradB: "#1AB3A1",
    danger: "#FF6B70",
    stroke: "rgba(255,255,255,0.10)",
    ring: "rgba(33,199,174,0.45)",
    glass: "rgba(22,27,34,0.44)",
    shadow: { opacity: 0.18, radius: 18, y: 12 },
  };
  return scheme === "dark" ? dark : light;
};

// normalize across screen sizes
const { width: SCREEN_WIDTH } = require("react-native").Dimensions.get("window");
const scale = SCREEN_WIDTH / 390;
const normalize = (size) =>
  Math.round(PixelRatio.roundToNearestPixel(size * scale));

/* tiny base64 noise texture */
const NOISE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAPElEQVQoU2NkwAT/GcSgYGBg+P//P2YQw0A0QwRjQKkGQ0U4gGJQ2oAxgQK4wE1gQJ8gSg8g0JwqgGgGQKIBoAAAK9kqzq9D1yNQAAAABJRU5ErkJggg==";

/* -------- small components -------- */
function Chip({ label, selected, onPress }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} option`}
      android_ripple={{ color: "rgba(0,0,0,0.06)" }}
      style={({ pressed }) => [
        {
          minHeight: normalize(40),
          paddingHorizontal: normalize(14),
          borderRadius: 999,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: selected ? t.gradB : t.glass,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: selected ? t.gradB : t.outline,
          transform: [{ scale: pressed ? 0.96 : 1 }],
        },
      ]}
    >
      <Text
        style={{
          color: selected ? "#fff" : t.text,
          fontWeight: "800",
          fontSize: normalize(14),
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Bubble({ children }) {
  return (
    <View style={{ alignItems: "flex-end", marginVertical: normalize(6) }}>
      <View
        style={{
          maxWidth: "92%",
          padding: normalize(12),
          borderRadius: normalize(16),
          backgroundColor: "#1AB3A1",
        }}
      >
        <Text style={{ color: "#fff", fontSize: normalize(14) }}>
          {children}
        </Text>
      </View>
    </View>
  );
}

/* -------- screen -------- */
export default function Setup() {
  const t = useTheme();
  const router = useRouter();
  const { height } = useWindowDimensions();
  const { isPro } = useRevenueCat();

  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [count, setCount] = useState(7);
  const [level, setLevel] = useState("Auto");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [levelOpen, setLevelOpen] = useState(false);

  const fade = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(8)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled
      ?.()
      .then(setReduceMotion)
      .catch(() => {});
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 360,
        useNativeDriver: true,
      }),
      Animated.timing(lift, {
        toValue: 0,
        duration: 360,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const quicks = [
    "Software Engineer — Backend — Node/SQL — logistics",
    "Marketing Intern — social + email — retail brand",
    "Registered Nurse — ER — nights",
  ];

  const sendDraft = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setDraft("");
  };

  const validate = (msgs = messages) => {
    if (!msgs.some((m) => m.role === "user"))
      return "Add a role or paste a description first.";
    if (!Number.isFinite(count) || count < 3 || count > 15)
      return "Question count must be 3–15.";
    return "";
  };

  async function onGenerate() {
    // If user is NOT Pro, send them to the paywall instead of starting
    if (!isPro) {
      router.push("/paywall");
      return;
    }

    const merged = draft.trim()
      ? [...messages, { role: "user", text: draft.trim() }]
      : messages;
    const v = validate(merged);
    if (v) {
      setError(v);
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const combined = merged
        .filter((m) => m.role === "user")
        .map((m) => m.text)
        .join("\n\n");
      const payload = {
        role: combined,
        major: "",
        company: "",
        mode: "Auto",
        level: level === "Auto" ? "Junior" : level,
        topics: [],
        questionCount: count,
      };
      try {
        Haptics && (await Haptics.impactAsync(10));
      } catch {}
      router.push({
        pathname: "/questions",
        params: { payload: encodeURIComponent(JSON.stringify(payload)) },
      });
      setDraft("");
    } catch {
      setError("Couldn’t proceed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const LEVELS = ["Auto", "Intern", "Junior", "Mid", "Senior"];

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: t.bg }]}
      edges={["top", "left", "right"]}
    >
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={t.scheme === "dark" ? "light-content" : "dark-content"}
      />

      {HAS_GRAD && (
        <View pointerEvents="none" style={styles.bgLayer}>
          <LinearGradient
            colors={[t.gradA + "4D", t.gradB + "66", "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bgWash}
          />
          <Image
            source={{ uri: NOISE }}
            style={styles.noise}
            resizeMode="repeat"
          />
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 6 : 0}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { minHeight: height * 0.9 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View
            style={{ opacity: fade, transform: [{ translateY: lift }] }}
          >
            <BlurView
              intensity={HAS_BLUR ? 18 : 0}
              tint={t.scheme === "dark" ? "dark" : "light"}
              style={styles.sheet}
            >
              <View style={styles.sheetStroke} pointerEvents="none" />

              <View style={styles.header}>
                <Text style={styles.title}>Tell me about the role</Text>
                <Text style={styles.subtitle}>
                  Paste the description, or share role, company, and any helpful
                  details.
                </Text>
              </View>

              <View style={styles.chatWrap}>
                {messages.map((m, i) => (
                  <Bubble key={i}>{m.text}</Bubble>
                ))}

                <View style={styles.quickRow}>
                  {quicks.map((q) => (
                    <Pressable
                      key={q}
                      onPress={() => setDraft(q)}
                      style={({ pressed }) => [
                        styles.quickChip,
                        pressed && { transform: [{ scale: 0.97 }] },
                      ]}
                    >
                      <Text style={styles.quickTxt}>{q}</Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.inputRow}>
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    multiline
                    placeholder="Type or paste here…"
                    placeholderTextColor={t.muted}
                    style={styles.input}
                    returnKeyType="send"
                    onSubmitEditing={sendDraft}
                    selectionColor={t.gradB}
                  />
                </View>

                <View style={styles.controlsRow}>
                  <Text style={styles.label}>Questions</Text>
                  <View style={styles.rowWrap}>
                    {[5, 7, 10].map((n) => (
                      <Chip
                        key={n}
                        label={String(n)}
                        selected={count === n}
                        onPress={() => setCount(n)}
                      />
                    ))}
                  </View>
                </View>

                <View
                  style={[styles.controlsRow, { marginTop: normalize(12) }]}
                >
                  <Text style={styles.label}>Level</Text>
                  <Pressable
                    onPress={() => {
                      setLevelOpen(true);
                      try {
                        Haptics && Haptics.selectionAsync?.();
                      } catch {}
                    }}
                    style={({ pressed }) => [
                      styles.selector,
                      pressed && { opacity: 0.95 },
                    ]}
                  >
                    <Text style={styles.selectorText}>{level}</Text>
                    <Text style={styles.selectorCaret}>▾</Text>
                  </Pressable>
                </View>

                {!!error && (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>⚠️ {error}</Text>
                  </View>
                )}

                {/* Main CTA */}
                <Pressable
                  onPress={onGenerate}
                  disabled={submitting}
                  android_ripple={{ color: "rgba(255,255,255,0.12)" }}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    pressed && !reduceMotion && styles.primaryPressed,
                    submitting && { opacity: 0.9 },
                  ]}
                >
                  <LinearGradient
                    colors={[t.gradA, t.gradB]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={StyleSheet.absoluteFill}
                  />
                  {submitting ? (
                    <ActivityIndicator color="#0B0F16" />
                  ) : (
                    <Text style={styles.primaryText}>Generate Interview</Text>
                  )}
                </Pressable>
              </View>
            </BlurView>
          </Animated.View>

          {/* footer links */}
          <View style={styles.footerLinks}>
            <Text
              style={styles.footerLink}
              onPress={() =>
                Linking.openURL(
                  "https://www.notion.so/Terms-of-Use-Interview-AI-Coach-2aa3a5d5453d8021a700e034a8a1549d"
                )
              }
            >
              Terms of Use
            </Text>
            <Text style={styles.footerDot}>•</Text>
            <Text
              style={styles.footerLink}
              onPress={() =>
                Linking.openURL(
                  "https://www.notion.so/Privacy-Policy-Interview-AI-Coach-2aa3a5d5453d8094ba86e8538c2b065f"
                )
              }
            >
              Privacy Policy
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modal */}
      <Modal
        visible={levelOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLevelOpen(false)}
      >
        <BlurView
          intensity={28}
          tint={t.scheme === "dark" ? "dark" : "light"}
          style={styles.modalBackdrop}
        >
          <Pressable
            style={styles.modalInner}
            onPress={() => setLevelOpen(false)}
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Select level</Text>
              {LEVELS.map((opt) => (
                <Pressable
                  key={opt}
                  onPress={() => {
                    setLevel(opt);
                    setLevelOpen(false);
                    try {
                      Haptics && Haptics.selectionAsync?.();
                    } catch {}
                  }}
                  style={[
                    styles.modalItem,
                    opt === level && styles.modalItemSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.modalItemText,
                      opt === level && styles.modalItemTextSelected,
                    ]}
                  >
                    {opt}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </BlurView>
      </Modal>
    </SafeAreaView>
  );
}

/* -------- styles -------- */
const styles = StyleSheet.create({
  safe: { flex: 1 },
  bgLayer: { ...StyleSheet.absoluteFillObject },
  bgWash: {
    position: "absolute",
    top: -120,
    left: -80,
    right: -80,
    bottom: -60,
    opacity: 0.4,
    transform: [{ rotateZ: "-6deg" }],
  },
  noise: { ...StyleSheet.absoluteFillObject, opacity: 0.025 },
  scroll: {
    paddingHorizontal: normalize(20),
    paddingVertical: normalize(20),
    alignItems: "center",
  },
  sheet: {
    width: "100%",
    maxWidth: "95%",
    alignSelf: "center",
    borderRadius: normalize(28),
    backgroundColor: HAS_BLUR ? "transparent" : "#fff2",
    padding: normalize(16),
    overflow: "hidden",
  },
  sheetStroke: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: normalize(28),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  header: { alignItems: "center", marginBottom: normalize(8) },
  title: {
    fontWeight: "900",
    textAlign: "center",
    fontSize: normalize(30),
    color: "#0E1116",
  },
  subtitle: {
    textAlign: "center",
    color: "rgba(14,17,22,0.66)",
    fontSize: normalize(15),
    marginTop: normalize(8),
  },
  chatWrap: { paddingTop: normalize(8), width: "100%" },
  quickRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: normalize(8),
    marginTop: normalize(8),
  },
  quickChip: {
    paddingVertical: normalize(6),
    paddingHorizontal: normalize(10),
    borderRadius: normalize(12),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.08)",
  },
  quickTxt: { fontSize: normalize(13) },
  inputRow: {
    flexDirection: "row",
    marginTop: normalize(12),
    borderRadius: normalize(18),
    padding: normalize(10),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.08)",
  },
  input: {
    flex: 1,
    minHeight: normalize(56),
    maxHeight: normalize(140),
    fontSize: normalize(15),
  },
  controlsRow: {
    marginTop: normalize(14),
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: normalize(8) },
  label: { fontWeight: "900", fontSize: normalize(14.5) },
  selector: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.08)",
    paddingHorizontal: normalize(14),
    paddingVertical: normalize(8),
  },
  selectorText: { fontWeight: "800", fontSize: normalize(14) },
  selectorCaret: { fontSize: normalize(14) },
  errorBox: {
    backgroundColor: "rgba(239,68,68,0.12)",
    borderColor: "rgba(239,68,68,1)",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: normalize(14),
    padding: normalize(10),
    marginTop: normalize(12),
  },
  errorText: { fontWeight: "800", fontSize: normalize(13) },

  /* primary CTA */
  primaryBtn: {
    borderRadius: 999,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: normalize(16),
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    shadowColor: "#000",
    shadowOpacity: Platform.select({ ios: 0.12, default: 0 }),
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: Platform.select({ android: 3, default: 0 }),
    marginTop: normalize(16),
  },
  primaryPressed: { transform: [{ scale: 0.985 }], opacity: 0.97 },
  primaryText: {
    color: "#0B0F16",
    fontWeight: "900",
    letterSpacing: 0.2,
    fontSize: normalize(17),
  },

  /* footer links */
  footerLinks: {
    marginTop: normalize(10),
    marginBottom: normalize(6),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: normalize(8),
  },
  footerLink: {
    fontSize: normalize(11),
    textDecorationLine: "underline",
    color: "rgba(14,17,22,0.66)",
  },
  footerDot: {
    fontSize: normalize(11),
    color: "rgba(14,17,22,0.66)",
  },

  /* modal */
  modalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: normalize(20),
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  modalInner: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCard: {
    width: "92%",
    maxWidth: 420,
    borderRadius: normalize(18),
    overflow: "hidden",
    padding: normalize(12),
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  modalTitle: {
    fontWeight: "800",
    textAlign: "center",
    marginBottom: normalize(6),
    fontSize: normalize(14),
  },
  modalItem: {
    paddingVertical: normalize(12),
    paddingHorizontal: normalize(12),
    borderRadius: normalize(12),
    marginVertical: normalize(2),
    backgroundColor: "rgba(0,0,0,0.04)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.08)",
  },
  modalItemSelected: {
    backgroundColor: "#1AB3A1",
    borderColor: "#1AB3A1",
  },
  modalItemText: {
    fontWeight: "800",
    textAlign: "center",
    fontSize: normalize(14),
  },
  modalItemTextSelected: { color: "#fff" },
});