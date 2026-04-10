import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'success';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
    children: ReactNode;
    variant?: Variant;
    fullWidth?: boolean;
}

const variants: Record<Variant, string> = {
    primary: 'bg-cnt-red hover:bg-red-700 disabled:bg-red-900 text-white',
    secondary: 'bg-cnt-surface border border-cnt-border text-gray-400 hover:text-white',
    danger: 'bg-red-950/30 border border-cnt-red text-red-300 hover:text-red-200',
    success: 'bg-green-800 hover:bg-green-700 text-white',
};

export default function Button({
    children,
    variant = 'primary',
    fullWidth = false,
    className = '',
    ...props
}: Props) {
    return (
        <button
        {...props}
        className={`rounded-lg text-sm transition-all px-4 py-2.5 ${fullWidth ? 'w-full' : ''} ${variants[variant]} ${className}`}
        >
        {children}
        </button>
    );
}