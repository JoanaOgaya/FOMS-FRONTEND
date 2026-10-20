import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  moduleName?: string;
  fallbackTitle?: string;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class AiErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[AI Layer ErrorBoundary Caught]:', error, errorInfo);
    }
  }

  public render() {
    if (this.state.hasError) {
      const title =
        this.props.fallbackTitle ||
        (this.props.moduleName ? `${this.props.moduleName} unavailable` : 'AI Intelligence Module Unavailable');
      return (
        <div
          role="alert"
          style={{
            padding: '24px 20px',
            borderRadius: 12,
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            color: '#991B1B',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.95rem' }}>
            <i className="ti ti-alert-triangle" style={{ fontSize: 20 }} />
            {title}
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#B91C1C', lineHeight: 1.5 }}>
            {this.props.fallbackMessage ||
              'This AI widget encountered an unexpected error. Core financial workflows remain unaffected.'}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              alignSelf: 'flex-start',
              marginTop: 4,
              padding: '6px 14px',
              borderRadius: 6,
              background: '#fff',
              border: '1px solid #FECACA',
              color: '#991B1B',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Retry Module
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AiErrorBoundary;
