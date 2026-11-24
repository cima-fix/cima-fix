import { zValidator } from '@hono/zod-validator'
import type { ValidationTargets } from 'hono'
import type { ZodType } from 'zod'
import { AppError } from './errors.ts'

type IssueLike = { message: string; path: readonly PropertyKey[] }

export function zodToAppError(error: {
  issues: readonly IssueLike[]
}): AppError {
  const issue = error.issues[0]
  const field = issue?.path.map(String).join('.') || undefined
  return new AppError(
    400,
    'INVALID_INPUT',
    issue?.message ?? 'Los datos enviados no son válidos.',
    field,
  )
}

/** Route validator that fails with the standard error format (400). Schemas live in src/shared/schemas. */
export const validate = <
  Target extends keyof ValidationTargets,
  Schema extends ZodType,
>(
  target: Target,
  schema: Schema,
) =>
  zValidator(target, schema, (result) => {
    if (!result.success) throw zodToAppError(result.error)
  })
