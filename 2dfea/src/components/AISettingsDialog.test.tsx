/**
 * AISettingsDialog tests (RTL).
 *
 * Plan §8 Manual QA Group A is the gate; these automated tests cover the
 * sub-set we can assert without a real browser:
 *   - Dialog renders all five providers with distinct warning text
 *   - Switching providers swaps the inline warning callout
 *   - Saving a token writes only that provider's localStorage key
 *   - "Clear token" wipes only the active provider's key
 *   - The token field is hidden for `manual`
 *   - Each warning is rendered verbatim (we sample the GitHub Models
 *     '30+ short prompts' paragraph since that is the canonical §5.6 edit)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { AISettingsDialog } from './AISettingsDialog';
import { useAIStore, _resetAIStoreForTesting } from '../ai/store/useAIStore';
import { _resetManualForTesting } from '../ai/providers/manual';
import { PROVIDERS } from '../ai/providers';

beforeEach(() => {
  for (const p of PROVIDERS) {
    if (p.tokenStorageKey) localStorage.removeItem(p.tokenStorageKey);
  }
  localStorage.removeItem('2dfea-ai-store');
  localStorage.removeItem('2dfea-ai-custom-openai-base-url');
  _resetManualForTesting();
  _resetAIStoreForTesting();
});

afterEach(() => {
  for (const p of PROVIDERS) {
    if (p.tokenStorageKey) localStorage.removeItem(p.tokenStorageKey);
  }
  localStorage.removeItem('2dfea-ai-store');
  _resetManualForTesting();
  _resetAIStoreForTesting();
});

describe('AISettingsDialog', () => {
  it('does not render when isOpen is false', () => {
    render(<AISettingsDialog isOpen={false} onClose={() => {}} />);
    expect(screen.queryByRole('dialog', { name: /AI Settings/i })).toBeNull();
  });

  it('renders all five providers in the dropdown', () => {
    render(<AISettingsDialog isOpen={true} onClose={() => {}} />);
    const select = screen.getByLabelText(/Provider/i) as HTMLSelectElement;
    const optionTexts = Array.from(select.options).map((o) => o.value);
    expect(optionTexts).toEqual([
      'github-models',
      'anthropic',
      'openai',
      'custom-openai-compatible',
      'manual',
    ]);
  });

  it('shows the canonical §5.6 GitHub Models warning verbatim', () => {
    render(<AISettingsDialog isOpen={true} onClose={() => {}} />);
    const warning = screen.getByTestId('ai-provider-warning');
    expect(warning.textContent).toContain('30+ short prompts per day');
    expect(warning.textContent).toContain('models.github.ai');
  });

  it('switching provider swaps the inline warning text', () => {
    render(<AISettingsDialog isOpen={true} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Provider/i), {
      target: { value: 'anthropic' },
    });
    const warning = screen.getByTestId('ai-provider-warning');
    expect(warning.textContent).toContain('Anthropic recommends using API keys server-side');
    expect(warning.textContent).not.toContain('30+ short prompts per day');
  });

  it('hides the token field for the manual provider', () => {
    render(<AISettingsDialog isOpen={true} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Provider/i), { target: { value: 'manual' } });
    expect(screen.queryByLabelText(/API key/i)).toBeNull();
  });

  it('shows the endpoint URL field only for custom-openai-compatible', () => {
    render(<AISettingsDialog isOpen={true} onClose={() => {}} />);
    expect(screen.queryByLabelText(/Endpoint URL/i)).toBeNull();
    fireEvent.change(screen.getByLabelText(/Provider/i), {
      target: { value: 'custom-openai-compatible' },
    });
    expect(screen.getByLabelText(/Endpoint URL/i)).toBeDefined();
  });

  it('saving a token writes the per-provider localStorage key (§5.14.7)', () => {
    render(<AISettingsDialog isOpen={true} onClose={() => {}} />);
    const input = screen.getByLabelText(/API key/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'ghp_validlooking' } });
    fireEvent.click(screen.getByRole('button', { name: /Save token/i }));
    expect(localStorage.getItem('2dfea-ai-token-github-models')).toBe('ghp_validlooking');
    expect(localStorage.getItem('2dfea-ai-token-anthropic')).toBeNull();
  });

  it('rejects a wrong-shape token before writing it (§5.14.8)', () => {
    render(<AISettingsDialog isOpen={true} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/API key/i), {
      target: { value: 'not-a-valid-pat' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save token/i }));
    expect(screen.getByRole('alert').textContent).toMatch(/PAT/);
    expect(localStorage.getItem('2dfea-ai-token-github-models')).toBeNull();
  });

  it('clear token wipes only the active provider key', () => {
    // Seed two providers.
    localStorage.setItem('2dfea-ai-token-github-models', 'ghp_a');
    localStorage.setItem('2dfea-ai-token-anthropic', 'sk-ant-b');
    render(<AISettingsDialog isOpen={true} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Clear token/i }));
    expect(localStorage.getItem('2dfea-ai-token-github-models')).toBeNull();
    expect(localStorage.getItem('2dfea-ai-token-anthropic')).toBe('sk-ant-b');
  });

  it('"Other..." selection reveals the free-text model field', () => {
    render(<AISettingsDialog isOpen={true} onClose={() => {}} />);
    const modelSelect = screen.getByLabelText(/^Model$/i) as HTMLSelectElement;
    fireEvent.change(modelSelect, { target: { value: '__other__' } });
    expect(document.getElementById('ai-model-input')).not.toBeNull();
  });

  it('"Clear conversation" empties the transcript', async () => {
    // Push two transcript entries via the manual path.
    const store = useAIStore.getState();
    store.setActiveProviderId('manual');
    const promise = store.send('hello');
    while (!(await import('../ai/providers/manual')).peekManualPending())
      await new Promise((r) => setTimeout(r, 0));
    const { peekManualPending: peek, submitManualResponse: submit } = await import('../ai/providers/manual');
    submit(peek()!.id, 'reply');
    await promise;
    expect(useAIStore.getState().transcript.length).toBe(2);

    render(<AISettingsDialog isOpen={true} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Clear conversation/i }));
    expect(useAIStore.getState().transcript).toEqual([]);
  });

  it('renders distinct warning text for every provider', () => {
    const seen = new Set<string>();
    for (const p of PROVIDERS) {
      _resetAIStoreForTesting();
      useAIStore.getState().setActiveProviderId(p.id);
      const { unmount } = render(<AISettingsDialog isOpen={true} onClose={() => {}} />);
      const warning = screen.getByTestId('ai-provider-warning');
      const text = warning.textContent ?? '';
      expect(text.length).toBeGreaterThan(20);
      expect(seen.has(text)).toBe(false);
      seen.add(text);
      unmount();
    }
  });

  it('the global notice is always present', () => {
    render(<AISettingsDialog isOpen={true} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: /AI Settings/i });
    expect(within(dialog).getByText(/Treat browser-stored API keys like browser-stored passwords/)).toBeDefined();
  });
});
