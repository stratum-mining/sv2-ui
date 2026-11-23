import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field-error';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { BrandSplash } from '@/components/auth/BrandSplash';
import { CopyableValue } from '@/components/ui/copyable-value';
import { OnboardingLayout } from '@/components/setup/OnboardingLayout';
import { Welcome } from '@/components/setup/Welcome';
import { useAuth } from '@/hooks/useAuth';

/** Must match MIN_PASSWORD_LENGTH in server/src/auth-store.ts. */
const MIN_PASSWORD_LENGTH = 8;

function AuthCard({
  title,
  description,
  showSupport = true,
  children,
}: {
  title: string;
  description: string;
  showSupport?: boolean;
  children: ReactNode;
}) {
  return (
    <OnboardingLayout>
      <div className="mx-auto w-full max-w-md space-y-6">
        <div className="text-center">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-3 text-sm text-muted-foreground">{description}</p>
        </div>
        {children}
        {showSupport && (
          <div className="flex justify-center">
            <Link href="/faq">
              <button
                type="button"
                aria-label="Support & FAQ"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors duration-150"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                Support & FAQ
              </button>
            </Link>
          </div>
        )}
      </div>
    </OnboardingLayout>
  );
}

function RecoveryKeyPanel({
  recoveryKey,
  onDone,
}: {
  recoveryKey: string;
  onDone: () => void;
}) {
  return (
    <AuthCard
      title="Save your recovery key"
      description="This key resets your password if you ever forget it."
      showSupport={false}
    >
      <div className="space-y-4">
        <CopyableValue value={recoveryKey} />

        <p className="text-xs text-muted-foreground text-center">
          Store it somewhere safe. If you lose both your password and this key,
          you can reset your password by deleting credential.json from the
          app&apos;s config folder. Your mining settings are kept.
        </p>

        <Button type="button" size="lg" className="w-full rounded-full" onClick={onDone}>
          I&apos;ve saved it
        </Button>
      </div>
    </AuthCard>
  );
}

function CreatePasswordForm({
  onRecoveryKey,
}: {
  onRecoveryKey: (key: string) => void;
}) {
  const { createPassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (password.length < MIN_PASSWORD_LENGTH) {
      setValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmation) {
      setValidationError('Passwords do not match.');
      return;
    }

    setValidationError(null);
    createPassword.mutate(password, {
      onSuccess: (recoveryKey) => {
        if (recoveryKey) onRecoveryKey(recoveryKey);
      },
    });
  };

  return (
    <AuthCard
      title="Protect your mining setup"
      description="Create an admin password to prevent others from changing your mining settings."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="new-password">Password</Label>
          <PasswordInput
            id="new-password"
            autoComplete="new-password"
            autoFocus
            className="mt-1.5"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="confirm-password">Confirm password</Label>
          <PasswordInput
            id="confirm-password"
            autoComplete="new-password"
            className="mt-1.5"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </div>

        <FieldError message={validationError ?? createPassword.error?.message} />

        <Button type="submit" size="lg" className="w-full rounded-full" disabled={createPassword.isPending}>
          {createPassword.isPending ? 'Creating...' : 'Create password'}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          You&apos;ll get a recovery key on the next screen. Keep it safe so you can reset your password if you forget it.
        </p>
      </form>
    </AuthCard>
  );
}

