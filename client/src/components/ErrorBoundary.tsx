import { Button, Result } from 'antd'
import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

/**
 * Catches a crash in one page so the rest of the app keeps working.
 * Layouts wrap their page in this with key={pathname}, so moving to
 * another page clears the error.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <Result
        status="warning"
        title="This page hit a problem"
        subTitle="Your data is safe. Reload the page, or go back and try again. If it keeps happening, note what you clicked and tell the team."
        extra={[
          <Button key="reload" type="primary" onClick={() => window.location.reload()}>
            Reload page
          </Button>,
          <Button key="back" onClick={() => window.history.back()}>
            Go back
          </Button>,
        ]}
      />
    )
  }
}
