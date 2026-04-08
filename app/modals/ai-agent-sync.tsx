import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/stores/auth.store';
import { supabase } from '../../src/lib/supabase';
import { extractDeadlines, createTasksFromDeadlines } from '../../src/services/ai-agent.service';
import { isProUser } from '../../src/services/subscription.service';

const DEFAULT_URL = 'https://lms.latrobe.edu.au';

export default function AiAgentSyncScreen() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id ?? '');
  const webviewRef = useRef<WebView>(null);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [address, setAddress] = useState(DEFAULT_URL);
  const [currentUrl, setCurrentUrl] = useState(DEFAULT_URL);
  const [status, setStatus] = useState('Log in to LMS. We will capture the page and extract deadlines.');
  const [processing, setProcessing] = useState(false);
  const [lastHtml, setLastHtml] = useState('');
  const [proEnabled, setProEnabled] = useState(true);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [autoNavTried, setAutoNavTried] = useState(false);

  useEffect(() => {
    if (!userId) return;
    isProUser(userId)
      .then((isPro) => setProEnabled(isPro))
      .catch(() => setProEnabled(false));
  }, [userId]);

  const injectedJS = `
    (function() {
      try {
        window.ReactNativeWebView.postMessage(document.documentElement.outerHTML);
      } catch (e) {
        window.ReactNativeWebView.postMessage('');
      }
    })();
    true;
  `;

  function startLoadTimer() {
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }
    loadTimeoutRef.current = setTimeout(() => {
      setLoadTimedOut(true);
      setStatus('Page load timed out. Please retry.');
    }, 30000);
  }

  function stopLoadTimer() {
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  }

  function normalizeUrl(url: string): string {
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('/')) return `https://lms.latrobe.edu.au${url}`;
    return `https://lms.latrobe.edu.au/${url.replace(/^\/+/, '')}`;
  }

  function findAssignmentUrl(html: string): string | null {
    const hrefRegex = /href=["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = hrefRegex.exec(html)) !== null) {
      const href = match[1];
      if (
        href.includes('/mod/assign') ||
        href.includes('/calendar/view.php') ||
        href.includes('/my/')
      ) {
        return normalizeUrl(href);
      }
    }
    return null;
  }

  async function handleExtract(html: string) {
    if (!userId) return;
    stopLoadTimer();
    setLoadTimedOut(false);
    setProcessing(true);
    try {
      setStatus('AI is extracting deadlines...');
      const deadlines = await extractDeadlines(html);
      const result = await createTasksFromDeadlines(deadlines, userId);

      const { data: existing } = await supabase
        .from('lms_integrations')
        .select('id')
        .eq('user_id', userId)
        .eq('type', 'ai_agent')
        .maybeSingle();

      if (existing?.id) {
        await supabase
          .from('lms_integrations')
          .update({ lms_url: address, label: 'AI LMS' })
          .eq('id', existing.id);
      } else {
        await supabase.from('lms_integrations').insert({
          user_id: userId,
          type: 'ai_agent',
          lms_url: address,
          label: 'AI LMS',
        });
      }

      const reasonText = result.skippedReasons.length
        ? `\nReasons:\n- ${result.skippedReasons.slice(0, 3).join('\n- ')}`
        : '';
      Alert.alert(
        'Sync complete',
        `Created ${result.created}, skipped ${result.skipped}.${reasonText}`
      );
      router.back();
    } catch (err) {
      console.warn('[AiAgentSync] error:', err);
      setStatus('AI extraction failed. You can retry.');
      Alert.alert('Error', 'AI extraction failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  }

  async function handleRetry() {
    if (lastHtml) {
      await handleExtract(lastHtml);
    }
  }

  function handleReload() {
    setLoadTimedOut(false);
    setStatus('Reloading page...');
    webviewRef.current?.reload();
    startLoadTimer();
  }

  if (!proEnabled) {
    return (
      <View style={styles.container}>
        <View style={styles.navbar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.navButton} hitSlop={8}>
            <Ionicons name="close" size={20} color="#8E8E93" />
          </TouchableOpacity>
          <Text style={styles.navTitle}>AI LMS Sync</Text>
          <View style={styles.navButton} />
        </View>
        <View style={styles.lockedState}>
          <Text style={styles.lockedTitle}>Pro feature</Text>
          <Text style={styles.lockedText}>Upgrade to Pro to use AI LMS sync.</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => router.push('/modals/subscription')}
          >
            <Text style={styles.retryButtonText}>Upgrade</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.navButton} hitSlop={8}>
          <Ionicons name="close" size={20} color="#8E8E93" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>AI LMS Sync</Text>
        <View style={styles.navButton} />
      </View>

      <View style={styles.addressBar}>
        <TextInput
          style={styles.addressInput}
          value={address}
          onChangeText={setAddress}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://lms.latrobe.edu.au"
          placeholderTextColor="#636366"
        />
        <TouchableOpacity style={styles.goButton} onPress={() => setCurrentUrl(address)}>
          <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <WebView
        ref={webviewRef}
        source={{ uri: currentUrl }}
        onLoadStart={() => {
          setLoadTimedOut(false);
          startLoadTimer();
          setAutoNavTried(false);
        }}
        onLoadEnd={() => {
          stopLoadTimer();
        }}
        onNavigationStateChange={(nav) => {
          if (nav.url.includes('lms.latrobe.edu.au')) {
            webviewRef.current?.injectJavaScript(injectedJS);
          }
        }}
        onMessage={(event) => {
          if (processing) return;
          const html = event.nativeEvent.data ?? '';
          if (!html) {
            setStatus('Failed to capture page content. Please try again.');
            return;
          }
          stopLoadTimer();
          setLoadTimedOut(false);
          setLastHtml(html);
          if (!autoNavTried) {
            const nextUrl = findAssignmentUrl(html);
            if (nextUrl && nextUrl !== currentUrl) {
              setAutoNavTried(true);
              setStatus('Navigating to assignments page...');
              setCurrentUrl(nextUrl);
              return;
            }
            setAutoNavTried(true);
          }
          handleExtract(html);
        }}
      />

      <View style={styles.footer}>
        <Text style={styles.statusText}>{status}</Text>
        {processing ? <ActivityIndicator color="#FF3B30" /> : null}
        {!processing && loadTimedOut ? (
          <TouchableOpacity style={styles.retryButton} onPress={handleReload}>
            <Text style={styles.retryButtonText}>Reload Page</Text>
          </TouchableOpacity>
        ) : null}
        {!processing && !loadTimedOut && lastHtml ? (
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryButtonText}>Retry AI</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 12,
  },
  navButton: {
    minWidth: 44,
    alignItems: 'center',
  },
  navTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  addressBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  addressInput: {
    flex: 1,
    backgroundColor: '#1C1C1E',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  goButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2C2C2E',
    backgroundColor: '#0B0B0C',
    gap: 10,
  },
  statusText: {
    color: '#8E8E93',
    fontSize: 13,
  },
  retryButton: {
    backgroundColor: '#1C1C1E',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