function ForgotPasswordForm({ onClose }: { onClose: () => void }) {
  const { recover } = useAuth();
  const [key, setKey] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveredKey, setRecoveredKey] = useState<string | null>(null);

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (mismatch) return;
    recover.mutate(
      { recoveryKey: key, newPassword },
      {
        onSuccess: (newRecoveryKey: string | undefined) => {
          setKey('');
          setNewPassword('');
          setConfirmPassword('');
          if (newRecoveryKey) {
            setRecoveredKey(newRecoveryKey);
          } else {
            onClose();
          }
        },
      },
    );
  };

  return (
    <AuthCard
      title="Reset your password"
      description="Enter your recovery key and choose a new password. Your mining configuration will be kept."
      showSupport={!recoveredKey}
    >
      {recoveredKey ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Password reset successfully. Save your new recovery key — you will need it if you forget your password again.
          </p>
          <CopyableValue value={recoveredKey} />
          <Button size="lg" className="w-full rounded-full" onClick={onClose}>
            Log in
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="recovery-key">Recovery key</Label>
            <Input
              id="recovery-key"
              value={key}
              autoFocus
              className="mt-1.5"
              onChange={(event) => setKey(event.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="new-password">New password</Label>
            <PasswordInput
              id="new-password"
              value={newPassword}
              className="mt-1.5"
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <PasswordInput
              id="confirm-password"
              value={confirmPassword}
              className="mt-1.5"
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
            {mismatch && (
              <p className="mt-1 text-xs text-destructive">Passwords do not match.</p>
            )}
          </div>

          <FieldError message={recover.error?.message} />

          <Button type="submit" size="lg" className="w-full rounded-full" disabled={recover.isPending || mismatch}>
            {recover.isPending ? 'Resetting...' : 'Reset password'}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={onClose}
          >
            Cancel
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

function LoginForm({ recoveryKeySet }: { recoveryKeySet: boolean }) {
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);

  if (forgotOpen) {
    return <ForgotPasswordForm onClose={() => setForgotOpen(false)} />;
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate(password);
  };

  return (
    <AuthCard title="Unlock sv2-ui" description="Enter your admin password to manage the mining stack.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            autoFocus
            className="mt-1.5"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <FieldError message={login.error?.message} />

        <Button type="submit" size="lg" className="w-full rounded-full" disabled={login.isPending}>
          {login.isPending ? 'Unlocking...' : 'Unlock'}
        </Button>

        {recoveryKeySet && (
          <div className="text-center">
            <button
              type="button"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
              onClick={() => setForgotOpen(true)}
            >
              Forgot password?
            </button>
          </div>
        )}
      </form>
    </AuthCard>
  );
}

/**
 * Gates every operational route behind an authenticated principal.
 *
 * This is a UX layer only - the server middleware in server/src/index.ts is the
 * actual enforcement point and returns 401 for the whole control API without a
 * session.
 */
export function LoginGate({ children }: { children: ReactNode }) {
  const { isLoading, isError, refetch, passwordSet, authenticated, recoveryKeySet, needsSetup } = useAuth();
  const [, navigate] = useLocation();
  const [pendingRecoveryKey, setPendingRecoveryKey] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [wasAuthenticated, setWasAuthenticated] = useState(authenticated);

  // The recovery key resets the password without a session, so it must not
  // outlive the session that produced it on a page anyone can then reach.
  // Dropped while rendering, so the login form never appears with it.
  if (wasAuthenticated !== authenticated) {
    setWasAuthenticated(authenticated);
    if (!authenticated) setPendingRecoveryKey(null);
  }

  // The server returns the recovery key only once, so it stays up until
  // acknowledged or until the session ends.
  if (pendingRecoveryKey) {
    return (
      <RecoveryKeyPanel
        recoveryKey={pendingRecoveryKey}
        onDone={() => {
          setPendingRecoveryKey(null);
          navigate('/');
        }}
      />
    );
  }

  if (isLoading) {
    return <BrandSplash message="Checking access..." />;
  }

  if (isError) {
    return (
      <AuthCard
        title="Connection error"
        description="Could not reach the server. This may happen during startup or if the configuration is corrupted."
      >
        <Button size="lg" className="w-full rounded-full" onClick={() => refetch()}>
          Try again
        </Button>
      </AuthCard>
    );
  }

  if (!passwordSet) {
    if (needsSetup && !started) {
      return <Welcome onStart={() => setStarted(true)} />;
    }
    return <CreatePasswordForm onRecoveryKey={setPendingRecoveryKey} />;
  }

  if (!authenticated) {
    return <LoginForm recoveryKeySet={recoveryKeySet} />;
  }

  return <>{children}</>;
}
