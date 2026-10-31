import { Card, Typography } from 'antd'

/** Stand-in for pages not built yet. Replace each one with the real page. */
export function PlaceholderPage({ title, todo }: { title: string; todo: string }) {
  return (
    <>
      <Typography.Title level={3}>{title}</Typography.Title>
      <Card>
        <Typography.Text type="secondary">To build (SRS 9.7): {todo}</Typography.Text>
      </Card>
    </>
  )
}
