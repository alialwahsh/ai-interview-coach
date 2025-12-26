// app/interview.js
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator, Alert,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text, TextInput,
    useColorScheme, useWindowDimensions,
    View,
} from "react-native";

/** theme / type **/
const useTheme = () => {
  const scheme = useColorScheme();
  const light = { bg:"#F7F8FB", card:"#FFF", text:"#0F1115", sub:"#616A7A", primary:"#6D5EF7", primaryText:"#FFF", outline:"rgba(10,20,40,.08)", danger:"#EF4444" };
  const dark  = { bg:"#0D1117", card:"#161B22", text:"#E6E8EE", sub:"#9AA3B2", primary:"#8B7CFF", primaryText:"#0B0D12", outline:"rgba(255,255,255,.08)", danger:"#F87171" };
  return { ...(scheme === "dark" ? dark : light), scheme };
};
const useScale = () => {
  const { width } = useWindowDimensions();
  return Math.max(0.9, Math.min(1.15, width / 390));
};

export default function Interview() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const t = useTheme(); const s = useScale();
  const styles = useMemo(() => makeStyles(t, s), [t, s]);

  // load payload (from /questions)
  const [setup, setSetup] = useState(null);
  useEffect(() => {
    try {
      const raw = params?.payload ? decodeURIComponent(String(params.payload)) : "";
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length < 1) throw new Error();
      setSetup(parsed);
    } catch {
      Alert.alert("Missing data", "Go back and generate questions.");
      router.replace("/setup");
    }
  }, [params?.payload]);

  const [idx, setIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [running, setRunning] = useState(false);
  const [answers, setAnswers] = useState({}); // idx -> text summary
  const [recs, setRecs] = useState({}); // idx -> audio uri (optional)

  const recRef = useRef(null);
  const timerRef = useRef(null);

  const q = setup?.questions?.[idx] ?? "";
  const perAnswerSec = Number(setup?.timerSec || 90);

  // speak on question change
  useEffect(() => {
    if (!q) return;
    Speech.stop();
    Speech.speak(q, { language: "en-US", pitch: 1.0, rate: Platform.select({ ios: 0.5, android: 1.0, default: 1.0 }) });
  }, [q]);

  // timer controls
  const start = async () => {
    if (running) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSecondsLeft(perAnswerSec);
    setRunning(true);
    timerRef.current && clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setSecondsLeft((x) => {
        if (x <= 1) {
          clearInterval(timerRef.current);
          setRunning(false);
          stopRecording(); // auto-stop
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return 0;
        }
        return x - 1;
      });
    }, 1000);
    startRecording().catch(() => {}); // best-effort
  };

  const pause = () => {
    if (!running) return;
    setRunning(false);
    timerRef.current && clearInterval(timerRef.current);
    stopRecording().catch(() => {});
  };

  const reset = () => {
    pause();
    setSecondsLeft(0);
  };

  const next = async () => {
    pause();
    if (idx < (setup.questions.length - 1)) {
      setIdx(idx + 1);
      setSecondsLeft(0);
      setTimeout(() => start(), 300); // auto-start next
    } else {
      goResults();
    }
  };

  const prev = () => {
    pause();
    if (idx > 0) {
      setIdx(idx - 1);
      setSecondsLeft(0);
    }
  };

  // recording (optional)
  async function startRecording() {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recRef.current = rec;
    } catch (e) {
      // ignore; you can still type your summary
    }
  }
  async function stopRecording() {
    try {
      const rec = recRef.current;
      if (!rec) return;
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      recRef.current = null;
      setRecs((r) => ({ ...r, [idx]: uri }));
    } catch {}
  }

  const goResults = () => {
    const payload = {
      setup: {
        role: setup.role, major: setup.major, company: setup.company,
        mode: setup.mode, level: setup.level, topics: setup.topics,
      },
      timerSec: perAnswerSec,
      items: setup.questions.map((qq, i) => ({
        question: qq,
        textAnswer: (answers[i] || "").trim(), // what user typed
        audioUri: recs[i] || null,            // optional (not used for scoring)
        durationSec: perAnswerSec - secondsLeft > 0 ? perAnswerSec - secondsLeft : perAnswerSec,
      })),
    };
    // we score only text for now (DeepSeek = text model). Audio is saved for UI.
    const p = encodeURIComponent(JSON.stringify(payload));
    router.push({ pathname: "/results", params: { payload: p } });
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      <StatusBar barStyle={t.scheme === "dark" ? "light-content" : "dark-content"} translucent backgroundColor="transparent" />
      {!setup ? (
        <View style={{ flex:1, alignItems:"center", justifyContent:"center" }}>
          <ActivityIndicator />
          <Text style={{ color:t.sub, marginTop:8 }}>Loading…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.header}>Interview</Text>

          <View style={styles.card}>
            <Text style={styles.counter}>Question {idx + 1} / {setup.questions.length}</Text>
            <Text style={styles.question}>{q}</Text>

            <View style={styles.timerRow}>
              <Text style={styles.timer}>{running ? secondsLeft : perAnswerSec}s</Text>
              <View style={{ flexDirection:"row", gap:10 }}>
                <Pressable onPress={running ? pause : start} style={({pressed})=>[styles.prim, pressed&&{opacity:.95}]}>
                  <Text style={styles.primTxt}>{running ? "Pause" : "Start"}</Text>
                </Pressable>
                <Pressable onPress={reset} style={({pressed})=>[styles.sec, pressed&&{opacity:.9}]}>
                  <Text style={styles.secTxt}>Reset</Text>
                </Pressable>
              </View>
            </View>

            <Text style={styles.label}>What did you say? (brief notes for grading)</Text>
            <TextInput
              multiline
              placeholder="Jot the key points you answered…"
              placeholderTextColor={t.sub}
              style={styles.input}
              value={answers[idx] || ""}
              onChangeText={(v)=>setAnswers(a=>({ ...a, [idx]: v }))}
            />

            <View style={styles.navRow}>
              <Pressable onPress={prev} disabled={idx===0} style={({pressed})=>[styles.navBtn, idx===0 && {opacity:.5}, pressed&&{opacity:.9}]}>
                <Text style={styles.navTxt}>◀ Prev</Text>
              </Pressable>
              <Pressable onPress={next} style={({pressed})=>[styles.navBtn, pressed&&{opacity:.9}]}>
                <Text style={styles.navTxt}>{idx < setup.questions.length - 1 ? "Next ▶" : "Finish ▶"}</Text>
              </Pressable>
            </View>

            {recs[idx] ? <Text style={{ color:t.sub, marginTop:6 }}>🎙️ Recorded audio saved locally.</Text> : null}
            <Text style={{ color:t.sub, marginTop:6 }}>Tip: You can leave the notes blank—grading still works, but text helps accuracy.</Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (t, s) => StyleSheet.create({
  safe:{ flex:1 },
  scroll:{ paddingTop:16, paddingHorizontal:18, paddingBottom:28, minHeight:"100%", backgroundColor:t.bg },
  header:{ color:t.text, fontSize:26*s, fontWeight:"900", marginBottom:10 },
  card:{ backgroundColor:t.card, borderRadius:16, borderWidth:StyleSheet.hairlineWidth, borderColor:t.outline, padding:14 },
  counter:{ color:t.sub, fontWeight:"800" },
  question:{ color:t.text, fontSize:18*s, fontWeight:"800", marginTop:8 },
  timerRow:{ marginTop:12, flexDirection:"row", alignItems:"center", justifyContent:"space-between" },
  timer:{ color:t.text, fontSize:22*s, fontWeight:"900" },
  prim:{ backgroundColor:t.primary, paddingVertical:10, paddingHorizontal:14, borderRadius:12 },
  primTxt:{ color:t.primaryText, fontWeight:"900" },
  sec:{ backgroundColor:t.card, borderWidth:StyleSheet.hairlineWidth, borderColor:t.outline, paddingVertical:10, paddingHorizontal:14, borderRadius:12 },
  secTxt:{ color:t.text, fontWeight:"800" },
  label:{ color:t.text, fontWeight:"800", marginTop:14, marginBottom:6 },
  input:{ minHeight:90, backgroundColor:t.card, color:t.text, borderWidth:StyleSheet.hairlineWidth, borderColor:t.outline, borderRadius:12, padding:10, textAlignVertical:"top" },
  navRow:{ marginTop:12, flexDirection:"row", justifyContent:"space-between" },
  navBtn:{ backgroundColor:t.card, borderWidth:StyleSheet.hairlineWidth, borderColor:t.outline, borderRadius:12, paddingVertical:10, paddingHorizontal:16 },
  navTxt:{ color:t.text, fontWeight:"800" },
});