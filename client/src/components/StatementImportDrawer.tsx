import { FileTextOutlined } from '@ant-design/icons'
import { Alert, App, Button, Checkbox, Drawer, Input, Result, Select, Space, Table, Tag, Typography, Upload } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { billingApi, methodLabel } from '../api/billing'
import { api } from '../api/client'
import { parseError } from '../api/errors'
import { brand } from '../brand/theme'
import { formatINR } from '../lib/money'
import { matchStatement, readStatement } from '../lib/statement'
import type { StatementMatch } from '../lib/statement'
import type { Invoice, Paged } from '../lib/types'

interface Row extends StatementMatch {
  key: number
  invoiceId?: number
  include: boolean
}

/**
 * Bank statement import: every credit in the statement is matched to an unpaid invoice.
 * Staff tick the ones to record and save them all at once.
 */
export function StatementImportDrawer({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { message } = App.useApp()
  const [stage, setStage] = useState<'input' | 'review' | 'done'>('input')
  const [raw, setRaw] = useState('')
  const [unpaid, setUnpaid] = useState<Invoice[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [skipped, setSkipped] = useState(0)
  const [saving, setSaving] = useState(false)
  const [outcome, setOutcome] = useState<{ ok: number; failed: { row: number; reason: string }[] } | null>(null)

  useEffect(() => {
    if (!open) return
    setStage('input')
    setRaw('')
    setRows([])
    setOutcome(null)
    api
      .get<Paged<Invoice>>('/invoices', { params: { status: 'CONFIRMED', limit: 100 } })
      .then((r) => setUnpaid(r.data.data.filter((i) => i.amountPaid < i.total)))
      .catch(() => setUnpaid([]))
  }, [open])

  const analyse = (text: string) => {
    const { credits, skipped: s } = readStatement(text)
    const matched = matchStatement(credits, unpaid)
    setRows(matched.map((m, i) => ({ ...m, key: i, invoiceId: m.match?.invoice.id, include: m.confidence !== 'none' })))
    setSkipped(s)
    setStage('review')
  }

  /** A realistic CSV built from invoices that are unpaid right now, plus some noise. */
  const sample = useMemo(() => {
    if (!unpaid.length) return ''
    const d = (n: number) => dayjs().subtract(n, 'day').format('DD/MM/YYYY')
    const rs = (p: number) => (p / 100).toFixed(2)
    const name = (i: Invoice) => (i.customerSnapshot.company || i.customerSnapshot.name).toUpperCase()
    const [a, b, c, e] = unpaid
    const rows = [
      'Txn Date,Description,Ref No./Cheque No.,Debit,Credit,Balance',
      a && `${d(4)},"NEFT-N30${a.id}4512-${name(a)}-${a.number}",N30${a.id}4512,,"${rs(a.total - a.amountPaid)}",`,
      `${d(4)},ATM CASH WITHDRAWAL,,"5000.00",,`,
      b && `${d(3)},UPI/4309${String(b.id).padStart(8, '0')}/${name(b)}/payments@okbank,4309${String(b.id).padStart(8, '0')},,"${rs(b.total - b.amountPaid)}",`,
      `${d(2)},BANK CHARGES INCL GST,,"59.00",,`,
      c && `${d(2)},IMPS/P2A/${name(c)}/part payment,61234${c.id},,"${rs(Math.floor((c.total - c.amountPaid) / 2))}",`,
      e && `${d(1)},"CHQ DEP 004512 ${name(e)}",004512,,"${rs(e.total - e.amountPaid)}",`,
      `${d(1)},UPI/430998877665/RANDOM PERSON/refund,430998877665,,"1250.00",`,
    ]
    return rows.filter(Boolean).join('\n')
  }, [unpaid])

  const chosen = rows.filter((r) => r.include && r.invoiceId)
  const total = chosen.reduce((a, r) => a + r.line.amount, 0)

  const recordAll = async () => {
    setSaving(true)
    let ok = 0
    const failed: { row: number; reason: string }[] = []
    // One at a time, so each invoice's balance is checked after the previous payment.
    for (const r of chosen) {
      try {
        await billingApi.recordPayment({
          invoiceId: r.invoiceId!,
          method: r.line.method,
          amount: r.line.amount,
          date: r.line.date && r.line.date <= dayjs().format('YYYY-MM-DD') ? r.line.date : dayjs().format('YYYY-MM-DD'),
          reference: r.line.reference,
          note: 'Imported from bank statement',
        })
        ok++
      } catch (err) {
        failed.push({ row: r.line.row, reason: parseError(err).message })
      }
    }
    setOutcome({ ok, failed })
    setStage('done')
    setSaving(false)
    if (ok) message.success(`Recorded ${ok} payment${ok === 1 ? '' : 's'}`)
  }

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const columns: ColumnsType<Row> = [
    {
      title: '',
      width: 40,
      render: (_, r) => <Checkbox checked={r.include} disabled={!r.invoiceId} onChange={(e) => update(r.key, { include: e.target.checked })} aria-label="Record this payment" />,
    },
    { title: 'Date', render: (_, r) => <span className="whitespace-nowrap">{r.line.date ? dayjs(r.line.date).format('D MMM') : '—'}</span> },
    {
      title: 'Statement line',
      render: (_, r) => (
        <span className="text-sm">
          {r.line.narration}
          <Typography.Text type="secondary" className="block text-xs">
            {methodLabel(r.line.method)}
            {r.line.reference ? `, ref ${r.line.reference}` : ''}
          </Typography.Text>
        </span>
      ),
    },
    { title: 'Amount', align: 'right', render: (_, r) => <strong className="whitespace-nowrap">{formatINR(r.line.amount)}</strong> },
    {
      title: 'Invoice',
      width: 280,
      render: (_, r) => (
        <div>
          <Select
            size="small"
            className="w-full"
            allowClear
            placeholder="Not matched. Choose one"
            value={r.invoiceId}
            onChange={(v) => update(r.key, { invoiceId: v, include: !!v })}
            showSearch={{ optionFilterProp: 'label' }}
            options={unpaid.map((i) => ({
              value: i.id,
              label: `${i.number}  ${i.customerSnapshot.company || i.customerSnapshot.name}  ${formatINR(i.total - i.amountPaid)} due`,
            }))}
          />
          {r.match && r.invoiceId === r.match.invoice.id && (
            <Typography.Text type="secondary" className="mt-1 block text-xs">
              {r.match.reasons.join('. ')}
            </Typography.Text>
          )}
        </div>
      ),
    },
    {
      title: 'Match',
      render: (_, r) =>
        r.invoiceId && r.match && r.invoiceId === r.match.invoice.id ? (
          <Tag color={r.confidence === 'high' ? 'success' : 'warning'}>{r.confidence === 'high' ? 'Sure' : 'Check'}</Tag>
        ) : r.invoiceId ? (
          <Tag>Chosen</Tag>
        ) : (
          <Tag>None</Tag>
        ),
    },
  ]

  const sure = rows.filter((r) => r.confidence === 'high').length
  const check = rows.filter((r) => r.confidence === 'medium').length
  const none = rows.filter((r) => r.confidence === 'none').length

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Import bank statement"
      size={stage === 'review' ? 1100 : 620}
      destroyOnHidden
      extra={
        stage === 'review' && (
          <Space>
            <Button onClick={() => setStage('input')}>Back</Button>
            <Button type="primary" loading={saving} disabled={!chosen.length} onClick={recordAll}>
              Record {chosen.length} payment{chosen.length === 1 ? '' : 's'}, {formatINR(total)}
            </Button>
          </Space>
        )
      }
    >
      {stage === 'input' && (
        <>
          <Typography.Paragraph type="secondary">
            Upload the CSV your bank lets you download, or paste rows copied from a statement. Every credit is matched to an unpaid invoice; debits and balances are ignored. You review the matches before anything is saved.
          </Typography.Paragraph>
          <Upload.Dragger
            accept=".csv,.txt,text/csv,text/plain"
            showUploadList={false}
            beforeUpload={(file) => {
              file.text().then((t) => {
                setRaw(t)
                analyse(t)
              })
              return false
            }}
          >
            <p className="ant-upload-drag-icon">
              <FileTextOutlined style={{ color: brand.green }} />
            </p>
            <p className="ant-upload-text">Drop a statement CSV here</p>
            <p className="ant-upload-hint">Columns like Date, Narration or Description, Ref, Debit, Credit are recognised automatically.</p>
          </Upload.Dragger>
          <div className="my-5 text-center">
            <Typography.Text type="secondary">or paste rows</Typography.Text>
          </div>
          <Input.TextArea rows={7} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={'Txn Date,Description,Ref No.,Debit,Credit,Balance\n28/10/2026,NEFT-N3026...-SUNRISE TRADERS,N3026...,,79826.18,'} />
          <Space className="mt-3" wrap>
            <Button type="primary" disabled={!raw.trim()} onClick={() => analyse(raw)}>
              Match payments
            </Button>
            {sample && (
              <Button onClick={() => setRaw(sample)}>Use a sample statement</Button>
            )}
          </Space>
        </>
      )}

      {stage === 'review' && (
        <>
          {rows.length === 0 ? (
            <Alert type="warning" showIcon title="No credits found. Check the file is a statement with a Credit or Amount column." />
          ) : (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                <Tag color="success">{sure} sure</Tag>
                <Tag color="warning">{check} to check</Tag>
                <Tag>{none} not matched</Tag>
                <Typography.Text type="secondary">{skipped} debit or balance rows ignored.</Typography.Text>
              </div>
              <Table<Row> rowKey="key" size="small" pagination={false} dataSource={rows} columns={columns} scroll={{ x: 900 }} rowClassName={(r) => (r.include ? '' : 'opacity-60')} />
              <Typography.Paragraph type="secondary" className="mt-3 text-xs">
                "Check" means the customer matched but the amount doesn't equal the balance, so it's probably a part payment. Unticked rows aren't recorded.
              </Typography.Paragraph>
            </>
          )}
        </>
      )}

      {stage === 'done' && outcome && (
        <Result
          status={outcome.failed.length ? 'warning' : 'success'}
          title={`Recorded ${outcome.ok} payment${outcome.ok === 1 ? '' : 's'}`}
          subTitle={
            outcome.failed.length ? (
              <ul className="m-0 inline-block pl-5 text-left">
                {outcome.failed.map((f) => (
                  <li key={f.row}>
                    Row {f.row}: {f.reason}
                  </li>
                ))}
              </ul>
            ) : (
              'Every selected statement line is now recorded against its invoice.'
            )
          }
          extra={
            <Button type="primary" onClick={onDone}>
              Done
            </Button>
          }
        />
      )}
    </Drawer>
  )
}
