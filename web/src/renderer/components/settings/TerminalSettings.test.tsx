// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mockSetTerminalFontFamily = vi.fn().mockResolvedValue(undefined);

vi.mock('../../preferences/context.js', () => ({
  usePreferences: () => ({
    terminalFontFamily: 'monospace',
    setTerminalFontFamily: mockSetTerminalFontFamily,
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const { TerminalSettings } = await import('./TerminalSettings.js');

describe('TerminalSettings', () => {
  it('renders the font family input with current value', () => {
    const { getByDisplayValue } = render(<TerminalSettings />);
    expect(getByDisplayValue('monospace')).toBeInTheDocument();
  });

  it('renders save button', () => {
    const { getByRole } = render(<TerminalSettings />);
    expect(getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('calls setTerminalFontFamily on save', async () => {
    const { getByRole, getByDisplayValue } = render(<TerminalSettings />);
    const input = getByDisplayValue('monospace');
    fireEvent.change(input, { target: { value: 'MesloLGS NF' } });
    fireEvent.submit(getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(mockSetTerminalFontFamily).toHaveBeenCalledWith('MesloLGS NF');
    });
  });

  it('shows success message after save', async () => {
    const { getByRole, getByText } = render(<TerminalSettings />);
    fireEvent.submit(getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(getByText('Saved.')).toBeInTheDocument();
    });
  });
});
