import type { ReactNode } from 'react';

type Variant = 'neutral' | 'admin' | 'success' | 'warning' | 'danger' | 'info';

const variants: Record<Variant, string> = {
    neutral: 'bg-cnt-surface text-gray-400',
    admin: 'bg-red-950 text-cnt-red',
    success: 'bg-green-900/50 text-green-300 border border-green-800',
    warning: 'bg-yellow-900/50 text-yellow-300 border border-yellow-800',
    danger: 'bg-red-950 text-red-300 border border-cnt-red',
    info: 'bg-blue-900/50 text-blue-300 border border-blue-800',
};

export default function Badge({
    children,
    variant = 'neutral',
    className = '',
}: {
    children: ReactNode;
    variant?: Variant;
    className?: string;
}) {
    return (
        <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${variants[variant]} ${className}`}>
        {children}
        </span>
    );
}