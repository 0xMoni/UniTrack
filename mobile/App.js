import { StatusBar } from 'expo-status-bar';
import { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  SafeAreaView,
  Image,
  ActivityIndicator,
  Modal,
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
  const [showWebView, setShowWebView] = useState(false);

  const webViewRef = useRef(null);

  // ERP URL
  const [erpUrl, setErpUrl] = useState('https://erp.cmrit.ac.in');

  // Student & attendance data
  const [studentInfo, setStudentInfo] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [lastFetched, setLastFetched] = useState(null);

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
      const savedSubjects = await AsyncStorage.getItem('subjects');
      const savedStudentInfo = await AsyncStorage.getItem('studentInfo');
      const savedThreshold = await AsyncStorage.getItem('defaultThreshold');

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
      await AsyncStorage.setItem('subjects', JSON.stringify(subjectsData));
      await AsyncStorage.setItem('studentInfo', JSON.stringify(studentData));
      await AsyncStorage.setItem('defaultThreshold', defaultThreshold);
    } catch (e) {
      console.log('Error saving data:', e);
    }
  };

  // JavaScript to inject into WebView to fetch attendance
  const fetchAttendanceScript = `
    (function() {
      fetch('${erpUrl}/stu_getSubjectOnChangeWithSemId1.json', {
        credentials: 'include'
      })
      .then(response => response.json())
      .then(data => {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'attendance',
          data: data
        }));
      })
      .catch(error => {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'error',
          message: error.toString()
        }));
      });
    })();
    true;
  `;

  const handleWebViewMessage = (event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);

      if (message.type === 'attendance' && Array.isArray(message.data)) {
        const rawData = message.data;

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
          name: rawData[0]?.studentName || 'Student',
          rollNumber: rawData[0]?.rollNumber || '',
          branch: rawData[0]?.branchName || '',
          section: rawData[0]?.sectionName || '',
          institution: 'CMR Institute of Technology',
        };

        setSubjects(processedSubjects);
        setStudentInfo(studentData);
        setLastFetched(new Date().toISOString());
        setIsLoggedIn(true);
        setShowWebView(false);
        setLoading(false);

        // Save for offline access
        saveData(processedSubjects, studentData);

        Alert.alert('Success', `Fetched ${processedSubjects.length} subjects!`);
      } else if (message.type === 'error') {
        Alert.alert('Error', 'Failed to fetch attendance. Make sure you are logged in.');
        setLoading(false);
      }
    } catch (e) {
      console.log('Message parse error:', e);
    }
  };

  const handleNavigationChange = (navState) => {
    // Check if user is on dashboard (logged in successfully)
    if (navState.url.includes('Dashboard') || navState.url.includes('dashboard')) {
      // User logged in, now fetch attendance
      setLoading(true);
      setTimeout(() => {
        webViewRef.current?.injectJavaScript(fetchAttendanceScript);
      }, 1000);
    }
  };

  const logout = async () => {
    await AsyncStorage.clear();
    setIsLoggedIn(false);
    setSubjects([]);
    setStudentInfo(null);
    setShowSettings(false);
  };

  const refreshAttendance = () => {
    setShowWebView(true);
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
  if (showWebView) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#2563eb' }}>
        <StatusBar style="light" />
        <View style={styles.webViewHeader}>
          <TouchableOpacity onPress={() => setShowWebView(false)}>
            <Text style={styles.webViewClose}>✕ Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.webViewTitle}>Login to ERP</Text>
          <View style={{ width: 70 }} />
        </View>
        {loading && (
          <View style={styles.webViewLoading}>
            <ActivityIndicator color="#2563eb" size="large" />
            <Text style={styles.webViewLoadingText}>Fetching attendance...</Text>
          </View>
        )}
        <WebView
          ref={webViewRef}
          source={{ uri: `${erpUrl}/login.htm` }}
          onNavigationStateChange={handleNavigationChange}
          onMessage={handleWebViewMessage}
          style={{ flex: 1, opacity: loading ? 0.3 : 1 }}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
        />
      </SafeAreaView>
    );
  }

  // Settings Screen
  if (showSettings) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <ScrollView style={styles.settingsScroll}>
          <View style={styles.settingsContainer}>
            <Text style={styles.settingsTitle}>Settings</Text>

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

  // Login Screen (shows WebView button)
  if (!isLoggedIn) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.loginContainer}>
          <Image
            source={require('./assets/icon.png')}
            style={styles.loginLogo}
            resizeMode="contain"
          />
          <Text style={styles.loginTitle}>UniTrack</Text>
          <Text style={styles.loginSubtitle}>University Attendance Tracker</Text>

          <View style={styles.loginForm}>
            <Text style={styles.loginDescription}>
              Track your attendance from your college ERP system. Login securely through your ERP portal.
            </Text>

            <TouchableOpacity
              style={styles.loginButton}
              onPress={() => setShowWebView(true)}
            >
              <Text style={styles.loginButtonText}>Login with ERP</Text>
            </TouchableOpacity>

            <Text style={styles.loginNote}>
              You'll be redirected to your ERP login page. Your credentials are never stored by this app.
            </Text>
          </View>
        </View>
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

        {/* Refresh Button */}
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={refreshAttendance}
        >
          <Text style={styles.refreshButtonText}>🔄 Refresh Attendance</Text>
        </TouchableOpacity>

        {/* Footer */}
        <Text style={styles.footer}>
          Last updated: {lastFetched ? new Date(lastFetched).toLocaleString() : 'Never'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
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
  },
  webViewTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  webViewLoading: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    zIndex: 10,
    alignItems: 'center',
  },
  webViewLoadingText: {
    marginTop: 10,
    color: '#2563eb',
    fontSize: 16,
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
  refreshButton: {
    backgroundColor: '#2563eb',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  refreshButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 8,
    marginBottom: 30,
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
  saveButton: {
    backgroundColor: '#2563eb',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
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
  loginContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loginLogo: {
    width: 120,
    height: 120,
    marginBottom: 20,
  },
  loginTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: 4,
  },
  loginSubtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 40,
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
  loginDescription: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  loginButton: {
    backgroundColor: '#2563eb',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  loginNote: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
});
