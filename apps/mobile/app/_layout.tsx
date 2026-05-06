import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{
        headerStyle: { backgroundColor: "#09090b" },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "900", letterSpacing: 1 },
      }}>
        <Stack.Screen name="index" options={{ title: "EDGE LAB" }} />
        <Stack.Screen name="editor/[projectId]" options={{ title: "Editor" }} />
      </Stack>
    </>
  );
}
