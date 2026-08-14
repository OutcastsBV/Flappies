import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import NotFound from '../../app/not-found';

describe('NotFound page', () => {
  it('renders a link back to login', () => {
    render(<NotFound />);
    expect(screen.getByText('Page not found')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /back to login/i });
    expect(link).toHaveAttribute('href', '/login');
  });
});
