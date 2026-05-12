/**
 * Dashboard Settings Page
 * User settings and preferences
 * 
 * @serverOnly
 */

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your account settings and preferences
        </p>
      </div>

      <div className="grid gap-6">
        {/* Account Settings */}
        <div className="border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Account</h2>
          <p className="text-muted-foreground">
            Account settings and preferences will appear here.
          </p>
        </div>

        {/* Notification Settings */}
        <div className="border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Notifications</h2>
          <p className="text-muted-foreground">
            Configure your notification preferences.
          </p>
        </div>

        {/* Security Settings */}
        <div className="border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Security</h2>
          <p className="text-muted-foreground">
            Manage your password and security settings.
          </p>
        </div>
      </div>
    </div>
  );
}
