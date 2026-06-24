import { useWatch, type Control, type FieldValues } from 'react-hook-form'
import type { ZodTypeAny } from 'zod'

/**
 * 表单是否整体通过给定 zod schema 校验。
 * 以 schema 为唯一真源（不重复实现校验规则），返回布尔随字段变化实时更新。
 * 用途：把「表单是否就绪」与具体页面/组件解耦，如门控人机校验、提交按钮等。
 */
export function useFormValid<T extends FieldValues>(control: Control<T>, schema: ZodTypeAny): boolean {
  const values = useWatch({ control })
  return schema.safeParse(values).success
}
