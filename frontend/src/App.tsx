import { useMemo } from "react";
import { useSession } from "./hooks/useSession";
import { LoginScreen } from "./components/LoginScreen";
import { AuthenticatedView } from "./components/AuthenticatedView";
import { logout } from "./api/bff";

function currentReturnTo(): string {
  const { pathname, search } = window.location;
  const params = new URLSearchParams(search);
  params.delete("error");
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export default function App() {
  const { state } = useSession();
  const error = useMemo(() => new URLSearchParams(window.location.search).get("error"), []);
  const returnTo = useMemo(currentReturnTo, []);

  const handleLogout = async () => {
    const logoutUrl = await logout();
    window.location.href = logoutUrl;
  };

  if (state.status === "loading") {
    return <div className="screen" />;
  }

  if (state.status === "authenticated") {
    return <AuthenticatedView user={state.user} onLogout={handleLogout} />;
  }

  return <LoginScreen returnTo={returnTo} error={error} />;
}
