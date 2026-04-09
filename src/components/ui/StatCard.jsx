import React from 'react';

export default function StatCard({ label, value, sub, icon: Icon, color = '#3b82f6', prefix = '', suffix = '' }) {
  return (
    <div className="stat-card">
      <div className="stat-info">
        <div className="stat-label">{label}</div>
        <div className="stat-value">{prefix}{typeof value === 'number' ? value.toLocaleString() : value}{suffix}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
      {Icon && (
        <div className="stat-icon" style={{ background: color + '18', color }}>
          <Icon size={22} />
        </div>
      )}
    </div>
  );
}
