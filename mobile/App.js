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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';

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
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Login credentials
  const [erpUrl, setErpUrl] = useState('https://erp.cmrit.ac.in');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Student & attendance data
  const [studentInfo, setStudentInfo] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [lastFetched, setLastFetched] = useState(null);

  // Hidden WebView for authentication
  const webViewRef = useRef(null);
  const [webViewUrl, setWebViewUrl] = useState(null);
  const [authStep, setAuthStep] = useState(null); // 'login', 'fetch', null

  // Threshold settings
  const [defaultThreshold, setDefaultThreshold] = useState('70');
  const [safeBuffer, setSafeBuffer] = useState('10');
  const [customThresholds, setCustomThresholds] = useState([
    { keyword: 'TYL', threshold: '80' },
    { keyword: 'Lab', threshold: '75' },
  ]);
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
      const savedUsername = await AsyncStorage.getItem('username');
      const savedSubjects = await AsyncStorage.getItem('subjects');
      const savedStudentInfo = await AsyncStorage.getItem('studentInfo');
      const savedThreshold = await AsyncStorage.getItem('defaultThreshold');
      const savedPassword = await AsyncStorage.getItem('password');

      if (savedErpUrl) setErpUrl(savedErpUrl);
      if (savedUsername) setUsername(savedUsername);
      if (savedPassword) setPassword(savedPassword);
      if (savedThreshold) setDefaultThreshold(savedThreshold);
      if (savedSubjects) {
        setSubjects(JSON.parse(savedSubjects));
        setIsLoggedIn(true);
      }
      if (savedStudentInfo) setStudentInfo(JSON.parse(savedStudentInfo));
    } catch (e) {
      console.log('Error loading saved data:', e);
    }
  };

  const saveData = async (subjectsData, studentData) => {
    try {
      await AsyncStorage.setItem('erpUrl', erpUrl);
      await AsyncStorage.setItem('username', username);
      await AsyncStorage.setItem('password', password);
      await AsyncStorage.setItem('subjects', JSON.stringify(subjectsData));
      await AsyncStorage.setItem('studentInfo', JSON.stringify(studentData));
      await AsyncStorage.setItem('defaultThreshold', defaultThreshold);
    } catch (e) {
      console.log('Error saving data:', e);
    }
  };

  const loginAndFetchAttendance = async () => {
    if (!erpUrl || !username || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    setAuthStep('login');
    // Start with login page - WebView will handle the rest
    setWebViewUrl(`${erpUrl}/login.htm`);
  };

  // JavaScript to inject into WebView for login
  const getLoginScript = () => `
    (function() {
      // Check if we're on login page
      var usernameField = document.querySelector('input[name="j_username"]');
      var passwordField = document.querySelector('input[name="j_password"]');
      var form = document.querySelector('form');

      if (usernameField && passwordField) {
        usernameField.value = '${username.replace(/'/g, "\\'")}';
        passwordField.value = '${password.replace(/'/g, "\\'")}';

        // Submit form
        if (form) {
          form.submit();
        }
      }
    })();
    true;
  `;

  // JavaScript to fetch attendance data
  const getFetchScript = () => `
    (function() {
      fetch('${erpUrl}/stu_getSubjectOnChangeWithSemId1.json')
        .then(response => response.json())
        .then(data => {
          window.ReactNativeWebView.postMessage(JSON.stringify({type: 'attendance', data: data}));
        })
        .catch(error => {
          window.ReactNativeWebView.postMessage(JSON.stringify({type: 'error', message: error.toString()}));
        });
    })();
    true;
  `;

  // Handle WebView navigation
  const handleNavigationChange = (navState) => {
    const url = navState.url;
    console.log('Navigation:', url);

    if (authStep === 'login') {
      // Check if login failed
      if (url.includes('authfailed') || url.includes('error')) {
        setLoading(false);
        setAuthStep(null);
        setWebViewUrl(null);
        Alert.alert('Login Failed', 'Invalid username or password. Please check your credentials.');
        return;
      }

      // Check if login succeeded (redirected to dashboard or home)
      if (!url.includes('login') && !url.includes('j_spring_security_check')) {
        // Login succeeded, now fetch attendance
        setAuthStep('fetch');
        // Navigate to attendance page first
        setWebViewUrl(`${erpUrl}/studentSubjectAttendance.htm`);
      }
    }
  };

  // Handle WebView load end
  const handleWebViewLoad = () => {
    if (authStep === 'login' && webViewRef.current) {
      // Inject login script
      webViewRef.current.injectJavaScript(getLoginScript());
    } else if (authStep === 'fetch' && webViewRef.current) {
      // Fetch attendance data
      setTimeout(() => {
        webViewRef.current.injectJavaScript(getFetchScript());
      }, 1000);
    }
  };

  // Handle messages from WebView
  const handleWebViewMessage = (event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);

      if (message.type === 'attendance') {
        processAttendanceData(message.data);
        setAuthStep(null);
        setWebViewUrl(null);
      } else if (message.type === 'error') {
        Alert.alert('Error', 'Failed to fetch attendance data');
        setLoading(false);
        setAuthStep(null);
        setWebViewUrl(null);
      }
    } catch (e) {
      console.log('Message parse error:', e);
    }
  };

  const processAttendanceData = (rawData) => {
    if (!Array.isArray(rawData) || rawData.length === 0) {
      Alert.alert('Error', 'No attendance data found');
      return;
    }

    // Process attendance data
    const processedSubjects = rawData.map(item => {
      const present = parseInt(item.presentCount) || 0;
      const absent = parseInt(item.absentCount) || 0;
      const total = present + absent;
      const percentage = total > 0 ? (present / total * 100) : 0;

      return {
        subject: item.subject || 'Unknown',
        subject_code: item.subjectCode || '',
        present,
        absent,
        total,
        percentage: Math.round(percentage * 100) / 100,
        faculty: (item.facultName || '').trim(),
      };
    });

    // Extract student info
    const studentData = {
      name: rawData[0]?.studentName || username.split('@')[0],
      rollNumber: rawData[0]?.rollNumber || '',
      branch: rawData[0]?.branchName || '',
      section: rawData[0]?.sectionName || '',
      institution: 'CMR Institute of Technology',
    };

    setSubjects(processedSubjects);
    setStudentInfo(studentData);
    setLastFetched(new Date().toISOString());
    setIsLoggedIn(true);

    // Save for offline access
    saveData(processedSubjects, studentData);

    Alert.alert('Success', `Fetched ${processedSubjects.length} subjects!`);
  };

  const refreshAttendance = async () => {
    if (!password) {
      Alert.alert('Password Required', 'Please enter your password in settings to refresh');
      setShowSettings(true);
      return;
    }
    setRefreshing(true);
    await loginAndFetchAttendance();
    setRefreshing(false);
  };

  const logout = async () => {
    await AsyncStorage.clear();
    setIsLoggedIn(false);
    setSubjects([]);
    setStudentInfo(null);
    setPassword('');
    setShowSettings(false);
    setWebViewUrl(null);
    setAuthStep(null);
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
              placeholder="https://erp.cmrit.ac.in"
              autoCapitalize="none"
            />

            <Text style={styles.settingsLabel}>Username (Email):</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="your.email@cmrit.ac.in"
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={styles.settingsLabel}>Password:</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Enter password to refresh"
              secureTextEntry
            />

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
                Alert.alert('Logout', 'Are you sure?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Logout', style: 'destructive', onPress: logout },
                ]);
              }}
            >
              <Text style={styles.logoutButtonText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Login Screen
  if (!isLoggedIn) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />

        {/* Hidden WebView for authentication */}
        {webViewUrl && (
          <WebView
            ref={webViewRef}
            source={{ uri: webViewUrl }}
            style={{ height: 0, width: 0, opacity: 0 }}
            onNavigationStateChange={handleNavigationChange}
            onLoadEnd={handleWebViewLoad}
            onMessage={handleWebViewMessage}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            sharedCookiesEnabled={true}
            thirdPartyCookiesEnabled={true}
          />
        )}

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.loginScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.loginContainer}>
              <Image
                source={require('./assets/icon.png')}
                style={styles.loginLogo}
                resizeMode="contain"
              />
              <Text style={styles.loginTitle}>UniTrack</Text>
              <Text style={styles.loginSubtitle}>University Attendance Tracker</Text>

              <View style={styles.loginForm}>
                <Text style={styles.loginLabel}>ERP URL</Text>
                <TextInput
                  style={styles.loginInput}
                  value={erpUrl}
                  onChangeText={setErpUrl}
                  placeholder="https://erp.cmrit.ac.in"
                  placeholderTextColor="#999"
                  autoCapitalize="none"
                />

                <Text style={styles.loginLabel}>Username (Email)</Text>
                <TextInput
                  style={styles.loginInput}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="your.email@cmrit.ac.in"
                  placeholderTextColor="#999"
                  autoCapitalize="none"
                  keyboardType="email-address"
                />

                <Text style={styles.loginLabel}>Password</Text>
                <View style={styles.passwordContainer}>
                  <TextInput
                    style={styles.passwordInput}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter your ERP password"
                    placeholderTextColor="#999"
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.loginButton, loading && styles.loginButtonDisabled]}
                  onPress={loginAndFetchAttendance}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.loginButtonText}>Login & Fetch Attendance</Text>
                  )}
                </TouchableOpacity>

                <Text style={styles.loginNote}>
                  Your credentials are stored securely on your device only.
                </Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
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

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{studentInfo?.institution || 'UniTrack'}</Text>
          <Text style={styles.headerSubtitle}>{studentInfo?.name} ({studentInfo?.rollNumber})</Text>
          <Text style={styles.headerInfo}>{studentInfo?.branch} | Section {studentInfo?.section}</Text>
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
                      <View style={styles.tylBadge}>
                        <Text style={styles.tylText}>{subject.threshold}%</Text>
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
  tylBadge: {
    backgroundColor: '#f3e8ff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
  },
  tylText: {
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
  // Login Screen Styles
  loginScrollContent: {
    flexGrow: 1,
  },
  loginContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    paddingTop: 60,
  },
  loginLogo: {
    width: 100,
    height: 100,
    marginBottom: 16,
  },
  loginTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: 4,
  },
  loginSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 30,
  },
  loginForm: {
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
  loginLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  loginInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    marginBottom: 16,
    color: '#1f2937',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    marginBottom: 16,
  },
  passwordInput: {
    flex: 1,
    padding: 14,
    fontSize: 16,
    color: '#1f2937',
  },
  eyeButton: {
    padding: 14,
  },
  eyeIcon: {
    fontSize: 20,
  },
  loginButton: {
    backgroundColor: '#2563eb',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  loginButtonDisabled: {
    backgroundColor: '#93c5fd',
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loginNote: {
    fontSize: 11,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 16,
  },
});
