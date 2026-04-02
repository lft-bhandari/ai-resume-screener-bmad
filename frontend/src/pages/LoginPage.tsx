import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

/**
 * Login page — full-screen centred form, no sidebar or app navigation (AC2).
 * UX-DR13: full-width inputs, label above field, inline error below form (never field-specific).
 */
export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch {
      // AC4: generic error — never field-specific; password preserved (not cleared)
      setError('Check your email or password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <div className="w-full max-w-sm px-6">
        <h1 className="mb-8 text-2xl font-bold text-text-primary">Sign in</h1>
        <form onSubmit={handleSubmit} noValidate>
          {/* Email field — label above per UX-DR13 */}
          <div className="mb-4">
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-text-primary"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-surface px-3 py-2 text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#038E43]"
              required
              disabled={isLoading}
              autoComplete="email"
            />
          </div>

          {/* Password field — label above per UX-DR13 */}
          <div className="mb-6">
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-text-primary"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-surface px-3 py-2 text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#038E43]"
              required
              disabled={isLoading}
              autoComplete="current-password"
            />
          </div>

          {/* Inline error — below form, not field-specific (UX-DR13, AC4) */}
          {error && (
            <p role="alert" className="mb-4 text-sm text-[#b45309]">
              {error}
            </p>
          )}

          {/* Primary CTA — brand green per UX-DR14 (AC2, AC5) */}
          <Button
            type="submit"
            disabled={isLoading}
            className="w-full bg-[#038E43] text-white hover:bg-[#2AA764] focus-visible:ring-[#038E43]"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="size-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Signing in…
              </span>
            ) : (
              'Sign in'
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
