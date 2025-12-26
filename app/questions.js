// app/questions.js
import Voice from "@react-native-voice/voice"; // ✅ REAL iOS STT
import Constants from "expo-constants";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Speech from "expo-speech";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/* ---------- API base ---------- */
const API_BASE =
  (process.env.EXPO_PUBLIC_API_BASE ||
    Constants.expoConfig?.extra?.EXPO_PUBLIC_API_BASE ||
    Constants.manifest?.extra?.EXPO_PUBLIC_API_BASE ||
    "").trim();

function resolveApiBase() {
  if (API_BASE) return API_BASE.replace(/\/$/, "");
  try {
    const hostUri =
      Constants?.expoConfig?.hostUri ||
      Constants?.manifest2?.extra?.expoClient?.hostUri ||
      Constants?.manifest?.debuggerHost ||
      "";
    if (hostUri) {
      let host = hostUri.split(":")[0];
      if (Platform.OS === "android" && (host === "localhost" || host === "127.0.0.1")) {
        host = "10.0.2.2";
      }
      return `http://${host}:8080`;
    }
  } catch {}
  return "";
}
const apiBase = resolveApiBase();

/* ---------- optional deps ---------- */
let LinearGradient = View;
try {
  LinearGradient = require("expo-linear-gradient").LinearGradient || View;
} catch {}
let Haptics;
try {
  Haptics = require("expo-haptics");
} catch {}

/* ---------- theme ---------- */
const useTheme = () => {
  const scheme = useColorScheme();
  const light = {
    scheme: "light",
    bg: "#F6F8FB",
    text: "#0E1116",
    muted: "rgba(14,17,22,0.66)",
    outline: "rgba(14,17,22,0.08)",
    glass: "rgba(255,255,255,0.40)",
    surface: "rgba(255,255,255,0.55)",
    gradA: "#C9FF5A",
    gradB: "#21C7AE",
    stroke: "rgba(0,0,0,0.06)",
  };
  const dark = {
    scheme: "dark",
    bg: "#0B0F16",
    text: "#E7EAF0",
    muted: "rgba(231,234,240,0.90)",
    outline: "rgba(255,255,255,0.10)",
    glass: "rgba(22,27,34,0.42)",
    surface: "rgba(22,27,34,0.54)",
    gradA: "#9BFF4D",
    gradB: "#1AB3A1",
    stroke: "rgba(255,255,255,0.10)",
  };
  return scheme === "dark" ? dark : light;
};
const useScale = () => {
  const { width } = useWindowDimensions();
  return Math.max(0.92, Math.min(1.18, width / 390));
};

