// app/index.tsx

import { ActivityIndicator, View } from "react-native";
import { useRevenueCat } from "../lib/RevenueCatProvider";
import PaywallScreen from "./paywall";
import Setup from "./setup";

export default function EntryScreen() {
  // Normal RevenueCat subscription logic
  const { loading, isPro } = useRevenueCat();

  // Show loading spinner while RevenueCat initializes
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#F6F8FB",
        }}
      >
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // If user has Pro subscription, go straight to app
  if (isPro) {
    return <Setup />;
  }

  // Otherwise show paywall
  return <PaywallScreen />;
}