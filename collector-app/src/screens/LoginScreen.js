import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C } from '../theme';

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);

  const handleLogin = async () => {
    const u = username.trim().toLowerCase();
    const p = password.trim();
    if (!u || !p) { Alert.alert('Required', 'Enter your username and password'); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.from('collectors').select('*')
        .eq('username', u).eq('password', p).eq('status', 'active').single();
      if (error || !data) {
        Alert.alert('Login Failed', 'Invalid username or password.\nContact your supervisor for help.');
        setLoading(false); return;
      }
      await AsyncStorage.setItem('collector_session', JSON.stringify(data));
      onLogin(data);
    } catch (e) { Alert.alert('Error', e.message || 'Something went wrong'); }
    setLoading(false);
  };

  return (
    <SafeAreaView style={S.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={S.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Green top area */}
          <View style={S.topArea}>
            <View style={S.logoBox}><Text style={S.logoTxt}>ML</Text></View>
            <Text style={S.appName}>Majupat Love</Text>
            <Text style={S.appSub}>Collector Portal</Text>
          </View>

          {/* White card */}
          <View style={S.card}>
            <Text style={S.cardTitle}>Sign In</Text>
            <Text style={S.cardSub}>Enter your credentials to continue</Text>

            <Text style={S.label}>USERNAME</Text>
            <View style={S.inputRow}>
              <Text style={S.inputIcon}>👤</Text>
              <TextInput style={S.input} placeholder="Your username"
                placeholderTextColor={C.text4} value={username} onChangeText={setUsername}
                autoCapitalize="none" autoCorrect={false} returnKeyType="next" />
            </View>

            <Text style={S.label}>PASSWORD</Text>
            <View style={S.inputRow}>
              <Text style={S.inputIcon}>🔑</Text>
              <TextInput style={S.input} placeholder="Your password"
                placeholderTextColor={C.text4} value={password} onChangeText={setPassword}
                secureTextEntry={!showPass} returnKeyType="done" onSubmitEditing={handleLogin} />
              <TouchableOpacity onPress={() => setShowPass(v => !v)} style={{ padding: 6 }}>
                <Text style={{ fontSize: 15, color: C.text4 }}>{showPass ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[S.btn, loading && { opacity: 0.7 }]} onPress={handleLogin} disabled={loading} activeOpacity={0.85}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={S.btnTxt}>Sign In</Text>}
            </TouchableOpacity>

            <Text style={S.hint}>Contact your supervisor if you need access or forgot your password.</Text>
          </View>

          <Text style={S.powered}>Powered by Maxbraynn Technology & Systems</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.brand },
  scroll: { flexGrow: 1 },
  topArea: { alignItems: 'center', paddingTop: 52, paddingBottom: 40 },
  logoBox: { width: 80, height: 80, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16, elevation: 8 },
  logoTxt: { color: C.brand, fontSize: 28, fontWeight: '900' },
  appName: { color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: -0.5, marginBottom: 4 },
  appSub: { color: 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: '500' },
  card: { backgroundColor: '#fff', borderTopLeftRadius: 32, borderTopRightRadius: 32, flex: 1, padding: 28, paddingTop: 32, minHeight: 440 },
  cardTitle: { fontSize: 26, fontWeight: '900', color: C.text, marginBottom: 6 },
  cardSub: { fontSize: 14, color: C.text3, marginBottom: 32 },
  label: { fontSize: 11, fontWeight: '700', color: C.text4, letterSpacing: 0.8, marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 14, paddingHorizontal: 14, borderWidth: 1.5, borderColor: C.border, gap: 10, marginBottom: 20 },
  inputIcon: { fontSize: 16 },
  input: { flex: 1, paddingVertical: 14, fontSize: 15, color: C.text },
  btn: { backgroundColor: C.brand, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 4, marginBottom: 20 },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  hint: { fontSize: 12, color: C.text4, textAlign: 'center', lineHeight: 18 },
  powered: { color: 'rgba(255,255,255,0.4)', fontSize: 11, textAlign: 'center', paddingVertical: 20, backgroundColor: C.brand },
});
