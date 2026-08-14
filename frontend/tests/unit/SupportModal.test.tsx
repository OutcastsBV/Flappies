import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SupportModal from '../../components/admin/SupportModal';
import { submitSupportRequest } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  submitSupportRequest: vi.fn(),
}));

describe('SupportModal', () => {
  beforeEach(() => {
    vi.mocked(submitSupportRequest).mockReset();
  });

  it('defaults to the Bug report category', () => {
    render(<SupportModal onClose={() => {}} />);

    expect(screen.getByText('Bug report')).toHaveClass('bg-black');
  });

  it('requires a subject before submitting', async () => {
    render(<SupportModal onClose={() => {}} />);

    fireEvent.click(screen.getByText('Send'));

    expect(await screen.findByText('Subject is required')).toBeInTheDocument();
    expect(submitSupportRequest).not.toHaveBeenCalled();
  });

  it('requires a message before submitting', async () => {
    render(<SupportModal onClose={() => {}} />);

    const [subjectInput] = screen.getAllByRole('textbox');
    fireEvent.change(subjectInput, { target: { value: 'Broken button' } });
    fireEvent.click(screen.getByText('Send'));

    expect(await screen.findByText('Message is required')).toBeInTheDocument();
    expect(submitSupportRequest).not.toHaveBeenCalled();
  });

  it('submits the trimmed subject/message with the selected category', async () => {
    vi.mocked(submitSupportRequest).mockResolvedValue({ message: 'Support request sent' } as never);

    render(<SupportModal onClose={() => {}} />);

    fireEvent.click(screen.getByText('Feature request'));
    const [subjectInput, messageInput] = screen.getAllByRole('textbox');
    fireEvent.change(subjectInput, { target: { value: '  Add dark mode  ' } });
    fireEvent.change(messageInput, { target: { value: '  Would love a dark theme  ' } });
    fireEvent.click(screen.getByText('Send'));

    await waitFor(() =>
      expect(submitSupportRequest).toHaveBeenCalledWith({
        subject: 'Add dark mode',
        message: 'Would love a dark theme',
        category: 'FEATURE',
      })
    );
    expect(await screen.findByText(/Thanks!/)).toBeInTheDocument();
  });

  it('shows an error message when the API call fails', async () => {
    vi.mocked(submitSupportRequest).mockRejectedValue(
      new Error('Support email is not configured for this deployment')
    );

    render(<SupportModal onClose={() => {}} />);

    const [subjectInput, messageInput] = screen.getAllByRole('textbox');
    fireEvent.change(subjectInput, { target: { value: 'Help' } });
    fireEvent.change(messageInput, { target: { value: 'It broke' } });
    fireEvent.click(screen.getByText('Send'));

    expect(
      await screen.findByText('Support email is not configured for this deployment')
    ).toBeInTheDocument();
  });
});
