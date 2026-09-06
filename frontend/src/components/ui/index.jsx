/* eslint-disable react-refresh/only-export-components */
/** Barrel for UI primitives + small presentational helpers. */
export { default as Button } from './Button';
export { default as Modal } from './Modal';
export { ToastProvider, useToast } from './Toast';

export function PageHeader({ icon, title, subtitle, children }) {
  return (
    <div className="page-header">
      <div>
        <h1>{icon && <i className={icon} />}{title}</h1>
        {subtitle && <div className="page-title-sub">{subtitle}</div>}
      </div>
      {children && <div className="btn-group">{children}</div>}
    </div>
  );
}

export function Field({ label, hint, htmlFor, children, className = '' }) {
  return (
    <div className={`form-group ${className}`}>
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

export function LoadingBlock({ text = '加载中…' }) {
  return <div className="loading"><span className="spinner" />{text}</div>;
}

export function EmptyState({ icon = 'fas fa-inbox', text, children }) {
  return (
    <div className="empty-state">
      <i className={icon} />
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}

const STATUS = {
  active: { label: '正常', cls: 'badge-active' },
  expiring: { label: '即将到期', cls: 'badge-expiring' },
  expired: { label: '已到期', cls: 'badge-expired' },
  disabled: { label: '已停用', cls: 'badge-disabled' },
  not_renewing: { label: '到期不续', cls: 'badge-not_renewing' },
};

export function StatusBadge({ status }) {
  const s = STATUS[status] || { label: status, cls: 'badge-neutral' };
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

export { STATUS as STATUS_MAP };
