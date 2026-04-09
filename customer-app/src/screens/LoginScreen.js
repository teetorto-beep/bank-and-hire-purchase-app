import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const u = username.trim().toLowerCase();
    const p = password.trim();
    if (!u || !p) { Alert.alert("Error", "Enter username and password"); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*, accounts(id, account_number, type, balance, status, interest_rate, opened_at)")
        .eq("app_username", u)
        .eq("app_password", p)
        .single();
      if (error || !data) {
        Alert.alert("Login Failed", "Invalid username or password.\nContact your branch if you need help.");
        setLoading(false);
        return;
      }
      await AsyncStorage.setItem("customer_session", JSON.stringify(data));
      onLogin(data);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.logoBox}><Text style={styles.logoLetter}>M</Text></View>
          <Text style={styles.appName}>Majupat Love Enterprise</Text>
          <Text style={styles.appSub}>Customer Portal</Text>
          <Text style={styles.devBy}>Maxbraynn Technology & Systems</Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sign In</Text>
            <Text style={styles.cardSub}>Enter your account username and password</Text>
            <Text style={styles.label}>Username</Text>
            <TextInput style={styles.input} placeholder="e.g. john.doe" placeholderTextColor="#475569"
              value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} returnKeyType="next"/>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passRow}>
              <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="Your password"
                placeholderTextColor="#475569" value={password} onChangeText={setPassword}
                secureTextEntry={!showPass} returnKeyType="done" onSubmitEditing={handleLogin}/>
              <TouchableOpacity onPress={() => setShowPass(p => !p)} style={styles.eyeBtn}>
                <Text style={{ fontSize: 16 }}>{showPass ? "🙈" : "👁️"}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={[styles.btn, loading && { opacity: 0.6 }]} onPress={handleLogin} disabled={loading} activeOpacity={0.85}>
              {loading ? <ActivityIndicator color="#fff"/> : <Text style={styles.btnText}>Sign In</Text>}
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>Contact your branch if you need access or forgot your password.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0f172a" },
  scroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  logoBox: { width: 72, height: 72, borderRadius: 18, backgroundColor: "#1a56db", alignItems: "center", justifyContent: "center", marginBottom: 14, elevation: 8 },
  logoLetter: { color: "#fff", fontSize: 36, fontWeight: "900" },
  appName: { color: "#fff", fontSize: 20, fontWeight: "800", marginBottom: 4 },
  appSub: { color: "#1a56db", fontSize: 14, fontWeight: "700", marginBottom: 4 },
  devBy: { color: "#475569", fontSize: 11, marginBottom: 36 },
  card: { width: "100%", backgroundColor: "#1e293b", borderRadius: 16, padding: 24, borderWidth: 1, borderColor: "#334155", marginBottom: 20 },
  cardTitle: { color: "#f1f5f9", fontSize: 20, fontWeight: "800", marginBottom: 4 },
  cardSub: { color: "#64748b", fontSize: 13, marginBottom: 24 },
  label: { color: "#94a3b8", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },
  input: { backgroundColor: "#0f172a", borderWidth: 1, borderColor: "#334155", borderRadius: 10, padding: 14, color: "#f1f5f9", fontSize: 16, marginBottom: 20 },
  passRow: { flexDirection: "row", alignItems: "center", marginBottom: 24, gap: 8 },
  eyeBtn: { padding: 14, backgroundColor: "#0f172a", borderWidth: 1, borderColor: "#334155", borderRadius: 10 },
  btn: { backgroundColor: "#1a56db", borderRadius: 10, padding: 16, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  hint: { color: "#475569", fontSize: 12, textAlign: "center", lineHeight: 18 },
});
