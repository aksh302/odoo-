import type { Rule } from 'antd/es/form'

// FR-1.3: at least 9 characters, an uppercase letter, a lowercase letter and a special character.
export const PASSWORD_HINT =
  'At least 9 characters, with an uppercase letter, a lowercase letter and a special character.'

export function passwordProblems(pw: string): string[] {
  const problems: string[] = []
  if (pw.length < 9) problems.push('at least 9 characters')
  if (!/[A-Z]/.test(pw)) problems.push('an uppercase letter')
  if (!/[a-z]/.test(pw)) problems.push('a lowercase letter')
  if (!/[^A-Za-z0-9]/.test(pw)) problems.push('a special character')
  return problems
}

/** Ant Design form rule using the same check as the API. */
export const passwordRule: Rule = {
  required: true,
  validator: (_, value: string) => {
    if (!value) return Promise.reject(new Error('Please enter a password'))
    const p = passwordProblems(value)
    return p.length ? Promise.reject(new Error(`Needs ${p.join(', ')}`)) : Promise.resolve()
  },
}
