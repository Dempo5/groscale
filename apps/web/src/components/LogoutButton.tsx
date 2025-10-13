import { logout } from "../lib/api";

export default function LogoutButton() {
  return (
    <button
      onClick={() => {
        logout();
        window.location.href = "/login";
      }}
      className="ghost"
      title="Sign out"
    >
      Logout
    </button>
  );
}
