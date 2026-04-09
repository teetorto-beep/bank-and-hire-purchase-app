import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { ArrowLeft } from 'lucide-react';

export default function CollectorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { collectors } = useApp();
  const collector = collectors.find(c => c.id === id);

  if (!collector) return (
    <div className="fade-in" style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center', paddingTop: 60 }}>
      <p style={{ color: 'var(--text-3)' }}>Collector not found.</p>
      <button className="btn btn-secondary" onClick={() => navigate('/collectors')}>Back</button>
    </div>
  );

  return (
    <div className="fade-in" style={{ maxWidth: 640, margin: '0 auto' }}>
      <div className="page-header">
        <div className="page-header-left">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/collectors')} style={{ marginBottom: 4 }}>
            <ArrowLeft size={14} /> Back
          </button>
          <div className="page-title">{collector.name}</div>
          <div className="page-desc">{collector.zone} · {collector.phone}</div>
        </div>
      </div>
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[
            ['Name', collector.name],
            ['Phone', collector.phone],
            ['Zone', collector.zone],
            ['Status', collector.status],
          ].map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{k}</div>
              <div style={{ fontWeight: 600 }}>{v || '—'}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
