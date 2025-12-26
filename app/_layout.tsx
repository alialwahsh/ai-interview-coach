// app/_layout.tsx
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { RevenueCatProvider } from "../lib/RevenueCatProvider";

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <RevenueCatProvider>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "transparent" },
            animation: "fade",
          }}
        >
          {/* 👇 THIS is your entry screen (paywall-or-setup) */}
          <Stack.Screen name="index" />

          {/* other routes you actually use */}
          <Stack.Screen name="setup" />
          <Stack.Screen name="questions" />
          <Stack.Screen name="results" />
          <Stack.Screen name="modal" options={{ presentation: "modal" }} />
        </Stack>

        <StatusBar
          style={colorScheme === "dark" ? "light" : "dark"}
          translucent
          backgroundColor="transparent"
        />
      </ThemeProvider>
    </RevenueCatProvider>
  );
}