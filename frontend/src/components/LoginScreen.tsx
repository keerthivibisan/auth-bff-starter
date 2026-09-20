import { loginUrl, signupUrl } from "../api/bff";

const ERROR_MESSAGES: Record<string, string> = {
  login_failed: "We couldn't complete sign-in. Please try again.",
  keycloak_unreachable: "The authentication service is unreachable right now. Please try again shortly.",
  session_error: "Something went wrong starting your session. Please try again.",
};

interface LoginScreenProps {
  returnTo: string;
  error?: string | null;
}

export function LoginScreen({ returnTo, error }: LoginScreenProps) {
  return (
    <div className="screen">
      <div className="card">
        <h1>React + Keycloak Base</h1>
        <p className="subtitle">Sign in to continue</p>

        {error && (
          <div className="error-banner" role="alert">
            {ERROR_MESSAGES[error] ?? "An unexpected error occurred. Please try again."}
          </div>
        )}

        <div className="actions">
          <a className="button primary" href={loginUrl(returnTo)}>
            Login
          </a>
          <a className="button secondary" href={signupUrl(returnTo)}>
            Sign up
          </a>
        </div>
      </div>
    </div>
  );
}
