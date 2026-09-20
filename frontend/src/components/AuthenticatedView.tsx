import type { SessionUser } from "../api/bff";

interface AuthenticatedViewProps {
  user: SessionUser;
  onLogout: () => void;
}

export function AuthenticatedView({ user, onLogout }: AuthenticatedViewProps) {
  return (
    <div className="screen">
      <div className="card">
        <h1>You're signed in</h1>
        <p className="subtitle">{user.name ?? user.email ?? user.sub}</p>
        <div className="actions">
          <button className="button primary" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
