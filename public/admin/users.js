(function () {
  const body = document.getElementById('users-body');
  const summary = document.getElementById('summary');
  const notice = document.getElementById('notice');
  const filter = document.getElementById('status-filter');
  let users = [];
  let currentUsername = '';

  function showNotice(message, isError) {
    notice.hidden = false;
    notice.textContent = message;
    notice.classList.toggle('error', !!isError);
  }

  function formatDate(value) {
    if (!value) return 'Never';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Never' : date.toLocaleString();
  }

  async function api(url, options) {
    const response = await fetch(url, Object.assign({ credentials: 'same-origin' }, options));
    const data = await response.json().catch(() => ({ ok: false, error: 'Unexpected server response.' }));
    if (!response.ok || !data.ok) throw new Error(data.error || 'Request failed.');
    return data;
  }

  function button(label, className, handler, disabled) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = `button ${className || ''}`.trim();
    element.textContent = label;
    element.disabled = !!disabled;
    element.addEventListener('click', handler);
    return element;
  }

  async function updateUser(user, patch, successMessage) {
    try {
      await api(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(patch),
      });
      showNotice(successMessage, false);
      await loadUsers();
    } catch (error) {
      showNotice(error.message, true);
    }
  }

  function render() {
    const shown = users.filter((user) => !filter.value || user.status === filter.value);
    const pending = users.filter((user) => user.status === 'pending').length;
    summary.textContent = `${users.length} accounts · ${pending} awaiting approval`;
    body.replaceChildren();

    if (!shown.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 5;
      cell.className = 'empty';
      cell.textContent = 'No accounts match this filter.';
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }

    shown.forEach((user) => {
      const row = document.createElement('tr');
      const identity = document.createElement('td');
      const name = document.createElement('div');
      name.className = 'user-name';
      name.textContent = user.displayName;
      const meta = document.createElement('div');
      meta.className = 'user-meta';
      meta.textContent = `@${user.username}${user.username === currentUsername ? ' · You' : ''}`;
      identity.append(name, meta);

      const statusCell = document.createElement('td');
      const status = document.createElement('span');
      status.className = `badge ${user.status}`;
      status.textContent = user.status;
      statusCell.appendChild(status);

      const roleCell = document.createElement('td');
      const role = document.createElement('select');
      role.setAttribute('aria-label', `Role for ${user.username}`);
      ['viewer', 'analyst', 'admin'].forEach((value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value.charAt(0).toUpperCase() + value.slice(1);
        option.selected = user.role === value;
        role.appendChild(option);
      });
      role.disabled = user.username === currentUsername;
      role.addEventListener('change', () => {
        updateUser(user, { role: role.value }, `Role updated for ${user.username}.`);
      });
      roleCell.appendChild(role);

      const lastLogin = document.createElement('td');
      lastLogin.textContent = formatDate(user.lastLoginAt);

      const actions = document.createElement('td');
      actions.className = 'row-actions';
      const isSelf = user.username === currentUsername;
      if (user.status === 'pending') {
        actions.appendChild(button('Approve', '', () => {
          updateUser(user, { status: 'active', role: role.value }, `${user.username} approved as ${role.value}.`);
        }));
      } else if (user.status === 'active') {
        actions.appendChild(button('Disable', 'danger', () => {
          if (window.confirm(`Disable access for ${user.username}?`)) {
            updateUser(user, { status: 'disabled' }, `${user.username} disabled.`);
          }
        }, isSelf));
      } else {
        actions.appendChild(button('Re-enable', '', () => {
          updateUser(user, { status: 'active' }, `${user.username} re-enabled.`);
        }));
      }
      actions.appendChild(button('Temporary password', 'neutral', () => {
        const password = window.prompt(`Enter a temporary password for ${user.username}:`);
        if (password) {
          updateUser(user, { temporaryPassword: password }, `Temporary password set for ${user.username}.`);
        }
      }, isSelf));

      row.append(identity, statusCell, roleCell, lastLogin, actions);
      body.appendChild(row);
    });
  }

  async function loadUsers() {
    try {
      const [session, result] = await Promise.all([api('/api/session'), api('/api/admin/users')]);
      currentUsername = session.user.username;
      users = result.users;
      render();
    } catch (error) {
      showNotice(error.message, true);
      summary.textContent = 'Unable to load accounts';
    }
  }

  filter.addEventListener('change', render);
  document.getElementById('refresh').addEventListener('click', loadUsers);
  loadUsers();
})();
