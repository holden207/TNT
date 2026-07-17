(function () {
  const form = document.getElementById('change-form');
  const currentPassword = document.getElementById('currentPassword');
  const newPassword = document.getElementById('newPassword');
  const confirmPassword = document.getElementById('confirmPassword');
  const errorEl = document.getElementById('change-error');
  const submitBtn = document.getElementById('submit-btn');
  const label = submitBtn.querySelector('.btn-label');
  const spinner = submitBtn.querySelector('.btn-spinner');

  function setLoading(on) {
    submitBtn.disabled = on;
    spinner.hidden = !on;
    label.textContent = on ? 'Updating…' : 'Change password';
  }

  function showError(message) {
    errorEl.hidden = false;
    errorEl.textContent = message;
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    errorEl.hidden = true;
    if (!currentPassword.value || !newPassword.value || !confirmPassword.value) {
      showError('Fill in all password fields.');
      return;
    }
    if (newPassword.value !== confirmPassword.value) {
      showError('New passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          currentPassword: currentPassword.value,
          newPassword: newPassword.value,
          confirmPassword: confirmPassword.value,
        }),
      });
      const data = await response.json().catch(() => ({ ok: false, error: 'Unexpected server response.' }));
      if (!response.ok || !data.ok) {
        showError(data.error || 'Could not change the password.');
        setLoading(false);
        return;
      }
      window.location.href = '/?welcome=1';
    } catch (_) {
      showError('Unable to reach the server.');
      setLoading(false);
    }
  });

  document.getElementById('sign-out').addEventListener('click', async function (event) {
    event.preventDefault();
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    window.location.href = '/login';
  });

  currentPassword.focus();
})();
