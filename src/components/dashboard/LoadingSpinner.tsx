import React, { forwardRef } from 'react';

interface LoadingSpinnerProps {
  message?: string;
}

export const LoadingSpinner = forwardRef<HTMLDivElement, LoadingSpinnerProps>(
  ({ message = 'Carregando dados...' }, ref) => {
    return (
      <div ref={ref} className="loading-section">
        <div className="spinner" />
        <p className="text-muted-foreground">{message}</p>
      </div>
    );
  }
);

LoadingSpinner.displayName = 'LoadingSpinner';
