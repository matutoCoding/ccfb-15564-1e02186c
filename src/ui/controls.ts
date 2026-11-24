export function sliderField(options: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  key?: string;
  hint?: string;
}): string {
  const key = options.key ? `data-key="${options.key}"` : '';
  return `
    <div class="field">
      <label>${options.label}<output data-output="${options.key ?? ''}">${options.value}${options.unit ?? ''}</output></label>
      <input type="range" ${key} min="${options.min}" max="${options.max}" step="${options.step}" value="${options.value}" />
      ${options.hint ? `<div class="help">${options.hint}</div>` : ''}
    </div>`;
}

export function statCard(label: string, value: string, unit = '', tone = ''): string {
  return `<div class="stat ${tone}"><div class="stat-label">${label}</div><div class="stat-value">${value}${unit ? `<span class="stat-unit">${unit}</span>` : ''}</div></div>`;
}

export function bindSlider(root: ParentNode, selector: string, onInput: (value: number, input: HTMLInputElement) => void) {
  const input = root.querySelector<HTMLInputElement>(selector);
  if (!input) return;
  const output = input.closest('.field')?.querySelector('output');
  input.addEventListener('input', () => {
    const value = Number(input.value);
    if (output && input.dataset.unit) output.textContent = `${value}${input.dataset.unit}`;
    onInput(value, input);
  });
}

export function openModal(title: string, bodyHtml: string): { dialog: HTMLDialogElement; body: HTMLElement; close: () => void } {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal-dialog';
  dialog.innerHTML = `
    <div class="modal-card card card-pad">
      <div class="modal-head"><h3 class="card-title">${title}</h3><button class="btn btn-sm" value="cancel" type="button" data-close>关闭</button></div>
      <div class="modal-body">${bodyHtml}</div>
    </div>`;
  document.body.appendChild(dialog);
  dialog.showModal();
  const close = () => {
    dialog.close();
    dialog.remove();
  };
  dialog.querySelector('[data-close]')?.addEventListener('click', close);
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });
  return { dialog, body: dialog.querySelector('.modal-body') as HTMLElement, close };
}

export function downloadViewerPng(filename: string) {
  const canvas = document.querySelector<HTMLCanvasElement>('.webgl-canvas');
  if (!canvas) return false;
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
  return true;
}
