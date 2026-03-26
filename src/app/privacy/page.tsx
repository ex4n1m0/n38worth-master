export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-300 py-16 px-4">
      <div className="max-w-2xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
        <p className="text-sm text-gray-500">Last updated: March 4, 2026</p>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">1. Information We Collect</h2>
          <p>
            When you sign in with Facebook, we receive your <strong>name</strong> and{" "}
            <strong>profile picture</strong> from your Facebook account. We use this
            information solely to create and display your in-game profile.
          </p>
          <p>
            If you register with a username and password, we store your username and a
            securely hashed version of your password. We never store your password in
            plain text.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">2. How We Use Your Information</h2>
          <p>Your information is used exclusively to:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Create and manage your game account</li>
            <li>Display your profile to other players</li>
            <li>Enable in-game features such as trading, leaderboards, and chat</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">3. Data Sharing</h2>
          <p>
            We do <strong>not</strong> sell, rent, or share your personal information with
            third parties. Your data stays within the n38worth platform.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">4. Data Storage &amp; Security</h2>
          <p>
            Your data is stored securely in encrypted databases. We use industry-standard
            security measures including HTTPS encryption, hashed passwords, and secure
            session management via JSON Web Tokens (JWT).
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">5. Account Deletion</h2>
          <p>
            In-game accounts may be removed automatically based on game mechanics (player
            inactivity). You may also request full deletion of your data by contacting us.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">6. Cookies</h2>
          <p>
            We use essential cookies for authentication and session management. These are
            strictly necessary for the game to function and cannot be opted out of.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">7. Changes to This Policy</h2>
          <p>
            We may update this privacy policy from time to time. Any changes will be posted
            on this page with an updated revision date.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">8. Contact</h2>
          <p>
            If you have questions about this privacy policy or wish to request data
            deletion, please reach out through the in-game chat or contact us via our
            GitHub repository.
          </p>
        </section>
      </div>
    </div>
  );
}
