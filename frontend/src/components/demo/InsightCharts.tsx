import React from 'react';
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { DemoDepartment } from './demoData';

interface InsightChartsProps {
  department: DemoDepartment;
}

export default function InsightCharts({ department }: InsightChartsProps) {
  return (
    <div className="row g-4 mt-3 mb-3">
      {/* Radar Chart */}
      <div className="col-md-6">
        <div className="card border-0 shadow-sm h-100">
          <div className="card-body p-3">
            <h4 className="h6 fw-semibold mb-3">Performance: Current vs. With AI</h4>
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={department.radarData} cx="50%" cy="50%" outerRadius="75%">
                <PolarGrid stroke="var(--color-border)" />
                <PolarAngleAxis
                  dataKey="metric"
                  tick={{ fontSize: 10, fill: 'var(--color-text-light)' }}
                />
                <PolarRadiusAxis tick={{ fontSize: 9 }} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    background: '#fff',
                    border: '1px solid var(--color-border)',
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Radar
                  name="Current"
                  dataKey="current"
                  stroke="#1a365d"
                  fill="#1a365d"
                  fillOpacity={0.15}
                />
                <Radar
                  name="With AI"
                  dataKey="potential"
                  stroke="#38a169"
                  fill="#38a169"
                  fillOpacity={0.15}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bar Chart - Pipeline */}
      <div className="col-md-6">
        <div className="card border-0 shadow-sm h-100">
          <div className="card-body p-3">
            <h4 className="h6 fw-semibold mb-3">
              {department.name} Pipeline
            </h4>
            {department.pipelineData ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={department.pipelineData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis
                    type="category"
                    dataKey="stage"
                    tick={{ fontSize: 10, fill: 'var(--color-text-light)' }}
                    width={110}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#fff',
                      border: '1px solid var(--color-border)',
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  />
                  <Bar
                    dataKey="value"
                    fill={department.color}
                    radius={[0, 4, 4, 0]}
                    barSize={18}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-muted small text-center py-5">
                Pipeline data unavailable
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
