import React from 'react';

const MAP = {
  active: 'badge-green', verified: 'badge-green', completed: 'badge-green', approved: 'badge-green',
  pending: 'badge-yellow', processing: 'badge-yellow',
  overdue: 'badge-red', rejected: 'badge-red', frozen: 'badge-red', closed: 'badge-red',
  dormant: 'badge-gray', inactive: 'badge-gray',
  credit: 'badge-green', debit: 'badge-red',
  savings: 'badge-blue', current: 'badge-purple', hire_purchase: 'badge-yellow', joint: 'badge-blue',
  personal: 'badge-blue', micro: 'badge-purple', mortgage: 'badge-green',
};

export default function Badge({ status, label }) {
  const cls = MAP[status?.toLowerCase()] || 'badge-gray';
  return <span className={`badge ${cls}`}>{label || status}</span>;
}
