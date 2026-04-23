/**
 * Modal Component
 */

export function showModal({ title, content, footer, onClose, dismissible = true }) {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;

  overlay.classList.remove('hidden');
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        ${dismissible ? `<button class="modal-close" id="modal-close-btn">✕</button>` : ''}
      </div>
      <div class="modal-body">${content}</div>
      ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
    </div>
  `;

  // Close handlers
  const close = () => {
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
    if (onClose) onClose();
  };

  if (dismissible) {
    overlay.querySelector('#modal-close-btn')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
  }

  return { close, overlay };
}

export function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
  }
}
