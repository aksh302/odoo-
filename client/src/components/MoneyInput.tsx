import { InputNumber } from 'antd'
import type { InputNumberProps } from 'antd'
import { toPaise, toRupees } from '../lib/money'

/**
 * Rupee input that reads and writes PAISE, so form values match the API directly.
 * The user types 560 -> the form value is 56000.
 * Use inside <Form.Item name="salesPrice"> like any input.
 */
export function MoneyInput({
  value,
  onChange,
  ...rest
}: Omit<InputNumberProps<number>, 'value' | 'onChange'> & {
  value?: number | null
  onChange?: (paise: number | null) => void
}) {
  return (
    <InputNumber<number>
      prefix="₹"
      min={0}
      precision={2}
      step={1}
      style={{ width: '100%' }}
      value={value == null ? null : toRupees(value)}
      onChange={(r) => onChange?.(r == null ? null : toPaise(r))}
      {...rest}
    />
  )
}
