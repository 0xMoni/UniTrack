import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts'

function App() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true)
      else setLoading(true)

      const url = refresh ? '/api/attendance?refresh=true' : '/api/attendance'
      const res = await fetch(url)
      const json = await res.json()

      if (json.success === false) {
        setError(json.error)
      } else {
        setData(json)
        setError(null)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const getStatusColor = (status) => {
    switch (status) {
      case 'SAFE': return 'text-green-600 bg-green-100'
      case 'CRITICAL': return 'text-yellow-600 bg-yellow-100'
      case 'LOW': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getProgressColor = (percentage, threshold) => {
    if (percentage >= threshold + 10) return 'bg-green-500'
    if (percentage >= threshold) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const isTYL = (code, name) => {
    return code?.toUpperCase().includes('TYL') || name?.toUpperCase().includes('TYL')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading attendance data...</div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl text-red-600 mb-4">{error}</div>
          <button
            onClick={() => fetchData(true)}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Fetch Data
          </button>
        </div>
      </div>
    )
  }

  const { institution, studentName, rollNumber, branch, section, semester, threshold, summary, subjects, lastFetched } = data || {}

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold">{institution || 'UniTrack'}</h1>
              <div className="mt-2 text-blue-100">
                <p className="text-lg">{studentName} <span className="opacity-75">({rollNumber})</span></p>
                <p className="text-sm">{branch} | Section {section} | {subjects?.[0]?.term || semester}</p>
              </div>
            </div>
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition disabled:opacity-50"
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow p-6">
            <div className="text-sm text-gray-500 mb-1">Overall Attendance</div>
            <div className="text-3xl font-bold text-gray-800">{summary?.overall_percentage}%</div>
            <div className="text-sm text-gray-500">{summary?.overall_present}/{summary?.overall_total} classes</div>
          </div>

          <div className="bg-white rounded-xl shadow p-6">
            <div className="text-sm text-gray-500 mb-1">Safe</div>
            <div className="text-3xl font-bold text-green-600">{summary?.safe_count}</div>
            <div className="text-sm text-gray-500">subjects above {threshold + 10}%</div>
          </div>

          <div className="bg-white rounded-xl shadow p-6">
            <div className="text-sm text-gray-500 mb-1">Critical</div>
            <div className="text-3xl font-bold text-yellow-600">{summary?.critical_count}</div>
            <div className="text-sm text-gray-500">subjects at threshold</div>
          </div>

          <div className="bg-white rounded-xl shadow p-6">
            <div className="text-sm text-gray-500 mb-1">Low</div>
            <div className="text-3xl font-bold text-red-600">{summary?.low_count}</div>
            <div className="text-sm text-gray-500">subjects below threshold</div>
          </div>
        </div>

        {/* Bar Chart */}
        <div className="bg-white rounded-xl shadow p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Attendance Overview</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={subjects?.map(s => ({
                  name: s.subject_code || s.subject.slice(0, 10),
                  percentage: s.percentage,
                  threshold: s.threshold,
                  status: s.status,
                  fullName: s.subject
                }))}
                margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload
                      return (
                        <div className="bg-white border border-gray-200 shadow-lg rounded-lg p-3">
                          <p className="font-medium text-gray-900">{d.fullName}</p>
                          <p className="text-sm text-gray-600">Attendance: <span className="font-semibold">{d.percentage}%</span></p>
                          <p className="text-sm text-gray-600">Threshold: {d.threshold}%</p>
                        </div>
                      )
                    }
                    return null
                  }}
                />
                <ReferenceLine y={threshold} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: `${threshold}%`, position: 'right', fill: '#f59e0b', fontSize: 12 }} />
                <Bar dataKey="percentage" radius={[4, 4, 0, 0]}>
                  {subjects?.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry.status === 'SAFE' ? '#22c55e' :
                        entry.status === 'CRITICAL' ? '#eab308' :
                        '#ef4444'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Attendance Table */}
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800">Subject-wise Attendance</h2>
            <p className="text-sm text-gray-500">Default threshold: {threshold}% | TYL subjects: 80%</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Attended</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progress</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {subjects?.map((subject, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-medium text-gray-900">
                            {subject.subject}
                          </div>
                          <div className="text-sm text-gray-500 flex items-center gap-2">
                            {subject.subject_code}
                            {isTYL(subject.subject_code, subject.subject) && (
                              <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full font-medium">
                                TYL 80%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm">
                        <span className="font-semibold">{subject.present}</span>
                        <span className="text-gray-500">/{subject.total}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-gray-200 rounded-full h-2 w-32">
                          <div
                            className={`h-2 rounded-full ${getProgressColor(subject.percentage, subject.threshold)}`}
                            style={{ width: `${Math.min(subject.percentage, 100)}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium w-14">{subject.percentage}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(subject.status)}`}>
                        {subject.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {subject.status === 'LOW' ? (
                        <span className="text-red-600 font-medium">Need {subject.classes_needed} classes</span>
                      ) : subject.classes_can_miss > 0 ? (
                        <span className="text-green-600">Can miss {subject.classes_can_miss}</span>
                      ) : (
                        <span className="text-yellow-600">Attend all</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-gray-500">
          Last updated: {lastFetched ? new Date(lastFetched).toLocaleString() : 'Never'}
        </div>
      </main>
    </div>
  )
}

export default App
