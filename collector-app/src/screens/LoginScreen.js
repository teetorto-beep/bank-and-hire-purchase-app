import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, ScrollView, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../supabase";
import { C } from "../theme";

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);

  const handleLogin = async () => {
    const u = username.trim().toLowerCase();
    const p = password.trim();
    if (!u || !p) { Alert.alert("Required", "Enter your username and password"); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.from("collectors").select("*")
        .eq("username", u).eq("password", p).eq("status", "active").single();
      if (error || !data) {
        Alert.alert("Login Failed", "Invalid username or password.\nContact your supervisor.");
        setLoading(false); return;
      }
      await AsyncStorage.setItem("collector_session", JSON.stringify(data));
      onLogin(data);
    } catch(e) { Alert.alert("Error", e.message || "Something went wrong"); }
    setLoading(false);
  };

  return (
    <SafeAreaView style={S.root} edges={["top","bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor={C.bgDark} />
      <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS==="ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={S.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <View style={S.top}>
            <View style={S.logo}><Text style={S.logoTxt}>ML</Text></View>
            <Text style={S.brand}>Majupat Love</Text>
            <Text style={S.sub}>Collector Portal</Text>
          </View>

          <View style={S.form}>
            <Text style={S.label}>Username</Text>
            <TextInput
              style={S.input}
              placeholder="Enter username"
              placeholderTextColor={C.text4}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />

            <Text style={[S.label, { marginTop:16 }]}>Password</Text>
            <View style={S.passRow}>
              <TextInput
                style={[S.input, { flex:1, marginBottom:0 }]}
                placeholder="Enter password"
                placeholderTextColor={C.text4}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPass}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity style={S.eye} onPress={() => setShowPass(v => !v)}>
                <Text style={S.eyeTxt}>{showPass ? "Hide" : "Show"}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[S.btn, loading && { opacity:0.7 }]} onPress={handleLogin} disabled={loading} activeOpacity={0.85}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={S.btnTxt}>Sign In</Text>}
            </TouchableOpacity>

            <Text style={S.hint}>Contact your supervisor if you need access.</Text>
          </View>

          <Text style={S.footer}>Powered by Maxbraynn Technology</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  root:    { flex:1, backgroundColor:C.bgDark },
  scroll:  { flexGrow:1 },
  top:     { alignItems:"center", paddingTop:56, paddingBottom:40 },
  logo:    { width:64, height:64, borderRadius:16, backgroundColor:C.brand, alignItems:"center", justifyContent:"center", marginBottom:16 },
  logoTxt: { color:"#fff", fontSize:22, fontWeight:"900" },
  brand:   { color:"#fff", fontSize:24, fontWeight:"800", marginBottom:4 },
  sub:     { color:"rgba(255,255,255,0.4)", fontSize:13 },
  form:    { backgroundColor:"#fff", borderTopLeftRadius:24, borderTopRightRadius:24, flex:1, paddingHorizontal:24, paddingTop:28, paddingBottom:24, minHeight:360 },
  label:   { fontSize:13, fontWeight:"600", color:C.text2, marginBottom:8 },
  input:   { backgroundColor:C.bg, borderWidth:1, borderColor:C.border, borderRadius:12, paddingHorizontal:14, paddingVertical:14, fontSize:15, color:C.text, marginBottom:4 },
  passRow: { flexDirection:"row", alignItems:"center", gap:8, marginBottom:4 },
  eye:     { paddingHorizontal:12, paddingVertical:14 },
  eyeTxt:  { fontSize:13, color:C.brand, fontWeight:"600" },
  btn:     { backgroundColor:C.brand, borderRadius:12, paddingVertical:16, alignItems:"center", marginTop:24, marginBottom:16 },
  btnTxt:  { color:"#fff", fontSize:16, fontWeight:"700" },
  hint:    { fontSize:12, color:C.text4, textAlign:"center" },
  footer:  { color:"rgba(255,255,255,0.2)", fontSize:11, textAlign:"center", paddingVertical:20, backgroundColor:C.bgDark },
});
