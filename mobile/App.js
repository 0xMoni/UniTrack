import { StatusBar } from 'expo-status-bar';
import { useState, useEffect } from 'react';
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

// Backend API URL - Update this after deploying to Render
const API_URL = 'https://unitrack-api-vss4.onrender.com';

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
  const [erpUrl, setErpUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

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
      const savedUsername = await AsyncStorage.getItem('username');
      const savedPassword = await AsyncStorage.getItem('password');
      const savedSubjects = await AsyncStorage.getItem('subjects');
      const savedStudentInfo = await AsyncStorage.getItem('studentInfo');
      const savedThreshold = await AsyncStorage.getItem('defaultThreshold');
      const savedLoggedIn = await AsyncStorage.getItem('isLoggedIn');
      const savedLastFetched = await AsyncStorage.getItem('lastFetched');

      if (savedErpUrl) setErpUrl(savedErpUrl);
      if (savedUsername) setUsername(savedUsername);
      if (savedPassword) setPassword(savedPassword);
      if (savedThreshold) setDefaultThreshold(savedThreshold);
      if (savedLastFetched) setLastFetched(savedLastFetched);

      if (savedSubjects) {
        setSubjects(JSON.parse(savedSubjects));
      }
      if (savedStudentInfo) {
        setStudentInfo(JSON.parse(savedStudentInfo));
      }
      if (savedLoggedIn === 'true' && savedSubjects) {
        setIsLoggedIn(true);
      }
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
      await AsyncStorage.setItem('isLoggedIn', 'true');
      await AsyncStorage.setItem('lastFetched', new Date().toISOString());
    } catch (e) {
      console.log('Error saving data:', e);
    }
  };

  const fetchAttendance = async () => {
    if (!erpUrl || !username || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/fetch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          erp_url: erpUrl,
          username: username,
          password: password,
        }),
      });

      const data = await response.json();

      if (data.success) {
        processAttendanceData(data.subjects, data.student);
        Alert.alert('Success', `Fetched ${data.count} subjects!`);
      } else {
        Alert.alert('Error', data.error || 'Failed to fetch attendance');
      }
    } catch (error) {
      console.log('Fetch error:', error);
      Alert.alert(
        'Connection Error',
        'Could not connect to server. Please check your internet connection and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const processAttendanceData = (subjectsData, apiStudentInfo) => {
    setSubjects(subjectsData);
    setLastFetched(new Date().toISOString());
    setIsLoggedIn(true);

    // Use student info from API if available, otherwise use username
    const institution = new URL(erpUrl).hostname.split('.')[1]?.toUpperCase() || 'University';

    // Try to get name: from API, or extract from username
    let studentName = apiStudentInfo?.name;
    if (!studentName || studentName === 'Student') {
      // Try to extract name from username (might be email like john.doe@email.com)
      const namePart = username.split('@')[0]; // Get part before @
      // Convert john.doe or john_doe to John Doe
      studentName = namePart
        .replace(/[._]/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    }

    const studentData = {
      name: studentName,
      usn: apiStudentInfo?.usn || '',
      institution: institution,
    };
    setStudentInfo(studentData);

    // Save for offline access
    saveData(subjectsData, studentData);
  };

  const refreshAttendance = async () => {
    setRefreshing(true);
    await fetchAttendance();
    setRefreshing(false);
  };

  const logout = async () => {
    await AsyncStorage.clear();
    setIsLoggedIn(false);
    setSubjects([]);
    setStudentInfo(null);
    setPassword('');
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
                Alert.alert('Logout', 'This will clear all saved data. Continue?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Logout', style: 'destructive', onPress: logout },
                ]);
              }}
            >
              <Text style={styles.logoutButtonText}>Logout & Clear Data</Text>
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
                  placeholder="https://erp.university.edu"
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="none"
                  keyboardType="url"
                />

                <Text style={styles.loginLabel}>Username / Email</Text>
                <TextInput
                  style={styles.loginInput}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="student@university.edu"
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="none"
                  keyboardType="email-address"
                />

                <Text style={styles.loginLabel}>Password</Text>
                <View style={styles.passwordContainer}>
                  <TextInput
                    style={styles.passwordInput}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    placeholderTextColor="#9ca3af"
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Text style={styles.eyeIcon}>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.loginButton, loading && styles.loginButtonDisabled]}
                  onPress={fetchAttendance}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.loginButtonText}>Login & Fetch Attendance</Text>
                  )}
                </TouchableOpacity>

                <Text style={styles.loginHint}>
                  Your credentials are sent securely to our server which fetches your attendance from the ERP.
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
          <Text style={styles.headerSubtitle}>{studentInfo?.name || 'Student'}</Text>
          {studentInfo?.usn ? (
            <Text style={styles.headerUsn}>{studentInfo.usn}</Text>
          ) : null}
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
  headerUsn: {
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
  // Login styles
  loginScrollContent: {
    flexGrow: 1,
  },
  loginContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loginLogo: {
    width: 80,
    height: 80,
    marginBottom: 16,
  },
  loginTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1f2937',
  },
  loginSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 30,
  },
  loginForm: {
    width: '100%',
  },
  loginLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  loginInput: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    marginBottom: 16,
    color: '#1f2937',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    marginBottom: 20,
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
    fontSize: 18,
  },
  loginButton: {
    backgroundColor: '#2563eb',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  loginButtonDisabled: {
    backgroundColor: '#93c5fd',
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loginHint: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 16,
  },
});
