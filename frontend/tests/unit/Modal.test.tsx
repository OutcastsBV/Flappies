import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Modal from '../../components/Modal';

describe('Modal', () => {
  it('renders the title and children', () => {
    render(
      <Modal title="Edit product" onClose={() => {}}>
        <p>Modal body</p>
      </Modal>
    );

    expect(screen.getByText('Edit product')).toBeInTheDocument();
    expect(screen.getByText('Modal body')).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal title="Edit product" onClose={onClose}>
        <p>Modal body</p>
      </Modal>
    );

    fireEvent.click(screen.getByText('✕'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
