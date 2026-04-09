import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert, ScrollView,
} from 'react-native';
import { supabase } from '../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleLogin = async () => {
    const u = username.trim().toLowerCase();
    const p = password.trim();
    if (!u) { Alert.alert('Error', 'Enter your username'); return; }
    if (!p) { Alert.alert('Error', 'Enter your password'); return; }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('collectors')
        .select('*')
        .eq('username', u)
        .eq('password', p)
        .eq('status', 'active')
        .single();

      if (error || !data) {
        Alert.alert('Login Failed', 'Invalid username or password.\nContact your supervisor if you need help.');
        setLoading(false);
        return;
      }

      await AsyncStorage.setItem('collector_session', JSON.stringify(data));
      onLogin(data);
    } catch (e) {
      Alert.alert('Error', e.message || 'Something went wrong');
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo */}
        <View style={styles.logoBox}>
          <Text style={styles.logoLetter}>M</Text>
        </View>
        <Text style={styles.appName}>Majupat Love Enterprise</Text>
        <Text style={styles.appSub}>Collector Portal</Text>
        <Text style={styles.devBy}>Maxbraynn Technology & Systems</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign In</Text>
          <Text style={styles.cardSub}>Enter your username and password</Text>

          {/* Username */}
          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. ama.boateng"
            placeholderTextColor="#475569"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />

          {/* Password */}
          <Text style={styles.label}>Password</Text>
          <View style={styles.passRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              placeholder="Your password"
              placeholderTextColor="#475569"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity
              onPress={() => setShowPass(p => !p)}
              style={styles.eyeBtn}
            >
              <Text style={styles.eyeText}>{showPass ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Sign In</Text>}
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>
          Contact your supervisor if you need access or forgot your password.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#581c87' },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  logoBox: {
    width: 72, height: 72, borderRadius: 18,
    backgroundColor: '#a855f7',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#a855f7', shadowOpacity: 0.5, shadowRadius: 20, elevation: 8,
  },
  logoLetter: { color: '#fff', fontSize: 36, fontWeight: '900' },
  appName: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 4 },
  appSub: { color: '#c084fc', fontSize: 14, fontWeight: '700', marginBottom: 4 },
  devBy: { color: '#9333ea', fontSize: 11, marginBottom: 36 },
  card: {
    width: '100%', backgroundColor: '#6b21a8',
    borderRadius: 16, padding: 24,
    borderWidth: 1, borderColor: '#7c3aed',
    marginBottom: 20,
  },
  cardTitle: { color: '#faf5ff', fontSize: 20, fontWeight: '800', marginBottom: 4 },
  cardSub: { color: '#c084fc', fontSize: 13, marginBottom: 24 },
  label: {
    color: '#e9d5ff', fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
  },
  input: {
    backgroundColor: '#581c87', borderWidth: 1, borderColor: '#7c3aed',
    borderRadius: 10, padding: 14, color: '#faf5ff', fontSize: 16,
    marginBottom: 20,
  },
  passRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 24, gap: 8,
  },
  eyeBtn: {
    padding: 14, backgroundColor: '#581c87',
    borderWidth: 1, borderColor: '#7c3aed', borderRadius: 10,
  },
  eyeText: { fontSize: 16 },
  btn: {
    backgroundColor: '#a855f7', borderRadius: 10,
    padding: 16, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hint: { color: '#9333ea', fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
