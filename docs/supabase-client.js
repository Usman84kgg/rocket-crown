// Shared Supabase connection for the player app and the owner admin panel.
// The anon key is public by design: what it may read or write is decided by the
// row level security policies in supabase/schema.sql, not by keeping it secret.
(() => {
  const SUPABASE_URL = 'https://bxfckakkyaymmamfikli.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4ZmNrYWtreWF5bW1hbWZpa2xpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMjYzNTUsImV4cCI6MjEwMDYwMjM1NX0.wJdOcam0A-hxqBKsgaHBrIpRW340LSTsaxVR7QO_tSQ';

  const formatMoney = (value) =>
    `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Postgres raises plain exceptions for the rules in schema.sql ("Insufficient
  // balance", "Your account is banned", ...); show those verbatim.
  const errorText = (error) =>
    error?.message || error?.error_description || 'Something went wrong. Please try again.';

  window.rocketCrown = {
    db: window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY),
    formatMoney,
    errorText
  };
})();
