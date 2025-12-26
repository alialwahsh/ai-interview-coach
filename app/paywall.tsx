// app/paywall.tsx
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  PixelRatio,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  useWindowDimensions
} from "react-native";
import Purchases, {
  CustomerInfo,
  PurchasesPackage
} from "react-native-purchases";
import { SafeAreaView } from "react-native-safe-area-context";

import { useRevenueCat } from "../lib/RevenueCatProvider";
import { ENTITLEMENT_ID, PAYWALL_OFFERING_ID } from "../lib/revenuecat";

/* ---------- scaling helpers ---------- */
const { width: BASE_WIDTH } = require("react-native").Dimensions.get("window");
const baseScale = BASE_WIDTH / 390;
const normalize = (size: number) =>
  Math.round(PixelRatio.roundToNearestPixel(size * baseScale));

/* ---------- theme ---------- */
const useTheme = () => {
  const scheme = useColorScheme();
  const light = {
    scheme: "light" as const,
    bg: "#F6F8FB",
    text: "#0E1116",
    muted: "rgba(14,17,22,0.72)",
    outline: "rgba(14,17,22,0.08)",
    card: "rgba(255,255,255,0.92)",
    badge: "rgba(33,199,174,0.12)",
    badgeText: "#138c78",
    gradA: "#C9FF5A",
    gradB: "#21C7AE",
    danger: "#EF4444",
  };
  const dark = {
    scheme: "dark" as const,
    bg: "#05070D",
    text: "#E7EAF0",
    muted: "rgba(231,234,240,0.80)",
    outline: "rgba(255,255,255,0.12)",
    card: "rgba(18,22,32,0.96)",
    badge: "rgba(33,199,174,0.15)",
    badgeText: "#8CF2D7",
    gradA: "#9BFF4D",
    gradB: "#1AB3A1",
    danger: "#FF6B70",
  };
  return scheme === "dark" ? dark : light;
};

/* ---------- price helpers ---------- */
function getDiscountLabel(monthlyPrice: number, yearlyPrice: number) {
  if (!monthlyPrice || !yearlyPrice) return "";
  const perMonth = yearlyPrice / 12;
  const savings = (monthlyPrice - perMonth) / monthlyPrice;
  if (savings <= 0) return "";
  const pct = Math.round(savings * 100);
  return pct < 5 ? "" : `${pct}% off`;
}

