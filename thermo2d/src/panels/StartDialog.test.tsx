// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { StartDialog } from './StartDialog.js';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('StartDialog', () => {
  it('selecting a template does not hang', async () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => { root.render(<StartDialog />); });
    const btn = Array.from(div.querySelectorAll('button')).find((b) => /Rektangul/.test(b.textContent ?? ''));
    expect(btn).toBeTruthy();
    const t0 = Date.now();
    await act(async () => { btn!.click(); });
    expect(div.textContent).toMatch(/Opprett/);
  }, 20000);
});
