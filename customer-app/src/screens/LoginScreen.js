
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert, ScrollView,
} from 'react-native';
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
      const { data, error } = await supabase
        .from('customers')
        .select('*, accounts(id, account_number, type, balance, status, interest_rate, opened_at)')
        .eq('app_username', u).eq('app_password', p).single();
      if (error || !data) {
        Alert.alert('Login Failed', 'Invalid username or password.\nContact your branch if you need help.');
        setLoading(false); return;
      }
      await AsyncStorage.setItem('customer_session', JSON.stringify(data));
      onLogin(data);
    } catch (e) { Alert.alert('Error', e.message); }
    setLoading(false);
  };

  return (
    <SafeAreaView style={S.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={S.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Brand */}
          <View style={S.brand}>
            <View style={S.logoRing}>
              <View style={S.logo}><Text style={S.logoTxt}>M</Text></View>
            </View>
            <Text style={S.appName}>Majupat Love Enterprise</Text>
            <Text style={S.appSub}>Customer Banking Portal</Text>
          </View>

          {/* Card */}
          <View style={S.card}>
            <Text style={S.cardTitle}>Welcome back</Text>
            <Text style={S.cardSub}>Sign in to access your accounts</Text>

            <Text style={S.label}>Username</Text>
            <View style={S.inputWrap}>
              <Text style={S.inputIcon}>👤</Text>
              <TextInput style={S.input} placeholder="Enter your username"
                placeholderTextColor="#475569" value={username} onChangeText={setUsername}
                autoCapitalize="none" autoCorrect={false} returnKeyType="next" />
            </View>

            <Text style={S.label}>Password</Text>
            <View style={S.inputWrap}>
              <Text style={S.inputIcon}>🔒</Text>
              <TextInput style={S.input} placeholder="Enter your password"
                placeholderTextColor="#475569" value={password} onChangeText={setPassword}
                secureTextEntry={!showPass} returnKeyType="done" onSubmitEditing={handleLogin} />
              <TouchableOpacity onPress={() => setShowPass(p => !p)} style={S.eyeBtn}>
                <Text style={{ fontSize: 16 }}>{showPass ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[S.btn, loading && { opacity: 0.7 }]} onPress={handleLogin} disabled={loading} activeOpacity={0.85}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={S.btnTxt}>Sign In  →</Text>}
            </TouchableOpacity>
          </View>

          <Text style={S.hint}>Forgot your password? Contact your branch for assistance.</Text>
          <Text style={S.powered}>Powered by Maxbraynn Technology & Systems</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.navyMid },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 },
  brand: { alignItems: 'center', marginBottom: 36 },
  logoRing: { width: 112, height: 112, borderRadius: 32, borderWidth: 1.5, borderColor: 'rgba(26,86,219,0.4)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  logo: { width: 88, height: 88, borderRadius: 26, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', shadowColor: C.brand, shadowOpacity: 0.5, shadowRadius: 20, elevation: 12 },
  logoTxt: { color: '#fff', fontSize: 44, fontWeight: '900' },
  appName: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 6, letterSpacing: -0.3 },
  appSub: { color: '#475569', fontSize: 13, fontWeight: '500' },
  card: { width: '100%', backgroundColor: '#111827', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#1e293b', marginBottom: 20 },
  cardTitle: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 6 },
  cardSub: { color: '#475569', fontSize: 13, marginBottom: 28 },
  label: { color: '#64748b', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#1e293b', borderRadius: 12, paddingHorizontal: 14, marginBottom: 20, gap: 10 },
  inputIcon: { fontSize: 16 },
  input: { flex: 1, paddingVertical: 14, fontSize: 15, color: '#f1f5f9' },
  eyeBtn: { padding: 6 },
  btn: { backgroundColor: C.brand, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 4, shadowColor: C.brand, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6 },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  hint: { color: '#334155', fontSize: 12, textAlign: 'center', lineHeight: 18, marginBottom: 12 },
  powered: { color: '#1e293b', fontSize: 11, textAlign: 'center' },
});
