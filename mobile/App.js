import { StatusBar } from 'expo-status-bar';
import { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Alert,
  SafeAreaView,
  Image,
  ActivityIndicator,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import CookieManager from '@react-native-cookies/cookies';

// Splash Screen Component
function SplashScreen() {
  return (
    <View style={splashStyles.container}>
      <StatusBar style="dark" />
      <Image
        source={require('./assets/icon.png')}
        style={splashStyles.logo}
        resizeMode="contain"
      />
      <Text style={splashStyles.appName}>UniTrack</Text>
      <Text style={splashStyles.tagline}>University Attendance Tracker</Text>
    </View>
  );
}

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 150,
    height: 150,
    marginBottom: 30,
  },
  appName: {
    fontSize: 42,
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '500',
  },
});

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // WebView login modal
  const [showLoginWebView, setShowLoginWebView] = useState(false);
  const webViewRef = useRef(null);

  // ERP Configuration
  const [erpUrl, setErpUrl] = useState('');
  const [attendanceEndpoint, setAttendanceEndpoint] = useState('/stu_getSubjectOnChangeWithSemId1.json');

  // Student & attendance data
  const [studentInfo, setStudentInfo] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [lastFetched, setLastFetched] = useState(null);

  // Threshold settings
  const [defaultThreshold, setDefaultThreshold] = useState('75');
  const [safeBuffer, setSafeBuffer] = useState('10');
  const [customThresholds, setCustomThresholds] = useState([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [newThreshold, setNewThreshold] = useState('');

  // Load saved data on start
  useEffect(() => {
    loadSavedData();
    const timer = setTimeout(() => setShowSplash(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  const loadSavedData = async () => {
    try {
      const savedErpUrl = await AsyncStorage.getItem('erpUrl');
      const savedEndpoint = await AsyncStorage.getItem('attendanceEndpoint');
      const savedSubjects = await AsyncStorage.getItem('subjects');
      const savedStudentInfo = await AsyncStorage.getItem('studentInfo');
      const savedThreshold = await AsyncStorage.getItem('defaultThreshold');
      const savedConnected = await AsyncStorage.getItem('isConnected');
      const savedLastFetched = await AsyncStorage.getItem('lastFetched');

      if (savedErpUrl) setErpUrl(savedErpUrl);
      if (savedEndpoint) setAttendanceEndpoint(savedEndpoint);
      if (savedThreshold) setDefaultThreshold(savedThreshold);
      if (savedLastFetched) setLastFetched(savedLastFetched);

      if (savedSubjects) {
        setSubjects(JSON.parse(savedSubjects));
      }
      if (savedStudentInfo) {
        setStudentInfo(JSON.parse(savedStudentInfo));
      }
      if (savedConnected === 'true' && savedSubjects) {
        setIsConnected(true);
      }
    } catch (e) {
      console.log('Error loading saved data:', e);
    }
  };

  const saveData = async (subjectsData, studentData) => {
    try {
      await AsyncStorage.setItem('erpUrl', erpUrl);
      await AsyncStorage.setItem('attendanceEndpoint', attendanceEndpoint);
      await AsyncStorage.setItem('subjects', JSON.stringify(subjectsData));
      await AsyncStorage.setItem('studentInfo', JSON.stringify(studentData));
      await AsyncStorage.setItem('defaultThreshold', defaultThreshold);
      await AsyncStorage.setItem('isConnected', 'true');
      await AsyncStorage.setItem('lastFetched', new Date().toISOString());
    } catch (e) {
      console.log('Error saving data:', e);
    }
  };

  // Open WebView for login
  const openLoginWebView = () => {
    if (!erpUrl) {
      Alert.alert('Error', 'Please enter your ERP URL first');
      return;
    }

    // Ensure URL has protocol
    let url = erpUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
      setErpUrl(url);
    }

    setShowLoginWebView(true);
  };

  // Detect successful login in WebView
  const handleWebViewNavigationChange = (navState) => {
    const url = navState.url;
    console.log('WebView URL:', url);

    // Check if redirected away from login page (successful login)
    // Common patterns: redirected to dashboard, home, index, or student page
    const loginPatterns = ['login', 'signin', 'auth', 'j_spring_security'];
    const isOnLoginPage = loginPatterns.some(pattern => url.toLowerCase().includes(pattern));

    // If we were on login and now we're not, login succeeded
    if (!isOnLoginPage && !url.includes('error') && !url.includes('failed')) {
      // Give it a moment then try to fetch attendance
      setTimeout(() => {
        fetchAttendanceAfterLogin();
      }, 2000);
    }
  };

  // Fetch attendance after WebView login
  const fetchAttendanceAfterLogin = async () => {
    setLoading(true);

    try {
      // Get cookies from the WebView session
      const cookies = await CookieManager.get(erpUrl);
      console.log('Cookies:', cookies);

      // Build cookie string for fetch
      const cookieString = Object.entries(cookies)
        .map(([name, cookie]) => `${name}=${cookie.value}`)
        .join('; ');

      // Try to fetch attendance data
      const attendanceUrl = `${erpUrl}${attendanceEndpoint}`;
      console.log('Fetching:', attendanceUrl);

      const response = await fetch(attendanceUrl, {
        method: 'GET',
        headers: {
          'Cookie': cookieString,
          'Accept': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const rawData = await response.json();

      if (Array.isArray(rawData) && rawData.length > 0) {
        processAttendanceData(rawData);
        setShowLoginWebView(false);
        Alert.alert('Success', 'Connected to ERP! Your attendance has been fetched.');
      } else {
        // Maybe we need to navigate to attendance page first
        Alert.alert(
          'Almost there!',
          'Please navigate to your attendance page in the browser, then tap "Fetch Data" button.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.log('Fetch error:', error);
      // Don't show error - user might still be navigating
    } finally {
      setLoading(false);
    }
  };

  // Manual fetch button in WebView
  const manualFetchFromWebView = async () => {
    setLoading(true);

    try {
      const cookies = await CookieManager.get(erpUrl);
      const cookieString = Object.entries(cookies)
        .map(([name, cookie]) => `${name}=${cookie.value}`)
        .join('; ');

      const attendanceUrl = `${erpUrl}${attendanceEndpoint}`;

      const response = await fetch(attendanceUrl, {
        method: 'GET',
        headers: {
          'Cookie': cookieString,
          'Accept': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const rawData = await response.json();

      if (Array.isArray(rawData) && rawData.length > 0) {
        processAttendanceData(rawData);
        setShowLoginWebView(false);
        Alert.alert('Success', `Fetched ${rawData.length} subjects!`);
      } else {
        Alert.alert('No Data', 'Could not find attendance data. Make sure you\'re logged in and try navigating to your attendance page first.');
      }
    } catch (error) {
      console.log('Fetch error:', error);
      Alert.alert('Error', `Failed to fetch data: ${error.message}\n\nMake sure you're logged in and the attendance endpoint is correct.`);
    } finally {
      setLoading(false);
    }
  };

  const processAttendanceData = (rawData) => {
    // Process attendance data
    const processedSubjects = rawData.map(item => {
      const present = parseInt(item.presentCount) || 0;
      const absent = parseInt(item.absentCount) || 0;
      const total = present + absent;
      const percentage = total > 0 ? (present / total * 100) : 0;

      return {
        subject: item.subject || item.subjectName || 'Unknown',
        subject_code: item.subjectCode || '',
        present,
        absent,
        total,
        percentage: Math.round(percentage * 100) / 100,
        faculty: (item.facultName || item.facultyName || '').trim(),
      };
    });

    // Extract student info
    const studentData = {
      name: rawData[0]?.studentName || rawData[0]?.name || 'Student',
      rollNumber: rawData[0]?.rollNumber || rawData[0]?.regNo || '',
      branch: rawData[0]?.branchName || rawData[0]?.branch || '',
      section: rawData[0]?.sectionName || rawData[0]?.section || '',
      institution: rawData[0]?.institutionName || 'Your Institution',
    };

    setSubjects(processedSubjects);
    setStudentInfo(studentData);
    setLastFetched(new Date().toISOString());
    setIsConnected(true);

    // Save for offline access
    saveData(processedSubjects, studentData);
  };

  // Refresh attendance (uses saved session)
  const refreshAttendance = async () => {
    setRefreshing(true);

    try {
      const cookies = await CookieManager.get(erpUrl);
      const cookieString = Object.entries(cookies)
        .map(([name, cookie]) => `${name}=${cookie.value}`)
        .join('; ');

      const attendanceUrl = `${erpUrl}${attendanceEndpoint}`;

      const response = await fetch(attendanceUrl, {
        method: 'GET',
        headers: {
          'Cookie': cookieString,
          'Accept': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Session expired');
      }

      const rawData = await response.json();

      if (Array.isArray(rawData) && rawData.length > 0) {
        processAttendanceData(rawData);
      } else {
        throw new Error('No data received');
      }
    } catch (error) {
      console.log('Refresh error:', error);
      Alert.alert(
        'Session Expired',
        'Your login session has expired. Please login again.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Login', onPress: () => setShowLoginWebView(true) },
        ]
      );
    } finally {
      setRefreshing(false);
    }
  };

  const logout = async () => {
    await AsyncStorage.clear();
    await CookieManager.clearAll();
    setIsConnected(false);
    setSubjects([]);
    setStudentInfo(null);
    setErpUrl('');
    setShowSettings(false);
  };

  // Calculate threshold for a subject
  const getThresholdForSubject = (subjectCode, subjectName) => {
    const code = (subjectCode || '').toUpperCase();
    const name = (subjectName || '').toUpperCase();

    for (const custom of customThresholds) {
      if (code.includes(custom.keyword.toUpperCase()) ||
          name.includes(custom.keyword.toUpperCase())) {
        return parseFloat(custom.threshold);
      }
    }
    return parseFloat(defaultThreshold);
  };

  // Calculate status based on threshold
  const getStatus = (percentage, threshold) => {
    const buffer = parseFloat(safeBuffer);
    if (percentage >= threshold + buffer) return 'SAFE';
    if (percentage >= threshold) return 'CRITICAL';
    return 'LOW';
  };

  const getClassesNeeded = (present, total, threshold) => {
    const thresholdDecimal = threshold / 100;
    const current = total > 0 ? present / total : 0;
    if (current >= thresholdDecimal) return 0;
    const numerator = thresholdDecimal * total - present;
    const denominator = 1 - thresholdDecimal;
    if (denominator === 0) return 0;
    return Math.ceil(numerator / denominator);
  };

  const getClassesCanMiss = (present, total, threshold) => {
    const thresholdDecimal = threshold / 100;
    const current = total > 0 ? present / total : 0;
    if (current < thresholdDecimal) return 0;
    const numerator = present - thresholdDecimal * total;
    if (thresholdDecimal === 0) return 0;
    return Math.floor(numerator / thresholdDecimal);
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'SAFE': return { bg: '#dcfce7', text: '#16a34a' };
      case 'CRITICAL': return { bg: '#fef9c3', text: '#ca8a04' };
      case 'LOW': return { bg: '#fee2e2', text: '#dc2626' };
      default: return { bg: '#f3f4f6', text: '#6b7280' };
    }
  };

  const getBarColor = (status) => {
    switch (status) {
      case 'SAFE': return '#22c55e';
      case 'CRITICAL': return '#eab308';
      case 'LOW': return '#ef4444';
      default: return '#9ca3af';
    }
  };

  const addCustomThreshold = () => {
    if (newKeyword && newThreshold) {
      setCustomThresholds([...customThresholds, { keyword: newKeyword, threshold: newThreshold }]);
      setNewKeyword('');
      setNewThreshold('');
    }
  };

  const removeCustomThreshold = (index) => {
    setCustomThresholds(customThresholds.filter((_, i) => i !== index));
  };

  // Show splash screen
  if (showSplash) {
    return <SplashScreen />;
  }

  // WebView Login Modal
  const LoginWebViewModal = () => (
    <Modal
      visible={showLoginWebView}
      animationType="slide"
      onRequestClose={() => setShowLoginWebView(false)}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: '#2563eb' }}>
        <View style={styles.webViewHeader}>
          <TouchableOpacity onPress={() => setShowLoginWebView(false)}>
            <Text style={styles.webViewClose}>Close</Text>
          </TouchableOpacity>
          <Text style={styles.webViewTitle}>Login to ERP</Text>
          <TouchableOpacity onPress={manualFetchFromWebView} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.webViewFetch}>Fetch Data</Text>
            )}
          </TouchableOpacity>
        </View>

        <WebView
          ref={webViewRef}
          source={{ uri: erpUrl }}
          style={{ flex: 1 }}
          onNavigationStateChange={handleWebViewNavigationChange}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
          startInLoadingState={true}
          renderLoading={() => (
            <View style={styles.webViewLoading}>
              <ActivityIndicator size="large" color="#2563eb" />
              <Text style={{ marginTop: 10, color: '#6b7280' }}>Loading ERP...</Text>
            </View>
          )}
        />

        <View style={styles.webViewFooter}>
          <Text style={styles.webViewHint}>
            Login normally, then tap "Fetch Data" to get your attendance
          </Text>
        </View>
      </SafeAreaView>
    </Modal>
  );

  // Settings Screen
  if (showSettings) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <ScrollView style={styles.settingsScroll}>
          <View style={styles.settingsContainer}>
            <Text style={styles.settingsTitle}>Settings</Text>

            {/* ERP Settings */}
            <Text style={styles.sectionHeader}>ERP Connection</Text>
            <Text style={styles.settingsLabel}>ERP URL:</Text>
            <TextInput
              style={styles.input}
              value={erpUrl}
              onChangeText={setErpUrl}
              placeholder="https://erp.university.edu"
              autoCapitalize="none"
            />

            <Text style={styles.settingsLabel}>Attendance API Endpoint:</Text>
            <TextInput
              style={styles.input}
              value={attendanceEndpoint}
              onChangeText={setAttendanceEndpoint}
              placeholder="/attendance.json"
              autoCapitalize="none"
            />
            <Text style={styles.settingsHint}>
              The JSON endpoint that returns attendance data
            </Text>

            <TouchableOpacity
              style={styles.reconnectButton}
              onPress={() => {
                setShowSettings(false);
                setShowLoginWebView(true);
              }}
            >
              <Text style={styles.reconnectButtonText}>Re-login to ERP</Text>
            </TouchableOpacity>

            {/* Threshold Settings */}
            <Text style={styles.sectionHeader}>Attendance Thresholds</Text>

            <Text style={styles.settingsLabel}>Default Minimum %:</Text>
            <View style={styles.thresholdRow}>
              {['65', '70', '75', '80'].map((val) => (
                <TouchableOpacity
                  key={val}
                  style={[
                    styles.thresholdChip,
                    defaultThreshold === val && styles.thresholdChipActive
                  ]}
                  onPress={() => setDefaultThreshold(val)}
                >
                  <Text style={[
                    styles.thresholdChipText,
                    defaultThreshold === val && styles.thresholdChipTextActive
                  ]}>{val}%</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.settingsLabel}>Safe Buffer:</Text>
            <View style={styles.thresholdRow}>
              {['5', '10', '15'].map((val) => (
                <TouchableOpacity
                  key={val}
                  style={[
                    styles.thresholdChip,
                    safeBuffer === val && styles.thresholdChipActive
                  ]}
                  onPress={() => setSafeBuffer(val)}
                >
                  <Text style={[
                    styles.thresholdChipText,
                    safeBuffer === val && styles.thresholdChipTextActive
                  ]}>+{val}%</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Custom Subject Thresholds */}
            <Text style={styles.sectionHeader}>Custom Subject Rules</Text>
            <Text style={styles.settingsHint}>
              Set different thresholds for specific subjects
            </Text>

            {customThresholds.map((item, index) => (
              <View key={index} style={styles.customThresholdItem}>
                <Text style={styles.customThresholdText}>
                  "{item.keyword}" → {item.threshold}%
                </Text>
                <TouchableOpacity onPress={() => removeCustomThreshold(index)}>
                  <Text style={styles.removeButton}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}

            <View style={styles.addCustomRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginRight: 8 }]}
                value={newKeyword}
                onChangeText={setNewKeyword}
                placeholder="Keyword"
              />
              <TextInput
                style={[styles.input, { width: 70, marginRight: 8 }]}
                value={newThreshold}
                onChangeText={setNewThreshold}
                placeholder="%"
                keyboardType="numeric"
              />
              <TouchableOpacity style={styles.addButton} onPress={addCustomThreshold}>
                <Text style={styles.addButtonText}>Add</Text>
              </TouchableOpacity>
            </View>

            {/* Save Button */}
            <TouchableOpacity
              style={styles.saveButton}
              onPress={() => setShowSettings(false)}
            >
              <Text style={styles.saveButtonText}>Done</Text>
            </TouchableOpacity>

            {/* Logout Button */}
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={() => {
                Alert.alert('Disconnect', 'This will clear all saved data. Continue?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Disconnect', style: 'destructive', onPress: logout },
                ]);
              }}
            >
              <Text style={styles.logoutButtonText}>Disconnect & Clear Data</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Setup Screen (First Time)
  if (!isConnected) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <LoginWebViewModal />

        <ScrollView contentContainerStyle={styles.setupScrollContent}>
          <View style={styles.setupContainer}>
            <Image
              source={require('./assets/icon.png')}
              style={styles.setupLogo}
              resizeMode="contain"
            />
            <Text style={styles.setupTitle}>UniTrack</Text>
            <Text style={styles.setupSubtitle}>University Attendance Tracker</Text>

            <View style={styles.setupForm}>
              <Text style={styles.setupLabel}>Enter your ERP URL</Text>
              <TextInput
                style={styles.setupInput}
                value={erpUrl}
                onChangeText={setErpUrl}
                placeholder="https://erp.university.edu"
                placeholderTextColor="#999"
                autoCapitalize="none"
                keyboardType="url"
              />

              <Text style={styles.setupHint}>
                This is the website where you check your attendance
              </Text>

              <TouchableOpacity
                style={[styles.connectButton, !erpUrl && styles.connectButtonDisabled]}
                onPress={openLoginWebView}
                disabled={!erpUrl}
              >
                <Text style={styles.connectButtonText}>Connect to ERP</Text>
              </TouchableOpacity>

              <Text style={styles.setupNote}>
                You'll login once through your ERP website.{'\n'}
                After that, just pull to refresh - no re-login needed!
              </Text>
            </View>

            {/* Advanced Settings */}
            <TouchableOpacity
              style={styles.advancedToggle}
              onPress={() => {
                Alert.alert(
                  'API Endpoint',
                  'Enter the JSON endpoint path that returns attendance data (e.g., /api/attendance.json)',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Set',
                      onPress: () => {
                        Alert.prompt?.(
                          'API Endpoint',
                          'Enter endpoint path:',
                          setAttendanceEndpoint,
                          'plain-text',
                          attendanceEndpoint
                        );
                      }
                    }
                  ]
                );
              }}
            >
              <Text style={styles.advancedToggleText}>Advanced Settings</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Process subjects with custom thresholds
  const processedSubjects = subjects.map(subject => {
    const threshold = getThresholdForSubject(subject.subject_code, subject.subject);
    const status = getStatus(subject.percentage, threshold);
    const classesNeeded = getClassesNeeded(subject.present, subject.total, threshold);
    const classesCanMiss = getClassesCanMiss(subject.present, subject.total, threshold);

    return {
      ...subject,
      threshold,
      status,
      classes_needed: classesNeeded,
      classes_can_miss: classesCanMiss,
    };
  });

  // Calculate summary
  const summary = {
    safe_count: processedSubjects.filter(s => s.status === 'SAFE').length,
    critical_count: processedSubjects.filter(s => s.status === 'CRITICAL').length,
    low_count: processedSubjects.filter(s => s.status === 'LOW').length,
    overall_present: processedSubjects.reduce((sum, s) => sum + s.present, 0),
    overall_total: processedSubjects.reduce((sum, s) => sum + s.total, 0),
  };
  summary.overall_percentage = summary.overall_total > 0
    ? ((summary.overall_present / summary.overall_total) * 100).toFixed(2)
    : 0;

  // Dashboard
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <LoginWebViewModal />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{studentInfo?.institution || 'UniTrack'}</Text>
          <Text style={styles.headerSubtitle}>{studentInfo?.name} {studentInfo?.rollNumber ? `(${studentInfo.rollNumber})` : ''}</Text>
          {studentInfo?.branch && (
            <Text style={styles.headerInfo}>{studentInfo.branch} {studentInfo?.section ? `| Section ${studentInfo.section}` : ''}</Text>
          )}
        </View>
        <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.settingsButton}>
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshAttendance} />
        }
      >
        {/* Threshold Info */}
        <View style={styles.thresholdInfo}>
          <Text style={styles.thresholdInfoText}>
            Min: {defaultThreshold}% | Safe: {parseInt(defaultThreshold) + parseInt(safeBuffer)}%+
          </Text>
        </View>

        {/* Summary Cards */}
        <View style={styles.summaryContainer}>
          <View style={[styles.summaryCard, styles.summaryMain]}>
            <Text style={styles.summaryValue}>{summary.overall_percentage}%</Text>
            <Text style={styles.summaryLabel}>Overall</Text>
            <Text style={styles.summarySmall}>{summary.overall_present}/{summary.overall_total}</Text>
          </View>

          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, styles.summarySmallCard]}>
              <Text style={[styles.summaryValue, { color: '#22c55e' }]}>{summary.safe_count}</Text>
              <Text style={styles.summaryLabel}>Safe</Text>
            </View>
            <View style={[styles.summaryCard, styles.summarySmallCard]}>
              <Text style={[styles.summaryValue, { color: '#eab308' }]}>{summary.critical_count}</Text>
              <Text style={styles.summaryLabel}>Critical</Text>
            </View>
            <View style={[styles.summaryCard, styles.summarySmallCard]}>
              <Text style={[styles.summaryValue, { color: '#ef4444' }]}>{summary.low_count}</Text>
              <Text style={styles.summaryLabel}>Low</Text>
            </View>
          </View>
        </View>

        {/* Subject List */}
        <Text style={styles.sectionTitle}>Subjects ({processedSubjects.length})</Text>

        {processedSubjects.map((subject, idx) => {
          const statusStyle = getStatusStyle(subject.status);
          const hasCustomThreshold = subject.threshold !== parseFloat(defaultThreshold);

          return (
            <View key={idx} style={styles.subjectCard}>
              <View style={styles.subjectHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.subjectName} numberOfLines={1}>{subject.subject}</Text>
                  <View style={styles.subjectCodeRow}>
                    <Text style={styles.subjectCode}>{subject.subject_code}</Text>
                    {hasCustomThreshold && (
                      <View style={styles.customBadge}>
                        <Text style={styles.customBadgeText}>{subject.threshold}%</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                  <Text style={[styles.statusText, { color: statusStyle.text }]}>{subject.status}</Text>
                </View>
              </View>

              {/* Progress Bar */}
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.min(subject.percentage, 100)}%`,
                        backgroundColor: getBarColor(subject.status),
                      },
                    ]}
                  />
                </View>
                <Text style={styles.percentageText}>{subject.percentage}%</Text>
              </View>

              {/* Stats */}
              <View style={styles.subjectStats}>
                <Text style={styles.statText}>
                  Attended: <Text style={styles.statValue}>{subject.present}/{subject.total}</Text>
                </Text>
                <Text style={styles.actionText}>
                  {subject.status === 'LOW' ? (
                    <Text style={{ color: '#ef4444' }}>Need {subject.classes_needed} classes</Text>
                  ) : subject.classes_can_miss > 0 ? (
                    <Text style={{ color: '#22c55e' }}>Can miss {subject.classes_can_miss}</Text>
                  ) : (
                    <Text style={{ color: '#eab308' }}>Attend all</Text>
                  )}
                </Text>
              </View>
            </View>
          );
        })}

        {/* Footer */}
        <Text style={styles.footer}>
          Last updated: {lastFetched ? new Date(lastFetched).toLocaleString() : 'Never'}
        </Text>
        <Text style={styles.footerHint}>Pull down to refresh</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  header: {
    backgroundColor: '#2563eb',
    padding: 20,
    paddingTop: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#bfdbfe',
    marginTop: 4,
  },
  headerInfo: {
    fontSize: 13,
    color: '#93c5fd',
    marginTop: 2,
  },
  settingsButton: {
    padding: 8,
  },
  settingsIcon: {
    fontSize: 24,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  thresholdInfo: {
    backgroundColor: '#dbeafe',
    padding: 8,
    borderRadius: 8,
    marginBottom: 16,
  },
  thresholdInfoText: {
    color: '#1e40af',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '500',
  },
  summaryContainer: {
    marginBottom: 20,
  },
  summaryMain: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  summarySmallCard: {
    flex: 1,
    padding: 16,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  summarySmall: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  subjectCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  subjectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  subjectName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  subjectCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  subjectCode: {
    fontSize: 13,
    color: '#6b7280',
  },
  customBadge: {
    backgroundColor: '#f3e8ff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
  },
  customBadgeText: {
    fontSize: 11,
    color: '#7c3aed',
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  percentageText: {
    marginLeft: 12,
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    width: 50,
    textAlign: 'right',
  },
  subjectStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statText: {
    fontSize: 13,
    color: '#6b7280',
  },
  statValue: {
    fontWeight: '600',
    color: '#374151',
  },
  actionText: {
    fontSize: 13,
    fontWeight: '500',
  },
  footer: {
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  footerHint: {
    textAlign: 'center',
    color: '#d1d5db',
    fontSize: 12,
    marginBottom: 20,
  },
  // Settings styles
  settingsScroll: {
    flex: 1,
  },
  settingsContainer: {
    padding: 24,
    paddingTop: 60,
  },
  settingsTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 20,
    marginBottom: 12,
  },
  settingsLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  settingsHint: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  thresholdRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  thresholdChip: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginRight: 8,
  },
  thresholdChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  thresholdChipText: {
    color: '#374151',
    fontWeight: '500',
  },
  thresholdChipTextActive: {
    color: '#fff',
  },
  customThresholdItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f3e8ff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  customThresholdText: {
    color: '#7c3aed',
    fontWeight: '500',
  },
  removeButton: {
    color: '#ef4444',
    fontSize: 18,
    fontWeight: 'bold',
  },
  addCustomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  addButton: {
    backgroundColor: '#22c55e',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#2563eb',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  reconnectButton: {
    backgroundColor: '#dbeafe',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  reconnectButtonText: {
    color: '#2563eb',
    fontSize: 15,
    fontWeight: '600',
  },
  logoutButton: {
    backgroundColor: '#fee2e2',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 40,
  },
  logoutButtonText: {
    color: '#dc2626',
    fontSize: 16,
    fontWeight: '600',
  },
  // Setup Screen styles
  setupScrollContent: {
    flexGrow: 1,
  },
  setupContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    paddingTop: 60,
  },
  setupLogo: {
    width: 100,
    height: 100,
    marginBottom: 16,
  },
  setupTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: 4,
  },
  setupSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 30,
  },
  setupForm: {
    width: '100%',
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  setupLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  setupInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    marginBottom: 8,
    color: '#1f2937',
  },
  setupHint: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 20,
  },
  connectButton: {
    backgroundColor: '#2563eb',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  connectButtonDisabled: {
    backgroundColor: '#93c5fd',
  },
  connectButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  setupNote: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
  advancedToggle: {
    marginTop: 24,
  },
  advancedToggleText: {
    color: '#6b7280',
    fontSize: 14,
  },
  // WebView Modal styles
  webViewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#2563eb',
  },
  webViewClose: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  webViewTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  webViewFetch: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  webViewLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  webViewFooter: {
    padding: 12,
    backgroundColor: '#f3f4f6',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  webViewHint: {
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 13,
  },
});
