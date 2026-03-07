// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import {
  Skeleton,
  ProjectListSkeleton,
  ProjectDetailSkeleton,
  TaskDetailSkeleton,
  SidebarSkeleton,
} from './Skeleton.js';

afterEach(cleanup);

describe('Skeleton', () => {
  it('renders with animate-pulse class', () => {
    render(<Skeleton />);
    const el = screen.getByTestId('skeleton');
    expect(el).toBeInTheDocument();
    expect(el.className).toContain('animate-pulse');
  });

  it('applies custom className', () => {
    render(<Skeleton className="h-8 w-32" />);
    const el = screen.getByTestId('skeleton');
    expect(el.className).toContain('h-8');
    expect(el.className).toContain('w-32');
  });

  it('has role=status for accessibility', () => {
    render(<Skeleton />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('ProjectListSkeleton', () => {
  it('renders the skeleton', () => {
    render(<ProjectListSkeleton />);
    expect(screen.getByTestId('project-list-skeleton')).toBeInTheDocument();
  });

  it('displays multiple skeleton items', () => {
    render(<ProjectListSkeleton />);
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(2);
  });
});

describe('ProjectDetailSkeleton', () => {
  it('renders the skeleton', () => {
    render(<ProjectDetailSkeleton />);
    expect(screen.getByTestId('project-detail-skeleton')).toBeInTheDocument();
  });
});

describe('TaskDetailSkeleton', () => {
  it('renders the skeleton', () => {
    render(<TaskDetailSkeleton />);
    expect(screen.getByTestId('task-detail-skeleton')).toBeInTheDocument();
  });
});

describe('SidebarSkeleton', () => {
  it('renders the skeleton', () => {
    render(<SidebarSkeleton />);
    expect(screen.getByTestId('sidebar-skeleton')).toBeInTheDocument();
  });
});
