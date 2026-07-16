(function () {
  const form = document.getElementById('login-form');
  const username = document.getElementById('username');
  const password = document.getElementById('password');
  const errorEl = document.getElementById('login-error');
  const submitBtn = document.getElementById('submit-btn');
  const btnLabel = submitBtn.querySelector('.btn-label');
  const spinner = submitBtn.querySelector('.btn-spinner');
  const togglePw = document.getElementById('toggle-pw');
  const REMEMBER_KEY = 'tnt-username';

  function showError(msg) {
    errorEl.hidden = false;
    errorEl.textContent = msg;
  }

  function clearError() {
    errorEl.hidden = true;
    errorEl.textContent = '';
  }

  function setLoading(on) {
    submitBtn.disabled = on;
    spinner.hidden = !on;
    btnLabel.textContent = on ? 'Signing in…' : 'Continue';
  }

  try {
    const saved = localStorage.getItem(REMEMBER_KEY);
    if (saved && !username.value) {
      username.value = saved;
      password.focus();
    } else {
      username.focus();
    }
  } catch (_) {
    username.focus();
  }

  togglePw.addEventListener('click', function () {
    const show = password.type === 'password';
    password.type = show ? 'text' : 'password';
    togglePw.textContent = show ? 'Hide' : 'Show';
    togglePw.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    password.focus();
  });

  username.addEventListener('input', clearError);
  password.addEventListener('input', clearError);

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    clearError();

    const u = username.value.trim();
    const p = password.value;
    if (!u || !p) {
      showError('Enter both username and password.');
      if (!u) username.focus();
      else password.focus();
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username: u, password: p }),
      });
      const data = await res.json().catch(function () {
        return { ok: false, error: 'Unexpected server response.' };
      });

      if (!res.ok || !data.ok) {
        showError(data.error || 'Sign-in failed.');
        setLoading(false);
        password.focus();
        password.select();
        return;
      }

      try {
        localStorage.setItem(REMEMBER_KEY, u.toLowerCase());
      } catch (_) { /* ignore */ }

      window.location.href = '/?welcome=1';
    } catch (err) {
      showError('Unable to reach the server. Check that the app is running.');
      setLoading(false);
    }
  });
})();
