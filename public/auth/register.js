(function () {
  const form = document.getElementById('register-form');
  const displayName = document.getElementById('displayName');
  const username = document.getElementById('username');
  const password = document.getElementById('password');
  const confirmPassword = document.getElementById('confirmPassword');
  const errorEl = document.getElementById('register-error');
  const submitBtn = document.getElementById('submit-btn');
  const btnLabel = submitBtn.querySelector('.btn-label');
  const spinner = submitBtn.querySelector('.btn-spinner');

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
    btnLabel.textContent = on ? 'Creating…' : 'Create account';
  }

  function wireToggle(btnId, input) {
    const btn = document.getElementById(btnId);
    btn.addEventListener('click', function () {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Hide' : 'Show';
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  }

  wireToggle('toggle-pw', password);
  wireToggle('toggle-confirm-pw', confirmPassword);

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    clearError();

    const name = displayName.value.trim();
    const u = username.value.trim();
    const p = password.value;
    const confirm = confirmPassword.value;

    if (!name || !u || !p || !confirm) {
      showError('Fill in all fields to create your account.');
      return;
    }
    if (p !== confirm) {
      showError('Passwords do not match.');
      confirmPassword.focus();
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          displayName: name,
          username: u,
          password: p,
          confirmPassword: confirm,
        }),
      });
      const data = await res.json().catch(function () {
        return { ok: false, error: 'Unexpected server response.' };
      });

      if (!res.ok || !data.ok) {
        showError(data.error || 'Could not create account.');
        setLoading(false);
        return;
      }

      window.location.href = '/';
    } catch (err) {
      showError('Unable to reach the server. Check that the app is running.');
      setLoading(false);
    }
  });

  displayName.focus();
})();