/* ---------- prompt builder ---------- */
const buildPrompt = (p) => {
  const n = Math.max(1, Math.min(20, Number(p?.questionCount) || 7));
  const ctx = [
    p?.role ? `Role: ${p.role}` : (p?.major ? `Major: ${p.major}` : ""),
    p?.company ? `Company: ${p.company}` : "",
    `Mode: ${p?.mode || "Auto"}  •  Level: ${p?.level || "Auto"}`,
    p?.topics?.length ? `Focus: ${p.topics.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return [
    `Return EXACTLY ${n} interview questions.`,
    `FORMAT: ${Array.from({ length: n }, (_, i) => `${i + 1}. <question>`).join("  ")}`,
    `One question per line. Number the lines 1..${n}.`,
    "No preamble, no headings, no markdown, no code fences, no explanations.",
    "Each question must be concise (≤ 24 words) and specific to the context.",
    "Avoid duplicates; vary topics and difficulty appropriately.",
    "",
    "CONTEXT:",
    ctx || "General interview.",
  ].join("\n");
};

export default function Questions() {
  const t = useTheme();
  const s = useScale();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(t, s), [t, s]);

  const { payload } = useLocalSearchParams();
  const setup = useMemo(() => {
    try {
      return JSON.parse(decodeURIComponent(String(payload)));
    } catch {
      return {};
    }
  }, [payload]);

  const [loading, setLoading] = useState(true);
  const [uiReady, setUiReady] = useState(false);
  const [err, setErr] = useState("");
  const [questions, setQuestions] = useState([]);
  const [idx, setIdx] = useState(0);
  const [secsLeft, setSecsLeft] = useState(setup?.timerSec || 90);
  const [notes, setNotes] = useState("");
  const [answers, setAnswers] = useState([]);

  // audio / TTS
  const [speaking, setSpeaking] = useState(false);
  const [speakEnabled, setSpeakEnabled] = useState(true);

  // ✅ STT via @react-native-voice/voice
  const [listening, setListening] = useState(false);

  // pulse anim for record glow (we’ll reuse for “listening”)
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (listening) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulse.stopAnimation();
      pulse.setValue(0);
    }
  }, [listening, pulse]);
  const scalePulse = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] });
  const shadowPulse = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.45] });

  // mini EQ bars for listening indicator
  const eq1 = useRef(new Animated.Value(0)).current;
  const eq2 = useRef(new Animated.Value(0)).current;
  const eq3 = useRef(new Animated.Value(0)).current;
  const eqScale = (v) => v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.2] });

  useEffect(() => {
    const loop = (v, d, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: d, delay, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: d, useNativeDriver: true }),
        ])
      );
    let l1, l2, l3;
    if (listening) {
      l1 = loop(eq1, 420, 0);
      l2 = loop(eq2, 380, 120);
      l3 = loop(eq3, 460, 240);
      l1.start();
      l2.start();
      l3.start();
    } else {
      [eq1, eq2, eq3].forEach((v) => {
        v.stopAnimation();
        v.setValue(0);
      });
    }
    return () => {
      l1?.stop?.();
      l2?.stop?.();
      l3?.stop?.();
    };
  }, [listening, eq1, eq2, eq3]);

  /* ---------- STT setup ---------- */
  useEffect(() => {
    Voice.onSpeechResults = (e) => {
      // iOS usually gives final text in e.value[0]
      const text = e?.value?.[0] || "";
      if (text) setNotes(text);
    };
    Voice.onSpeechPartialResults = (e) => {
      const text = e?.value?.[0] || "";
      if (text) setNotes(text);
    };
    Voice.onSpeechError = (e) => {
      console.warn("STT error", e);
      setListening(false);
    };

    return () => {
      Voice.destroy().then(Voice.removeAllListeners).catch(() => {});
    };
  }, []);

  const startSTT = useCallback(async () => {
    try {
      await Voice.start("en-US");
      setListening(true);
      try {
        Haptics &&
          (await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
      } catch {}
    } catch (e) {
      console.warn("STT start error", e);
      setListening(false);
      setErr("Couldn’t start speech recognition.");
    }
  }, []);

  const stopSTT = useCallback(async () => {
    try {
      await Voice.stop();
    } catch (e) {
      console.warn("STT stop error", e);
    }
    setListening(false);
  }, []);

  /* ---------- data fetch ---------- */
  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      if (!apiBase)
        throw new Error(
          "API base URL is empty. Set EXPO_PUBLIC_API_BASE or run a local server."
        );

      // health
      try {
        const ping = await fetch(`${apiBase}/healthz`);
        const ok = await ping.text();
        console.log("healthz status:", ping.status, ok);
        if (!ping.ok) throw new Error(`healthz HTTP ${ping.status}`);
      } catch (e) {
        throw new Error("Can’t reach server (/healthz). Check device & server network.");
      }

      const res = await fetch(`${apiBase}/generate-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: buildPrompt(setup || {}) }),
      });

      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      const raw = await res.text();
      console.log("generate status:", res.status);
      console.log("generate raw:", raw.slice(0, 400));
      if (!res.ok) throw new Error(`HTTP ${res.status} – ${raw.slice(0, 300)}`);

      let qs = [];
      if (contentType.includes("application/json")) {
        const data = JSON.parse(raw);
        qs = Array.isArray(data?.questions) ? data.questions : [];
      } else {
        if (/^\s*</.test(raw) || /not found/i.test(raw)) {
          throw new Error(
            `Unexpected non-JSON from server: ${raw.slice(0, 120)}…`
          );
        }
        qs = raw
          .split(/\r?\n/)
          .map((l) => l.replace(/^\s*\d+[\).\-\s]*/, "").trim())
          .filter(Boolean);
      }
      if (!qs.length) throw new Error("Server returned no questions.");
      setQuestions(qs);
    } catch (e) {
      console.warn("fetch questions failed", e?.name, e?.message);
      setErr(e?.message || "Couldn’t fetch questions.");
    } finally {
      setLoading(false);
      setTimeout(() => setUiReady(true), 250);
    }
  }, [setup]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  /* ---------- timer ---------- */
  useEffect(() => {
    if (loading || !questions.length) return;
    setSecsLeft(setup?.timerSec || 90);
    const iv = setInterval(
      () => setSecsLeft((v) => (v > 0 ? v - 1 : 0)),
      1000
    );
    return () => clearInterval(iv);
  }, [idx, loading, questions.length]);

  /* ---------- TTS ---------- */
  useEffect(() => {
    if (loading || !uiReady) return;
    const q = questions[idx];
    if (!q || !speakEnabled) return;
    setSpeaking(true);
    try {
      Speech.stop();
      const id = setTimeout(() => {
        try {
          Speech.speak(q, {
            language: "en-US",
            rate: 1.0,
            pitch: 1.0,
            onDone: () => setSpeaking(false),
            onStopped: () => setSpeaking(false),
            onError: () => setSpeaking(false),
          });
        } catch {
          setSpeaking(false);
        }
      }, 150);
      return () => clearTimeout(id);
    } catch {
      setSpeaking(false);
    }
    return () => {};
  }, [idx, loading, uiReady, speakEnabled, questions]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        Speech.stop();
      } catch {}
      stopSTT();
    };
  }, [stopSTT]);

  /* ---------- save & grade ---------- */
  const [grading, setGrading] = useState(false);

  const finishQuestion = async () => {
    try {
      Haptics &&
        (await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    } catch {}
    await stopSTT(); // stop listening if still going

    const q = questions[idx] || "";
    const item = {
      question: q,
      answer: notes?.trim() || "(no answer)",
    };

    const nextAnswers = [...answers, item];
    setAnswers(nextAnswers);
    setNotes("");

    if (idx + 1 < questions.length) {
      setIdx((i) => i + 1);
    } else {
      await gradeNow(nextAnswers);
    }
  };

  const gradeNow = async (itemsArg) => {
    if (!apiBase) return setErr("API base URL is empty for /grade.");
    setGrading(true);
    try {
      const r = await fetch(`${apiBase}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setup,
          items: (itemsArg || answers).map((it) => ({
            question: it.question,
            answer: it.answer || "(no answer)",
          })),
        }),
      });
      const raw = await r.text();
      console.log("grade status:", r.status, raw.slice(0, 300));
      if (!r.ok) throw new Error(`HTTP ${r.status} – ${raw.slice(0, 200)}`);
      const data = JSON.parse(raw);
      router.push({
        pathname: "/results",
        params: {
          payload: encodeURIComponent(
            JSON.stringify({ setup, questions, results: data })
          ),
        },
      });
    } catch (e) {
      console.warn("grade error", e);
      setErr(e?.message || "Grade failed.");
    } finally {
      setGrading(false);
    }
  };

  /* ---------- loading / error ---------- */
  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <StatusBar
          barStyle={t.scheme === "dark" ? "light-content" : "dark-content"}
        />
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <ActivityIndicator />
          <Text style={{ color: t.muted, marginTop: 8 }}>
            Preparing your questions…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (err && !questions.length) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <StatusBar
          barStyle={t.scheme === "dark" ? "light-content" : "dark-content"}
        />
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <Text
            style={{
              color: t.text,
              fontWeight: "900",
              fontSize: 18,
              textAlign: "center",
            }}
          >
            Couldn’t load questions
          </Text>
          <Text
            style={{
              color: t.muted,
              marginTop: 8,
              textAlign: "center",
            }}
          >
            {err}
          </Text>
          <Pressable
            onPress={fetchQuestions}
            style={({ pressed }) => [
              {
                marginTop: 14,
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderRadius: 14,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: t.outline,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <Text style={{ color: t.text, fontWeight: "800" }}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  /* ---------- UI ---------- */
  const current = questions[idx];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={t.scheme === "dark" ? "light-content" : "dark-content"}
      />

      {/* background */}
      <LinearGradient
        colors={[t.gradA + "55", t.gradB + "66", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bgWash}
        pointerEvents="none"
      />
      <LinearGradient
        colors={[t.gradA + "4D", t.gradB + "66", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.8 }}
        style={styles.headerGrad}
        pointerEvents="none"
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onLayout={() => setUiReady(true)}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Practice</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.kicker}>
              Question {idx + 1}/{questions.length}
            </Text>
            <Text style={styles.question}>{current}</Text>

            <View style={styles.timerRow}>
              <Text style={styles.timer}>{secsLeft}s</Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {listening ? (
                  <View style={{ flexDirection: "row", gap: 3 }}>
                    <Animated.View
                      style={{
                        width: 3,
                        height: 10,
                        backgroundColor: t.muted,
                        transform: [{ scaleY: eqScale(eq1) }],
                        borderRadius: 2,
                      }}
                    />
                    <Animated.View
                      style={{
                        width: 3,
                        height: 10,
                        backgroundColor: t.muted,
                        transform: [{ scaleY: eqScale(eq2) }],
                        borderRadius: 2,
                      }}
                    />
                    <Animated.View
                      style={{
                        width: 3,
                        height: 10,
                        backgroundColor: t.muted,
                        transform: [{ scaleY: eqScale(eq3) }],
                        borderRadius: 2,
                      }}
                    />
                  </View>
                ) : null}
                <Text style={styles.status}>
                  {speakEnabled
                    ? speaking
                      ? "Playing…"
                      : listening
                      ? "Listening…"
                      : "Ready"
                    : "Muted"}
                </Text>
              </View>
            </View>

            <Text style={styles.inputLabel}>Your answer</Text>
            <TextInput
              style={styles.answer}
              placeholder={
                "Tap Speak and answer out loud, or type here…"
              }
              placeholderTextColor={t.muted}
              value={notes}
              onChangeText={setNotes}
              multiline
              textAlignVertical="top"
              returnKeyType="done"
            />

            <View style={styles.controls}>
              <Pressable
                onPress={() => {
                  if (!current) return;
                  try {
                    Speech.stop();
                    Speech.speak(current, {
                      language: "en-US",
                      rate: 0.85,
                      pitch: 1.0,
                    });
                  } catch {}
                }}
                onLongPress={() => setSpeakEnabled((v) => !v)}
                style={({ pressed }) => [
                  styles.ghostBtn,
                  pressed && { opacity: 0.9 },
                ]}
                android_ripple={{ color: "rgba(0,0,0,0.06)" }}
              >
                <Text style={styles.ghostText}>
                  {speakEnabled ? "Repeat" : "Muted"}
                </Text>
              </Pressable>

              {/* ✅ New STT button using Voice */}
              <Animated.View
                style={[
                  styles.recordWrap,
                  listening && {
                    transform: [{ scale: scalePulse }],
                    shadowOpacity: shadowPulse,
                  },
                ]}
              >
                <Pressable
                  onPress={() => (listening ? stopSTT() : startSTT())}
                  style={({ pressed }) => [
                    styles.recordBtn,
                    pressed && { opacity: 0.96 },
                  ]}
                  android_ripple={{ color: "rgba(255,255,255,0.12)" }}
                  accessibilityRole="button"
                  accessibilityLabel={
                    listening ? "Stop listening" : "Start listening"
                  }
                >
                  <LinearGradient
                    colors={["#C9FF5A", "#21C7AE"]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <Text style={styles.recordText}>
                    {listening ? "Stop" : "Speak"}
                  </Text>
                </Pressable>
              </Animated.View>

              <Pressable
                onPress={finishQuestion}
                android_ripple={{ color: "rgba(255,255,255,0.12)" }}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  pressed && {
                    transform: [{ scale: 0.985 }],
                    opacity: 0.97,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  idx + 1 < questions.length ? "Next question" : "Grade"
                }
              >
                <LinearGradient
                  colors={["#C9FF5A", "#21C7AE"]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.primaryStroke} pointerEvents="none" />
                {grading ? (
                  <ActivityIndicator color="#0B0F16" />
                ) : (
                  <Text style={styles.primaryText}>
                    {idx + 1 < questions.length ? "Next" : "Grade"}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------- styles ---------- */
const makeStyles = (t, s) =>
  StyleSheet.create({
    safe: { flex: 1 },
    bgWash: { ...StyleSheet.absoluteFillObject, opacity: 0.45 },
    headerGrad: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 120,
      opacity: 0.35,
    },

    scroll: {
      paddingHorizontal: 20,
      paddingBottom: 28,
      paddingTop: Platform.select({ ios: 12, android: 16, default: 16 }),
      minHeight: "100%",
      justifyContent: "center",
    },
    container: { width: "100%", maxWidth: 720, alignSelf: "center" },

    header: { alignItems: "center", marginBottom: 12 },
    title: {
      color: t.text,
      fontSize: Math.round(30 * s),
      fontWeight: "900",
      letterSpacing: -0.3,
    },

    card: {
      backgroundColor: t.glass,
      borderRadius: 22,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.outline,
      padding: 16,
      shadowColor: "#000",
      shadowOpacity: Platform.select({ ios: 0.16, default: 0 }),
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 12 },
      elevation: Platform.select({ android: 4, default: 0 }),
      minHeight: 320,
    },

    kicker: { color: t.muted, fontWeight: "900", marginBottom: 8 },
    question: {
      color: t.text,
      fontSize: Math.round(18.5 * s),
      lineHeight: Math.round(18.5 * s * 1.45),
      fontWeight: "800",
      marginBottom: 10,
    },

    timerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    timer: { color: t.text, fontSize: Math.round(16 * s), fontWeight: "900" },
    status: { color: t.muted, fontSize: Math.round(12.5 * s) },

    inputLabel: {
      color: t.muted,
      fontWeight: "800",
      marginTop: 8,
      marginBottom: 6,
    },
    answer: {
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.outline,
      backgroundColor: t.surface,
      color: t.text,
      minHeight: 100,
      padding: 12,
      fontSize: Math.round(15 * s),
      lineHeight: Math.round(15 * s * 1.5),
      marginBottom: 14,
    },

    controls: { flexDirection: "row", alignItems: "center", gap: 10 },

    ghostBtn: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.outline,
      backgroundColor: "transparent",
    },
    ghostText: {
      color: t.text,
      fontWeight: "900",
      fontSize: Math.round(14 * s),
    },

    recordWrap: {
      position: "relative",
      borderRadius: 999,
      overflow: "visible",
      shadowColor: "#21C7AE",
      shadowOffset: { width: 0, height: 10 },
      shadowRadius: 20,
      shadowOpacity: 0,
    },
    recordBtn: {
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: 999,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      minWidth: 110,
      borderWidth: 1,
      borderColor: t.stroke,
    },
    recordText: {
      color: "#0B0F16",
      fontWeight: "900",
      fontSize: Math.round(14.5 * s),
    },

    primaryBtn: {
      flex: 1,
      minHeight: 52,
      borderRadius: 999,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: t.stroke,
      shadowColor: "#000",
      shadowOpacity: Platform.select({ ios: 0.16, default: 0 }),
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 12 },
      elevation: Platform.select({ android: 5, default: 0 }),
    },
    primaryStroke: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.stroke,
    },
    primaryText: {
      color: "#0B0F16",
      fontWeight: "900",
      letterSpacing: 0.2,
      fontSize: Math.round(16.5 * s),
    },
  });