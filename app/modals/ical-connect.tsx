import { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import type { WebViewNavigation } from 'react-native-webview';
import {
  autoDiscoverUrl,
  validateUrl,
  addSubscription,
  syncNow,
} from '../../src/services/ical-sync.service';
import { useAuthStore } from '../../src/stores/auth.store';

const DEFAULT_MOODLE_URL = 'https://lms.latrobe.edu.au';
const LATROBE_DOMAIN = 'lms.latrobe.edu.au';

// JS injected into WebView to scan all <a> hrefs for iCal URL
const INJECT_SCAN_JS = `
(function() {
  var links = document.querySelectorAll('a[href]');
  var found = null;
  for (var i = 0; i < links.length; i++) {
    var href = links[i].getAttribute('href') || '';
    if (href.includes('/calendar/export_execute.php') &&
        href.includes('userid') &&
        href.includes('authtoken')) {
      found = href;
      break;
    }
  }
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ical_scan', url: found }));
})();
true;
`;

type Step = 'webview' | 'manual' | 'syncing' | 'done';

export default function ICalConnectScreen() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id ?? '');

  const [step, setStep] = useState<Step>('webview');
  const [moodleUrl, setMoodleUrl] = useState(DEFAULT_MOODLE_URL);
  const [editingUrl, setEditingUrl] = useState(DEFAULT_MOODLE_URL);
  const [manualUrl, setManualUrl] = useState('');
  const [syncResult, setSyncResult] = useState<{ created: number; skipped: number } | null>(null);
  const [error, setError] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);

  const webviewRef = useRef<WebView>(null);

  // ── WebView navigation state change ──────────────────────────────────────────

  function handleNavigationChange(navState: WebViewNavigation) {
    const url = navState.url ?? '';
    // Detect successful login: URL is now on lms.latrobe.edu.au
    if (!loggedIn && url.includes(LATROBE_DOMAIN) && !url.includes('sso.latrobe.edu.au')) {
      setLoggedIn(true);
      // Inject JS to scan for iCal URL
      webviewRef.current?.injectJavaScript(INJECT_SCAN_JS);
    }
  }

  // ── Handle message from WebView ───────────────────────────────────────────────

  async function handleWebViewMessage(event: { nativeEvent: { data: string } }) {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type !== 'ical_scan') return;

      if (msg.url) {
        // Found iCal URL — validate and save
        await handleFoundUrl(msg.url);
      } else {
        // Not found on current page — show hint
        Alert.alert(
          'Calendar Link Not Found',
          'Could not automatically find your calendar link. Please navigate to your Moodle Calendar page and try again, or use manual entry.',
          [
            { text: 'Keep Browsing', style: 'cancel' },
            { text: 'Enter Manually', onPress: () => setStep('manual') },
          ]
        );
      }
    } catch {
      // ignore parse errors
    }
  }

  // ── Process discovered / manual URL ──────────────────────────────────────────

  async function handleFoundUrl(url: string) {
    setStep('syncing');
    setError('');

    try {
      const isValid = await validateUrl(url);
      if (!isValid) {
        setError('Could not read calendar. Please reconnect.');
        setStep('webview');
        return;
      }

      const integration = await addSubscription(userId, url);
      const result = await syncNow(integration.id);
      setSyncResult({ created: result.created, skipped: result.skipped });
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed. Please try again.');
      setStep('webview');
    }
  }

  async function handleManualSubmit() {
    if (!manualUrl.trim()) {
      setError('Please enter a URL.');
      return;
    }
    await handleFoundUrl(manualUrl.trim());
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (step === 'done' && syncResult) {
    return (
      <View style={styles.container}>
        <View style={styles.resultCard}>
          <Text style={styles.resultIcon}>✅</Text>
          <Text style={styles.resultTitle}>Calendar Connected!</Text>
          <Text style={styles.resultBody}>
            {syncResult.created} task{syncResult.created !== 1 ? 's' : ''} imported
            {syncResult.skipped > 0 ? `, ${syncResult.skipped} skipped` : ''}.
          </Text>
          <TouchableOpacity style={styles.doneButton} onPress={() => router.back()}>
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (step === 'syncing') {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#FF3B30" size="large" />
        <Text style={styles.syncingText}>Syncing your deadlines…</Text>
      </View>
    );
  }

  if (step === 'manual') {
    return (
      <View style={styles.container}>
        <View style={styles.manualCard}>
          <Text style={styles.manualTitle}>Enter iCal URL</Text>
          <Text style={styles.manualSubtitle}>
            Paste your Moodle calendar subscription URL below.
          </Text>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <TextInput
            style={styles.manualInput}
            placeholder="https://lms.latrobe.edu.au/calendar/export_execute.php?..."
            placeholderTextColor="#636366"
            value={manualUrl}
            onChangeText={setManualUrl}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
          />
          <TouchableOpacity style={styles.primaryButton} onPress={handleManualSubmit}>
            <Text style={styles.primaryButtonText}>Connect</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => { setStep('webview'); setError(''); }}
          >
            <Text style={styles.secondaryButtonText}>Back to Browser</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Default: WebView step
  return (
    <View style={styles.container}>
      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Connect Calendar</Text>
        <TouchableOpacity onPress={() => setStep('manual')} hitSlop={8}>
          <Text style={styles.manualText}>Manual</Text>
        </TouchableOpacity>
      </View>

      {/* ── URL bar ── */}
      <View style={styles.urlBar}>
        <TextInput
          style={styles.urlInput}
          value={editingUrl}
          onChangeText={setEditingUrl}
          onSubmitEditing={() => setMoodleUrl(editingUrl)}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          placeholder="Enter Moodle URL"
          placeholderTextColor="#636366"
        />
      </View>

      {/* ── Hint ── */}
      {loggedIn ? (
        <View style={styles.hint}>
          <Text style={styles.hintText}>
            Logged in ✓ — Navigate to your Moodle Calendar to auto-detect your subscription link.
          </Text>
        </View>
      ) : (
        <View style={styles.hint}>
          <Text style={styles.hintText}>Sign in with your La Trobe student account.</Text>
        </View>
      )}

      {/* ── WebView ── */}
      <WebView
        ref={webviewRef}
        source={{ uri: moodleUrl }}
        style={styles.webview}
        onNavigationStateChange={handleNavigationChange}
        onMessage={handleWebViewMessage}
        javaScriptEnabled
        domStorageEnabled
        userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 12,
    backgroundColor: '#1C1C1E',
    zIndex: 10,
  },
  cancelText: { color: '#FF3B30', fontSize: 16 },
  topBarTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  manualText: { color: '#FF9500', fontSize: 16 },
  urlBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 100 : 60,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#2C2C2E',
    zIndex: 10,
  },
  urlInput: {
    backgroundColor: '#3A3A3C',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#FFFFFF',
    fontSize: 13,
  },
  hint: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 16,
    paddingVertical: 10,
    zIndex: 10,
  },
  hintText: { color: '#8E8E93', fontSize: 13, textAlign: 'center' },
  webview: {
    flex: 1,
    width: '100%',
    marginTop: Platform.OS === 'ios' ? 140 : 100,
    marginBottom: 44,
  },
  resultCard: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  resultIcon: { fontSize: 48, marginBottom: 16 },
  resultTitle: { fontSize: 22, fontWeight: '700', color: '#FFFFFF', marginBottom: 8 },
  resultBody: { fontSize: 15, color: '#8E8E93', textAlign: 'center', marginBottom: 32 },
  doneButton: {
    backgroundColor: '#FF3B30',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 48,
  },
  doneButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  syncingText: { color: '#8E8E93', fontSize: 15, marginTop: 16 },
  manualCard: { width: '100%', paddingHorizontal: 24 },
  manualTitle: { fontSize: 22, fontWeight: '700', color: '#FFFFFF', marginBottom: 8 },
  manualSubtitle: { fontSize: 14, color: '#8E8E93', marginBottom: 16 },
  manualInput: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 13,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#3A3A3C',
    marginBottom: 16,
    minHeight: 80,
  },
  primaryButton: {
    backgroundColor: '#FF3B30',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  secondaryButton: {
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
  secondaryButtonText: { color: '#8E8E93', fontSize: 15 },
  errorText: { color: '#FF3B30', fontSize: 13, marginBottom: 12 },
});
