/**
 * Button — thin wrapper over the .btn CSS classes.
 * variant: primary | secondary | ghost | danger | danger-outline | success | warning
 */
const VARIANT_CLASS = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  'danger-outline': 'btn-danger-outline',
  success: 'btn-success',
  warning: 'btn-warning',
};

export default function Button({
  variant = 'secondary',
  size,
  block = false,
  icon,
  loading = false,
  disabled = false,
  className = '',
  children,
  ...rest
}) {
  const classes = [
    'btn',
    VARIANT_CLASS[variant] || VARIANT_CLASS.secondary,
    size === 'sm' && 'btn-sm',
    size === 'lg' && 'btn-lg',
    block && 'btn-block',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      {loading
        ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
        : icon && <i className={icon} />}
      {children}
    </button>
  );
}