/* ---------- component ---------- */
export default function Paywall() {
  const t = useTheme();
  const { height } = useWindowDimensions();
  const router = useRouter();

  const { isPro, refreshCustomerInfo } = useRevenueCat();

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [monthly, setMonthly] = useState<PurchasesPackage | null>(null);
  const [yearly, setYearly] = useState<PurchasesPackage | null>(null);
  const [selectedId, setSelectedId] = useState<"monthly" | "yearly">("monthly");

  /* DEBUG: products */
  useEffect(() => {
    (async () => {
      try {
        const prods = await Purchases.getProducts([
          "com.ceoali.aiinterviewcoach.pro.monthly",
          "com.ceoali.aiinterviewcoach.pro.yearly",
        ]);
        console.log("RC DEBUG PRODUCTS:", JSON.stringify(prods, null, 2));
      } catch (e) {
        console.log("RC DEBUG getProducts error:", e);
      }
    })();
  }, []);

  const selectedPackage = useMemo(() => {
    if (selectedId === "yearly") return yearly || monthly;
    return monthly || yearly;
  }, [selectedId, monthly, yearly]);

  /* ---------- load offerings ---------- */
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const offerings = await Purchases.getOfferings();

        const offering = PAYWALL_OFFERING_ID
          ? offerings.all[PAYWALL_OFFERING_ID]
          : offerings.current;

        if (!offering) throw new Error("No active offering configured.");

        const monthlyPkg =
          offering.availablePackages.find((p) => p.identifier === "monthly") ||
          offering.monthly ||
          null;

        const yearlyPkg =
          offering.availablePackages.find((p) => p.identifier === "yearly") ||
          offering.annual ||
          null;

        if (!monthlyPkg && !yearlyPkg)
          throw new Error("No monthly/yearly packages found.");

        if (!cancelled) {
          setMonthly(monthlyPkg);
          setYearly(yearlyPkg);
        }
      } catch (e: any) {
        console.warn("RevenueCat error", e);
        if (!cancelled) setError(e?.message || "Could not load plans.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------- purchase ---------- */
  const handlePurchase = async () => {
    if (!selectedPackage) return;

    setProcessing(true);
    setError(null);

    try {
      const res = await Purchases.purchasePackage(selectedPackage);
      const info: CustomerInfo = res.customerInfo;

      const active = info.entitlements.active[ENTITLEMENT_ID] != null;
      if (active) {
        await refreshCustomerInfo();
        Alert.alert("You're Pro!", "Subscription active.");
        if (router.canGoBack()) router.back();
      } else {
        setError("Purchase succeeded but entitlement not active.");
      }
    } catch (err: any) {
      if (!err?.userCancelled) {
        console.warn("purchase error", err);
        setError(err?.message || "Purchase failed.");
      }
    } finally {
      setProcessing(false);
    }
  };

  /* ---------- restore ---------- */
  const handleRestore = async () => {
    setProcessing(true);
    setError(null);

    try {
      const info = await Purchases.restorePurchases();
      const active = info.entitlements.active[ENTITLEMENT_ID] != null;

      await refreshCustomerInfo();

      if (active) {
        Alert.alert("Restored", "Your subscription was restored.");
        if (router.canGoBack()) router.back();
      } else {
        Alert.alert("No Purchases", "No active plans found.");
      }
    } catch (e: any) {
      console.warn("restore error", e);
      setError(e?.message || "Restore failed.");
    } finally {
      setProcessing(false);
    }
  };

  /* ---------- UI bits ---------- */
  const monthlyPrice = monthly?.product.price ?? 0;
  const yearlyPrice = yearly?.product.price ?? 0;
  const discountLabel = getDiscountLabel(monthlyPrice, yearlyPrice);

  const smallPrintLines = [
    "• Monthly Plan: Auto-renewing monthly subscription.",
    "• Yearly Plan: Auto-renewing yearly subscription.",
    "• Payment will be charged to your Apple ID account at confirmation of purchase.",
    "• Your subscription automatically renews unless canceled at least 24 hours before period end.",
    "• Manage or cancel anytime in App Store settings.",
    "",
    "Privacy Policy: https://elated-skipjack-874.notion.site/Privacy-Policy-Interview-AI-Coach-2aa3a5d5453d8094ba86e8538c2b065f",
    "Terms of Use: https://elated-skipjack-874.notion.site/Terms-of-Use-Interview-AI-Coach-2aa3a5d5453d8021a700e034a8a1549d",
  ];

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: t.bg, minHeight: height }]}
      edges={["top", "left", "right", "bottom"]}
    >
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={t.scheme === "dark" ? "light-content" : "dark-content"}
      />

      <LinearGradient
        colors={[t.gradA + "33", t.gradB + "55", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bgGrad}
        pointerEvents="none"
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, { minHeight: height * 0.98 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          {/* header */}
          <View style={styles.header}>
            <Text style={[styles.appName, { color: t.muted }]}>
              Interview AI Coach
            </Text>
            <Text style={[styles.title, { color: t.text }]}>
              Unlock Pro practice
            </Text>
            <Text style={[styles.subtitle, { color: t.muted }]}>
              Unlimited AI questions, voice practice, and instant feedback to
              prep faster and feel confident.
            </Text>
          </View>

          {/* features */}
          <View
            style={[
              styles.featuresCard,
              { backgroundColor: t.card, borderColor: t.outline },
            ]}
          >
            {[
              "Unlimited AI-generated interview questions",
              "Voice practice with recording & transcription",
              "Instant scoring and improvement tips",
              "Save answers to track your progress",
            ].map((feat) => (
              <View style={styles.featureRow} key={feat}>
                <View
                  style={[
                    styles.checkDot,
                    { backgroundColor: t.gradB + "DD" },
                  ]}
                />
                <Text style={[styles.featureText, { color: t.text }]}>
                  {feat}
                </Text>
              </View>
            ))}
          </View>

          {/* plans */}
          <View style={styles.plansWrap}>
            {monthly && (
              <PlanCard
                label="Monthly"
                badge="3-day free trial"
                desc="3-day free, then billed monthly. Cancel anytime."
                price={monthly.product.priceString}
                perText="/month"
                selected={selectedId === "monthly"}
                onPress={() => setSelectedId("monthly")}
                theme={t}
              />
            )}

            {yearly && (
              <PlanCard
                label="Yearly"
                badge={discountLabel || "Best value"}
                desc="Commit to your growth and save more."
                price={yearly.product.priceString}
                perText="/year"
                selected={selectedId === "yearly"}
                onPress={() => setSelectedId("yearly")}
                theme={t}
              />
            )}
          </View>

          {/* error */}
          {error && (
            <View
              style={[
                styles.errorBox,
                {
                  borderColor: t.danger,
                  backgroundColor:
                    t.scheme === "dark"
                      ? "rgba(127,29,29,0.25)"
                      : "rgba(248,113,113,0.08)",
                },
              ]}
            >
              <Text style={[styles.errorText, { color: t.danger }]}>
                {error}
              </Text>
            </View>
          )}

          {/* primary */}
          <Pressable
            disabled={processing || !selectedPackage || loading}
            onPress={handlePurchase}
            android_ripple={{ color: "rgba(0,0,0,0.08)" }}
            style={[
              styles.primaryBtn,
              {
                opacity:
                  processing || loading || !selectedPackage ? 0.8 : 1,
              },
            ]}
          >
            <LinearGradient
              colors={[t.gradA, t.gradB]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
            <Text style={styles.primaryText}>
              {processing
                ? "Finishing up…"
                : selectedId === "yearly"
                ? "Continue with Yearly"
                : "Continue with Monthly"}
            </Text>
          </Pressable>

          {/* secondary */}
          <View style={styles.secondaryRow}>
            <Pressable onPress={handleRestore} style={styles.linkBtn}>
              <Text style={[styles.linkText, { color: t.muted }]}>
                Restore purchases
              </Text>
            </Pressable>

            {router.canGoBack() && (
              <Pressable onPress={() => router.back()} style={styles.linkBtn}>
                <Text style={[styles.linkText, { color: t.muted }]}>
                  Not now
                </Text>
              </Pressable>
            )}
          </View>

          {/* loading */}
          {loading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator />
              <Text
                style={[styles.loadingText, { color: t.muted, marginLeft: 8 }]}
              >
                Loading plans…
              </Text>
            </View>
          )}

          {/* small print — FIXED */}
          <View style={styles.smallPrint}>
            {smallPrintLines.map((line) => (
              <Text
                key={line}
                style={[styles.smallPrintText, { color: t.muted }]}
                onPress={() => {
                  if (line.includes("http")) {
                    Linking.openURL(line.split(" ").pop()!);
                  }
                }}
              >
                {line}
              </Text>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------- plan card ---------- */
type PlanCardProps = {
  label: string;
  badge: string | null;
  desc: string;
  price: string;
  perText: string;
  selected: boolean;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
};

function PlanCard({
  label,
  badge,
  desc,
  price,
  perText,
  selected,
  onPress,
  theme: t,
}: PlanCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.planCard,
        {
          borderColor: selected ? t.gradB : t.outline,
          backgroundColor: selected
            ? t.card
            : t.scheme === "dark"
            ? "rgba(15,23,42,0.85)"
            : "rgba(255,255,255,0.9)",
        },
      ]}
    >
      <View style={styles.planHeaderRow}>
        <Text style={[styles.planLabel, { color: t.text }]}>{label}</Text>

        {badge && (
          <View style={[styles.badge, { backgroundColor: t.badge }]}>
            <Text style={[styles.badgeText, { color: t.badgeText }]}>
              {badge}
            </Text>
          </View>
        )}
      </View>

      <Text style={[styles.planDesc, { color: t.muted }]}>{desc}</Text>

      <View style={styles.planPriceRow}>
        <Text style={styles.planPrice}>{price}</Text>
        <Text style={[styles.planPer, { color: t.muted }]}>{perText}</Text>
      </View>
    </Pressable>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  safe: { flex: 1 },
  bgGrad: { ...StyleSheet.absoluteFillObject, opacity: 0.55 },
  scroll: {
    paddingHorizontal: normalize(20),
    paddingVertical: normalize(18),
  },
  container: { width: "100%", maxWidth: 720, alignSelf: "center" },

  header: { marginBottom: normalize(18) },
  appName: {
    fontSize: normalize(13),
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  title: {
    marginTop: normalize(6),
    fontSize: normalize(26),
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: normalize(8),
    fontSize: normalize(14),
    lineHeight: normalize(20),
  },

  featuresCard: {
    marginTop: normalize(8),
    padding: normalize(14),
    borderRadius: normalize(18),
    borderWidth: StyleSheet.hairlineWidth,
  },
  featureRow: { flexDirection: "row", alignItems: "center", marginVertical: 3 },
  checkDot: {
    width: normalize(7),
    height: normalize(7),
    borderRadius: 4,
    marginRight: normalize(8),
  },
  featureText: { fontSize: normalize(14), flexShrink: 1 },

  plansWrap: { marginTop: normalize(18), gap: normalize(10) },
  planCard: {
    borderWidth: 1.2,
    borderRadius: normalize(18),
    paddingHorizontal: normalize(14),
    paddingVertical: normalize(10),
  },
  planHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  planLabel: { fontSize: normalize(15.5), fontWeight: "800" },
  badge: {
    paddingHorizontal: normalize(8),
    paddingVertical: normalize(3),
    borderRadius: 999,
  },
  badgeText: { fontSize: normalize(11), fontWeight: "800" },
  planDesc: { marginTop: normalize(4), fontSize: normalize(12.5) },
  planPriceRow: {
    marginTop: normalize(8),
    flexDirection: "row",
    alignItems: "flex-end",
  },
  planPrice: { fontSize: normalize(18), fontWeight: "900", marginRight: 4 },
  planPer: { fontSize: normalize(12.5) },

  errorBox: {
    marginTop: normalize(14),
    padding: normalize(10),
    borderRadius: normalize(14),
    borderWidth: StyleSheet.hairlineWidth,
  },
  errorText: { fontSize: normalize(13), fontWeight: "700" },

  primaryBtn: {
    marginTop: normalize(18),
    borderRadius: 999,
    paddingVertical: normalize(14),
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    overflow: "hidden",
    borderColor: "rgba(0,0,0,0.08)",
  },
  primaryText: {
    fontSize: normalize(15.5),
    fontWeight: "900",
    letterSpacing: 0.3,
    color: "#05070D",
  },

  secondaryRow: {
    marginTop: normalize(10),
    flexDirection: "row",
    justifyContent: "center",
    gap: normalize(16),
  },
  linkBtn: { paddingVertical: normalize(6), paddingHorizontal: 4 },
  linkText: {
    fontSize: normalize(13),
    fontWeight: "600",
    textDecorationLine: "underline",
  },

  loadingRow: { marginTop: 10, flexDirection: "row", alignItems: "center" },
  loadingText: { fontSize: normalize(13) },

  smallPrint: { marginTop: normalize(16) },
  smallPrintText: {
    fontSize: normalize(11),
    lineHeight: normalize(14),
  },
});